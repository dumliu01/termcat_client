# SSH 配置集成方案

## 概述

termcat 使用 ssh2 库直连 SSH 服务器，不会读取系统 `~/.ssh/config` 文件。这导致两个问题：

1. **Agent Forwarding 缺失**：跳板机登录脚本依赖 `SSH_AUTH_SOCK`，Mac 终端通过 `~/.ssh/config` 的 `ForwardAgent yes` 自动启用，termcat 需要手动处理
2. **Locale 环境变量缺失**：Mac 终端 SSH 会自动发送 `LANG=en_US.UTF-8`，ssh2 默认不发送，导致远程 Python 脚本输出中文时报 `UnicodeEncodeError: 'ascii' codec`

本方案通过解析 `~/.ssh/config` + 补发 `LANG` 环境变量，两步解决上述问题。

---

## 问题一：SSH Config 解析与 Agent Forwarding

### 问题分析

Mac 终端执行 `ssh access.oa.zego.im` 时，OpenSSH 客户端会：

1. 读取 `~/.ssh/config`
2. 匹配 `Host access.oa.zego.im`（或通配符 `Host *`）
3. 应用对应指令（如 `ForwardAgent yes`、`IdentityFile`、`ServerAliveInterval` 等）

termcat 使用 ssh2 库直连，完全绕过了这个流程。之前的临时方案是硬编码 `agentForward: true`，但这会对所有主机无差别启用 agent 转发，存在安全风险。

### 解决方案

新增 `ssh-config-parser.ts` 模块，解析 `~/.ssh/config`，按主机匹配返回 ssh2 可用的连接选项。

#### 依赖

```bash
cd termcat_client && npm install ssh-config
```

