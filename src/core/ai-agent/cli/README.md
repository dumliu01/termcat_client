# TermCat AI Agent CLI

基于 ai-agent 模块的命令行客户端，用于在终端中交互式测试 AI Agent。通过 SSH 直连目标主机执行命令，将结果回报给 agent_server。

## 前置条件

- Node.js 18+
- termcat_server 已启动（默认 `http://localhost:8080`）
- termcat_agent_server 已启动
- 目标 SSH 主机可达

## 启动命令

```bash
cd termcat_client
npx tsx src/modules/ai-agent/cli/cli-agent.ts [options]
```

## 参数说明

| 参数 | 说明 | 默认值 |
|------|------|--------|
| `--server <url>` | API/WebSocket 服务地址 | `http://localhost:8080` |
| `--email <email>` | 登录邮箱 | 交互式输入 |
| `--password <pwd>` | 登录密码 | 交互式输入 |
| `--host <host>` | SSH 目标主机地址 | 交互式输入 |
| `--ssh-port <port>` | SSH 端口 | `22` |
| `--ssh-user <user>` | SSH 用户名 | 交互式输入 |
| `--ssh-password <pwd>` | SSH 密码 | - |
| `--ssh-key <path>` / `-i <path>` | SSH 私钥文件路径 | 自动查找 `~/.ssh/id_rsa` 等 |
| `--mode <mode>` | AI 模式：`agent`（运维操作） / `normal`（问答） | `agent` |
| `--model <model>` | AI 模型名称 | `glm-4-flash` |
| `--session <id>` | 会话 ID | `cli-<timestamp>` |
| `--auto` | 自动执行模式（跳过命令确认） | `false` |
| `--debug` | 显示原始 WebSocket 消息 | `false` |
| `--log <file>` | 将执行日志写入文件（JSON Lines 格式） | - |
| `--help` | 显示帮助信息 | - |

## 使用示例

### 基础用法（交互式输入凭据）

```bash
npx tsx src/modules/ai-agent/cli/cli-agent.ts
```

启动后会依次提示输入：Email、Password、SSH Host、SSH User、SSH Password/Key。

### 使用私钥连接

```bash
npx tsx src/modules/ai-agent/cli/cli-agent.ts \
  --server http://localhost:8080 \
  --email admin@example.com \
  --password mypassword \
  --host 192.168.1.100 \
  --ssh-user root \
  --ssh-key ~/.ssh/id_rsa
```

```bash
npx tsx src/modules/ai-agent/cli/cli-agent.ts \
  --server http://localhost:8080 \
  --email a@qq.com \
  --password abc123 \
  --host 193.112.187.26 \
  --ssh-user dum \
  --ssh-key ~/.ssh/dum2022
```

### 使用密码连接 + 自动执行

```bash
npx tsx src/modules/ai-agent/cli/cli-agent.ts \
  --server http://localhost:8080 \
  --email admin@example.com \
  --password mypassword \
  --host 192.168.1.100 \
  --ssh-user dum \
  --ssh-password mysshpass \
  --auto
```

`--auto` 模式下 AI 生成的命令会自动执行，无需逐条确认。

### 调试模式 + 日志记录

```bash
npx tsx src/modules/ai-agent/cli/cli-agent.ts \
  --host 192.168.1.100 \
  --ssh-user dum \
  -i ~/.ssh/id_rsa \
  --debug \
  --log ./agent-debug.jsonl
```

### 指定模型和模式

```bash
npx tsx src/modules/ai-agent/cli/cli-agent.ts \
  --host 192.168.1.100 \
  --ssh-user dum \
  -i ~/.ssh/id_rsa \
  --mode normal \
  --model glm-4-plus
```

## 交互式 REPL 命令

进入交互界面后，直接输入自然语言提问即可。以 `/` 开头的为内置命令：

| 命令 | 说明 |
|------|------|
| `/help` | 显示帮助信息 |
| `/quit` / `/exit` / `/q` | 退出程序 |
| `/mode agent\|normal` | 切换 AI 模式 |
| `/model <name>` | 切换 AI 模型 |
| `/auto` | 开关自动执行模式 |
| `/status` | 显示当前状态（模式、SSH 连接、会话等） |
| `/stop` | 停止当前正在执行的任务 |

## 交互流程

```
> 查看磁盘使用情况            ← 输入自然语言问题
[Thinking...]                 ← AI 分析需求
Plan: 查看磁盘使用情况 (1 steps)
  Step 1: 使用 df 命令查看     ← AI 生成执行计划
Execute step 1: df -h [y/n]?  ← 确认执行（--auto 模式跳过）
y
[Step 1] ✓ exit=0             ← 命令执行结果
Filesystem      Size  Used ...
[Complete] 任务完成             ← AI 汇总结果
> _                            ← 等待下一个问题
```

## SSH 认证优先级

1. `--ssh-key` / `-i` 指定的私钥文件
2. `~/.ssh/id_rsa`、`~/.ssh/id_ed25519`、`~/.ssh/id_ecdsa`（自动查找）
3. `--ssh-password` 指定的密码
4. 交互式输入密码

## OS 自动检测

SSH 连接成功后，CLI 会自动检测远程服务器的操作系统信息（类型、版本、Shell），并将这些信息传递给 AI Agent，使其能根据目标系统生成正确的命令（如 Ubuntu 用 `apt`，CentOS 用 `yum`）。

```
✓ SSH connected to dum@192.168.1.100:22 (key)
ℹ Remote OS: linux/ubuntu 22.04 (bash)
```