[ssh-config](https://www.npmjs.com/package/ssh-config)：纯 JS 包，自带 TypeScript 声明，支持 `Host` / `Match` 指令匹配。

#### 新建文件：`src/main/ssh-config-parser.ts`

```
SSHConfigParser 类
├── constructor(configPath?)     # 默认 ~/.ssh/config
├── reload()                     # mtime 缓存，文件未修改不重新解析
└── resolve(hostname)            # 返回 ResolvedSSHOptions

getSSHAgentSocket()              # 跨平台获取 agent socket
sshConfigParser                  # 全局单例导出
```

**`resolve(hostname)` 返回的选项：**

| SSH Config 指令 | ssh2 选项 | 说明 |
|---|---|---|
| `ForwardAgent yes` | `agentForward: true` + `agent: $SSH_AUTH_SOCK` | 仅在 config 中明确 `yes` 时启用 |
| `IdentityFile ~/.ssh/id_rsa` | `privateKey: Buffer` | 读取文件内容，仅在 UI 未提供密钥时使用 |
| `ServerAliveInterval 60` | `keepaliveInterval: 60000` | 秒转毫秒 |
| `HostName` / `Port` / `User` | 预留字段 | 当前 UI 始终提供，未来可支持别名连接 |

**优先级规则：UI 配置 > SSH config 文件**

用户在 UI 中填写的密码/密钥始终优先于 SSH config 中的 `IdentityFile`。

#### 修改文件：`src/main/ssh-service.ts`

**`connect()` 方法**（入口）：

```typescript
// 解析 ~/.ssh/config 中匹配的配置
const resolvedTarget = sshConfigParser.resolve(config.host);
const resolvedJump = config.jumpHost ? sshConfigParser.resolve(config.jumpHost.host) : undefined;

if (config.jumpHost) {
  return this.connectViaJumpHost(config, resolvedTarget, resolvedJump!);
}
return this.connectDirect(config, resolvedTarget);
```

**`connectDirect()` 方法**（直连）：

```typescript
// 移除硬编码，改为按 SSH config 有条件启用
const connectConfig: any = {
  host: config.host,
  port: config.port,
  username: config.username,
  readyTimeout: 10000,
  keepaliveInterval: resolved.keepaliveInterval ?? 10000,
  tryKeyboard: true,
};

// SSH config 中的 agent forwarding
if (resolved.agentForward) {
  connectConfig.agentForward = true;
  connectConfig.agent = resolved.agent;
}

// 认证：UI 配置优先 > SSH config IdentityFile
if (config.password) {
  connectConfig.password = config.password;
}
if (config.privateKey) {
  connectConfig.privateKey = config.privateKey;
} else if (resolved.privateKey) {
  connectConfig.privateKey = resolved.privateKey;
}
```

**`connectViaJumpHost()` 方法**（跳板机）：

跳板机连接和目标主机连接分别使用各自的 `resolve()` 结果，逻辑同上。

### 降级行为

- `~/.ssh/config` 文件不存在 → 静默跳过，`resolve()` 返回空对象，行为与修改前一致（无 agent forwarding）
- 文件解析失败 → 打印 WARN 日志，返回空对象
- 指令不存在（如未配置 `ForwardAgent`）→ 对应字段为 `undefined`，不设置

---

## 问题二：远程 Shell Unicode 编码错误

### 问题现象

通过 termcat 连接跳板机后执行 `s dum` 命令：

```
UnicodeEncodeError: 'ascii' codec can't encode characters in position 5-27: ordinal not in range(128)
[27093] Failed to execute script 's' due to unhandled exception!
```

同样的命令在 Mac 终端中正常工作。

### 根因分析

Mac 终端执行 `ssh` 时，OpenSSH 客户端会通过 SSH 协议的 "env" channel request 发送本地的 `LANG` 环境变量到远程服务器（默认行为，由 `ssh_config` 的 `SendEnv LANG LC_*` 控制）。

远程 shell 拿到 `LANG=en_US.UTF-8` 后，Python 的 `sys.stdout.encoding` 为 `utf-8`，输出中文正常。

termcat 使用 ssh2 的 `client.shell()` 时，只传了 pseudo-tty 选项（`term`、`cols`、`rows`），没有传 `env`。远程 shell 的 `LANG` 未设置，Python 回退到 ASCII 编码，输出中文时触发 `UnicodeEncodeError`。

### 解决方案

在 `client.shell()` 调用中，通过第二个参数 `ShellOptions.env` 发送 `LANG` 环境变量：

```typescript
// 构建 locale 环境变量
const env: Record<string, string> = {};
const lang = process.env.LANG || process.env.LC_ALL;
if (lang) {
  env.LANG = lang;
} else {
  env.LANG = 'en_US.UTF-8';
}

connection.client.shell({
  term: 'xterm-256color',
  cols: 80,
  rows: 24,
}, { env }, (err, stream) => {
  // ...
});
```

**关键点**：ssh2 的 `shell()` 签名为 `shell(window: PseudoTtyOptions, options: ShellOptions, callback)`，`env` 属于 `ShellOptions`（第二个参数），不能放在 `PseudoTtyOptions`（第一个参数）中。

### 服务端兼容性

SSH 协议的 env channel request 需要服务端 `sshd_config` 中有对应的 `AcceptEnv` 配置。大多数 Linux 发行版默认配置：

```
# /etc/ssh/sshd_config
AcceptEnv LANG LC_*
```

- Ubuntu / Debian：默认接受
- CentOS / RHEL：默认接受
- Alpine：可能需要手动配置

如果服务端不接受 `LANG`，env request 会被**静默忽略**（不报错），Python 仍会回退到 ASCII。

### 后备方案（如需）

如果 env channel request 方式对某些服务器无效，可在 shell 创建后发送命令：

```typescript
stream.write('export LANG=en_US.UTF-8\n');
```

缺点是命令和输出会显示在终端中。当前方案已覆盖绝大多数场景，暂不启用后备。

---

## 变更文件清单

| 文件 | 操作 | 说明 |
|---|---|---|
| `package.json` | 修改 | 添加 `ssh-config` 依赖 |
| `src/main/ssh-config-parser.ts` | **新建** | SSH config 解析模块 |
| `src/main/ssh-service.ts` | 修改 | 集成解析器 + 补发 LANG 环境变量 |

## 验证方式

1. **Agent Forwarding**：连接在 `~/.ssh/config` 中配置了 `ForwardAgent yes` 的主机，验证跳板机脚本不再报 `SSH_AUTH_SOCK` 错误
2. **无 ForwardAgent**：连接未配置 `ForwardAgent` 的主机，确认 agent 转发未被错误启用
3. **Unicode 编码**：连接跳板机后执行 `s dum`，确认中文输出正常、不再报 `UnicodeEncodeError`
4. **无 SSH config 文件**：删除/重命名 `~/.ssh/config` 后连接，确认正常工作（静默降级）
5. **IdentityFile 回退**：UI 不填密钥，SSH config 中配置了 `IdentityFile`，确认能自动使用
