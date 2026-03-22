# TermCat Client 日志规范

## 1. 概述

本文档定义了 **TermCat Client** (Electron + React + TypeScript) 的日志规范，基于全局 [LOGGING_SPECIFICATION.md](../docs/LOGGING_SPECIFICATION.md) 针对客户端场景的具体实现。

**核心原则：**
- 所有控制台日志必须通过 `logger.ts` 输出，禁止直接使用 `console.log/error/warn/info`
- 采用结构化 JSON 格式，便于日志收集和分析
- 支持模块化 Debug 日志开关，按需启用

---

## 2. 日志级别

### 2.1 级别定义

| 级别 | 值 | 使用场景 | 开发环境 | 生产环境 |
|------|-----|----------|----------|----------|
| **DEBUG** | 0 | 详细的调试信息、变量值、函数调用 | ✅ 启用 | ❌ 禁用 |
| **INFO** | 1 | 一般信息、业务流程、用户操作 | ✅ 启用 | ✅ 启用 |
| **WARN** | 2 | 警告信息、可恢复错误、性能问题 | ✅ 启用 | ✅ 启用 |
| **ERROR** | 3 | 错误信息、异常情况、失败操作 | ✅ 启用 | ✅ 启用 |

### 2.2 级别使用指南

**DEBUG:**
- 记录详细的执行流程
- 记录变量值和中间状态
- 仅在排查问题时临时启用
- 按模块控制开关

**INFO:**
- 服务启动/停止
- SSH 连接/断开
- API 请求完成
- 用户重要操作
- 文件传输开始/完成

**WARN:**
- 可恢复的错误（如重试后成功）
- 性能问题（如响应慢）
- 配置警告
- 认证信息过期

**ERROR:**
- SSH 连接失败
- API 请求失败
- 认证失败
- 文件传输失败
- 未捕获的异常

---

## 3. 日志格式

### 3.1 JSON 结构化格式

```json
{
  "timestamp": "2026-02-08T10:30:00.123Z",
  "level": "INFO",
  "event": "ssh.connection.established",
  "error": 0,
  "msg": "SSH connection established successfully",
  "module": "ssh",
  "session_id": "ssh-1234567890-abc",
  "host_id": "host-001",
  "host": "192.168.1.100",
  "username": "admin",
  "caller": "sshService.ts:76:connect"
}
```

### 3.2 字段说明

| 字段 | 类型 | 必需 | 说明 |
|------|------|------|------|
| `timestamp` | string | ✅ | ISO 8601 格式时间戳，精确到毫秒 |
| `level` | string | ✅ | 日志级别：DEBUG/INFO/WARN/ERROR |
| `event` | string | ✅ | 事件名称，格式：`模块.操作.状态` |
| `error` | number | ✅ | 错误码：0 表示成功，非 0 表示错误 |
| `msg` | string | ✅ | 消息描述，简洁明了 |
| `module` | string | ✅ | 模块名称：ssh/terminal/http/ai/file/auth/ui |
| `session_id` | string | ❌ | SSH 会话 ID |
| `host_id` | string | ❌ | 主机 ID |
| `host` | string | ❌ | 主机地址 |
| `username` | string | ❌ | 用户名 |
| `caller` | string | ❌ | 调用位置：文件名:行号:列号 |
| `latency_ms` | number | ❌ | 操作耗时（毫秒） |
| `extra` | object | ❌ | 额外上下文信息 |

### 3.3 控制台输出格式

开发环境自动添加颜色和调用位置：

```
[10:30:00.123] [INFO] [sshService.ts:76] event=ssh.connection.established error=0 msg=SSH connection established session_id=ssh-xxx
```

---

## 4. 模块化 Debug 开关

### 4.1 支持的模块

| 模块 | 说明 | 默认值 |
|------|------|--------|
| `terminal` | 终端模块 | DEV: true, PROD: false |
| `ssh` | SSH 连接模块 | DEV: true, PROD: false |
| `http` | HTTP/API 请求模块 | DEV: true, PROD: false |
| `ai` | AI 助手模块 | DEV: true, PROD: false |
| `file` | 文件传输模块 | DEV: true, PROD: false |
| `auth` | 认证模块 | DEV: true, PROD: false |
| `ui` | UI 组件模块 | DEV: true, PROD: false |
| `main` | 主进程模块 | DEV: true, PROD: false |
| `sftp` | SFTP 传输模块 | DEV: true, PROD: false |

### 4.2 配置文件格式

在应用配置或环境变量中设置：

```json
{
  "debug_modules": {
    "terminal": true,
    "ssh": true,
    "http": false,
    "ai": false,
    "file": false,
    "auth": false,
    "ui": false,
    "main": true,
    "sftp": true
  },
  "log_level": "INFO",
  "log_format": "json"
}
```

### 4.3 环境变量配置

```bash
# 日志级别：DEBUG/INFO/WARN/ERROR
LOG_LEVEL=INFO

# 模块开关（逗号分隔）
DEBUG_MODULES=terminal,ssh,file

# 输出格式：json/text
LOG_FORMAT=json
```

---

## 5. Logger 组件使用规范

### 5.1 导入方式

```typescript
import { logger, withFields, setLogConfig, LogLevel } from '@/utils/logger';
```

### 5.2 基本使用方法

```typescript
// 简单日志
logger.debug('Command executed', { session_id: 'ssh-123' });
logger.info('SSH connection established');
logger.warn('Connection timeout, retrying...');
logger.error('SSH connection failed', { error: err.message });

// 带字段的日志
logger.withFields({
  event: 'ssh.command.execute',
  module: 'ssh',
  session_id: 'ssh-123',
  host: '192.168.1.100',
  command: 'ls -la',
}).info('Executing command');

// 性能日志
const startTime = Date.now();
await executeCommand(cmd);
const latencyMs = Date.now() - startTime;
logger.info('Command completed', {
  event: 'ssh.command.completed',
  latency_ms: latencyMs,
});
```

### 5.3 创建模块化 Logger

```typescript
// utils/moduleLoggers.ts
import { logger } from './logger';

export const sshLogger = logger.withFields({ module: 'ssh' });
export const terminalLogger = logger.withFields({ module: 'terminal' });
export const httpLogger = logger.withFields({ module: 'http' });
export const aiLogger = logger.withFields({ module: 'ai' });
export const fileLogger = logger.withFields({ module: 'file' });

// 使用
sshLogger.info('SSH connection established', { host: '192.168.1.100' });
```

---

## 6. 事件命名规范

### 6.1 命名格式

```
模块.资源.操作.状态
```

示例：
- `ssh.connection.established`
- `ssh.connection.failed`
- `ssh.command.executed`
- `terminal.session.created`
- `terminal.session.closed`
- `http.request.completed`
- `http.request.failed`
- `ai.chat.completed`
- `file.upload.started`
- `file.upload.completed`

### 6.2 模块前缀

| 模块 | 前缀 | 示例 |
|------|------|------|
| SSH | `ssh.*` | `ssh.connection.established` |
| Terminal | `terminal.*` | `terminal.session.created` |
| HTTP | `http.*` | `http.request.completed` |
| AI | `ai.*` | `ai.chat.completed` |
| File | `file.*` | `file.upload.completed` |
| Auth | `auth.*` | `auth.login.success` |
| UI | `ui.*` | `ui.button.clicked` |
| Main | `main.*` | `main.window.created` |

---

## 7. 典型场景示例

### 7.1 SSH 连接

```typescript
// 渲染进程
logger.info('Connecting to SSH server', {
  event: 'ssh.connection.starting',
  module: 'ssh',
  host: config.host,
  port: config.port,
  username: config.username,
});

try {
  const connectionId = await window.electron.sshConnect(config);
  
  logger.info('SSH connection established', {
    event: 'ssh.connection.established',
    module: 'ssh',
    connection_id: connectionId,
    host: config.host,
  });
} catch (error) {
  logger.error('SSH connection failed', {
    event: 'ssh.connection.failed',
    module: 'ssh',
    error: error.code || 1,
    msg: error.message,
    host: config.host,
  });
  throw error;
}
```

### 7.2 命令执行

```typescript
logger.debug('Executing SSH command', {
  event: 'ssh.command.executing',
  module: 'ssh',
  session_id: connectionId,
  command: cmd,
});

const startTime = Date.now();
const result = await window.electron.sshExecute(connectionId, cmd);
const latencyMs = Date.now() - startTime;

logger.info('SSH command executed', {
  event: 'ssh.command.executed',
  module: 'ssh',
  session_id: connectionId,
  exit_code: result.exitCode,
  output_length: result.output.length,
  latency_ms: latencyMs,
});
```

### 7.3 API 请求

```typescript
httpLogger.debug('HTTP request started', {
  event: 'http.request.starting',
  method: 'GET',
  url: '/api/v1/hosts',
});

const startTime = Date.now();
const response = await api.getHosts();

httpLogger.info('HTTP request completed', {
  event: 'http.request.completed',
  method: 'GET',
  url: '/api/v1/hosts',
  status: response.status,
  latency_ms: Date.now() - startTime,
});
```

### 7.4 文件传输

```typescript
fileLogger.info('File upload started', {
  event: 'file.upload.started',
  module: 'file',
  filename: file.name,
  size: file.size,
});

try {
  await uploadFile(file);
  
  fileLogger.info('File upload completed', {
    event: 'file.upload.completed',
    module: 'file',
    filename: file.name,
    size: file.size,
  });
} catch (error) {
  fileLogger.error('File upload failed', {
    event: 'file.upload.failed',
    module: 'file',
    error: 1,
    msg: error.message,
    filename: file.name,
  });
}
```

### 7.5 AI 助手

```typescript
aiLogger.info('AI chat started', {
  event: 'ai.chat.started',
  module: 'ai',
  prompt_length: prompt.length,
});

const startTime = Date.now();
const response = await aiService.chat(prompt);

aiLogger.info('AI chat completed', {
  event: 'ai.chat.completed',
  module: 'ai',
  response_length: response.length,
  tokens_used: response.tokens,
  latency_ms: Date.now() - startTime,
});
```

---

## 8. 错误码规范

### 8.1 通用错误码

| 错误码 | 含义 | 说明 |
|--------|------|------|
| 0 | 成功 | 无错误 |
| 1 | 通用错误 | 未分类的错误 |
| 400 | 请求参数错误 | 客户端请求无效 |
| 401 | 未认证 | 需要登录 |
| 403 | 无权限 | 权限不足 |
| 404 | 资源不存在 | 请求的资源不存在 |
| 408 | 请求超时 | 连接超时 |
| 500 | 服务器错误 | 服务器内部错误 |

### 8.2 SSH 错误码

| 错误码 | 含义 | 说明 |
|--------|------|------|
| 1001 | 连接失败 | SSH 服务器连接失败 |
| 1002 | 认证失败 | 用户名/密码错误 |
| 1003 | 超时 | 连接超时 |
| 1004 | 断开连接 | 连接意外断开 |
| 1005 | 命令执行失败 | 命令执行返回非零退出码 |

### 8.3 文件传输错误码

| 错误码 | 含义 | 说明 |
|--------|------|------|
| 2001 | 文件不存在 | 上传/下载的文件不存在 |
| 2002 | 权限不足 | 没有操作权限 |
| 2003 | 传输中断 | 传输过程中断 |
| 2004 | 磁盘空间不足 | 存储空间不足 |

---

## 9. 敏感信息处理

### 9.1 禁止记录的信息

- ❌ 密码 (password)
- ❌ SSH 私钥 (privateKey)
- ❌ 完整 Token
- ❌ 信用卡信息
- ❌ 个人身份信息 (PII)

### 9.2 脱敏处理

```typescript
// 密码脱敏
logger.info('User login attempt', {
  event: 'auth.login.attempt',
  username: 'admin',
  password: '***REDACTED***'
});

// Token 脱敏（只记录前后 8 位）
logger.info('Token validated', {
  event: 'auth.token.validated',
  token: `${token.substring(0, 8)}...${token.substring(token.length - 8)}`
});

// IP 脱敏
logger.info('Request received', {
  event: 'http.request.received',
  ip: '192.168.1.***'
});
```

---

## 10. 配置与初始化

### 10.1 开发环境配置

```typescript
// main.ts 或 App.tsx
import { setLogConfig, LogLevel } from '@/utils/logger';

// 开发环境：DEBUG 级别，所有模块开启
setLogConfig({
  level: LogLevel.DEBUG,
  debugModules: {
    terminal: true,
    ssh: true,
    http: true,
    ai: true,
    file: true,
    auth: true,
    ui: true,
    main: true,
    sftp: true,
  },
  format: 'text', // 控制台易读格式
});
```

### 10.2 生产环境配置

```typescript
// 生产环境：INFO 级别，所有模块关闭 DEBUG
setLogConfig({
  level: LogLevel.INFO,
  debugModules: {
    terminal: false,
    ssh: false,
    http: false,
    ai: false,
    file: false,
    auth: false,
    ui: false,
    main: false,
    sftp: false,
  },
  format: 'json', // JSON 格式便于收集
});
```

---

## 11. 主进程日志

### 11.1 主进程日志特点

主进程运行在 Node.js 环境，可以使用相同的 logger.ts，但需要注意：
- 调用者信息显示为 `.js` 文件
- 路径为绝对路径

### 11.2 主进程集成示例

```typescript
// main/main.ts
import { ipcMain } from 'electron';
import { logger } from '../utils/logger';

ipcMain.handle('ssh:connect', async (event, config) => {
  logger.info('SSH connection requested', {
    event: 'ssh.connection.requested',
    module: 'ssh',
    host: config.host,
    port: config.port,
    username: config.username,
  });

  try {
    const session = await sshService.connect(config);
    
    logger.info('SSH connection established', {
      event: 'ssh.connection.established',
      module: 'ssh',
      session_id: session.id,
    });
    
    return { success: true, sessionId: session.id };
  } catch (error) {
    logger.error('SSH connection failed', {
      event: 'ssh.connection.failed',
      module: 'ssh',
      error: 1,
      msg: error.message,
      host: config.host,
    });
    
    return { success: false, error: error.message };
  }
});
```

---

## 12. Info/Error 日志指引

### 12.1 核心原则

**每一次用户能感受到的改变界面流程事件，都要有一条 INFO 或 ERROR 日志。**

这是为了：
- 追踪用户操作路径
- 分析用户行为
- 排查用户反馈的问题
- 审计关键操作

### 12.2 需要记录的用户操作事件

| 事件类型 | 示例 | 日志级别 |
|----------|------|----------|
| **按钮点击** | "连接主机"按钮、"上传文件"按钮、"AI 助手"按钮 | INFO |
| **界面切换** | 打开设置页、切换标签页、打开模态框 | INFO |
| **弹窗操作** | 确认对话框、提示弹窗、表单提交 | INFO |
| **登录相关** | 登录成功、登录失败、登出 | INFO/ERROR |
| **表单提交** | 保存配置、提交表单、创建主机 | INFO/ERROR |
| **连接操作** | SSH 连接成功、SSH 连接失败 | INFO/ERROR |
| **文件操作** | 文件上传成功、文件上传失败 | INFO/ERROR |
| **删除操作** | 删除主机、删除文件（需确认） | INFO |
| **设置变更** | 修改主题、修改配置 | INFO |

### 12.3 不需要记录的事件

| 事件类型 | 示例 | 原因 |
|----------|------|------|
| 文本框输入 | 用户在搜索框打字 | 不改变界面流程 |
| 鼠标悬停 | Tooltip 显示 | 临时交互 |
| 实时搜索建议 | 自动补全列表 | 高频临时交互 |
| 自动保存草稿 | 临时草稿自动保存 | 后台操作 |

### 12.4 日志示例

#### 按钮点击
```typescript
// ✅ 正确：记录按钮点击
logger.info('ui.button.clicked', 'Connect button clicked', {
  module: LOG_MODULE.UI,
  button_id: 'btn_connect_host',
  button_text: '连接主机',
  page: 'host_list',
});

// ❌ 错误：不记录按钮点击
console.log('clicked'); // 不规范的日志
```

#### 界面切换
```typescript
// ✅ 正确：记录页面切换
logger.info('ui.page.changed', 'Navigated to settings page', {
  module: LOG_MODULE.UI,
  from_page: 'dashboard',
  to_page: 'settings',
});

// ✅ 正确：记录模态框打开
logger.info('ui.modal.opened', 'Host config modal opened', {
  module: LOG_MODULE.UI,
  modal_id: 'host_config_modal',
  action: 'create',  // create / edit
});
```

#### 登录成功
```typescript
// ✅ 正确：记录登录成功
logger.info('auth.login.success', 'User logged in successfully', {
  module: LOG_MODULE.AUTH,
  user_id: 'user-123',
  login_method: 'password',
});

// ✅ 正确：记录登录失败
logger.error('auth.login.failed', 'Login failed', {
  module: LOG_MODULE.AUTH,
  error: 401,
  msg: 'Invalid credentials',
  login_method: 'password',
});
```

#### SSH 连接
```typescript
// ✅ 正确：记录 SSH 连接成功
logger.info('ssh.connection.established', 'SSH connection established', {
  module: LOG_MODULE.SSH,
  host_id: 'host-001',
  host: '192.168.1.100',
  username: 'admin',
  connection_id: 'ssh-12345',
});

// ✅ 正确：记录 SSH 连接失败
logger.error('ssh.connection.failed', 'SSH connection failed', {
  module: LOG_MODULE.SSH,
  host_id: 'host-001',
  host: '192.168.1.100',
  error: 1001,
  msg: err.message,
});
```

#### 文件上传
```typescript
// ✅ 正确：记录文件上传
logger.info('file.upload.completed', 'File uploaded successfully', {
  module: LOG_MODULE.FILE,
  filename: 'test.zip',
  file_size: 1024000,
  host_id: 'host-001',
});

// ✅ 正确：记录文件上传失败
logger.error('file.upload.failed', 'File upload failed', {
  module: LOG_MODULE.FILE,
  filename: 'test.zip',
  error: 2003,
  msg: 'Connection interrupted',
});
```

### 12.5 设置用户上下文

在用户登录成功后，应该设置全局日志上下文：

```typescript
import { setLogContext } from '@/utils/logger';

// 用户登录成功后
setLogContext({
  user_id: user.id,
  client: '192.168.1.100',  // 客户端IP
});

// 之后的日志都会自动包含 user_id 和 client 字段
logger.info('ssh.connection.established', 'SSH connected', {
  module: LOG_MODULE.SSH,
  host: '192.168.1.100',
});

// 日志输出：
// {
//   "timestamp": "2026-02-08T10:30:00.123Z",
//   "level": "INFO",
//   "event": "ssh.connection.established",
//   "user_id": "user-123",      // 自动添加
//   "client": "192.168.1.100",  // 自动添加
//   "module": "ssh",
//   "host": "192.168.1.100"
// }
```

在用户登出后清除上下文：

```typescript
import { clearLogContext } from '@/utils/logger';

// 用户登出后
clearLogContext();
```

### 12.6 完整字段要求

INFO/ERROR 日志应包含的字段：

| 字段 | 类型 | 必需 | 说明 |
|------|------|------|------|
| `event` | string | ✅ | 事件名称 |
| `msg` | string | ✅ | 消息描述 |
| `module` | string | ✅ | 模块名称 |
| `error` | number | ✅ | 错误码（0 成功，非 0 失败） |
| `user_id` | string | ✅* | 用户 ID（需设置上下文） |
| `client` | string | ✅* | 客户端 IP（需设置上下文） |
| `caller` | string | ❌ | 自动添加 |
| `func` | string | ❌ | 自动添加 |

> *：通过 `setLogContext()` 设置后自动添加

---

## 13. 最佳实践总结

### 12.1 必须遵循

1. ✅ **所有日志通过 logger.ts 输出**
   - 禁止直接使用 `console.log/error/warn/info`
   - 一致性：便于后续收集和分析

2. ✅ **包含足够的上下文**
   - `session_id`、`host_id`、`user_id` 等
   - 便于问题排查时关联日志

3. ✅ **事件名称规范化**
   - 使用 `模块.资源.操作.状态` 格式
   - 便于日志过滤和统计

4. ✅ **错误码规范化**
   - 0 表示成功，非 0 表示错误
   - 便于错误分类和监控

5. ✅ **敏感信息脱敏**
   - 密码、Token、私钥等必须脱敏
   - 保护用户隐私和安全

### 12.2 推荐做法

- 使用 `withFields()` 创建模块化 Logger
- 按模块组织日志，便于按需开启
- 性能敏感操作记录 `latency_ms`
- 重要操作记录完整的生命周期日志

### 12.3 应避免的做法

- ❌ 直接使用 `console.log`
- ❌ 记录敏感信息（密码、Token、私钥）
- ❌ 日志过于冗余（每行都记录）
- ❌ 使用中文消息（保持英文一致性）
- ❌ 日志消息过长（建议 < 100 字符）

---

## 14. 相关文档

- [全局日志规范](../docs/LOGGING_SPECIFICATION.md)
- [Logger 组件源码](./src/utils/logger.ts)
- [日志迁移指南](./LOGGING_MIGRATION_GUIDE.md)
- [API 规范](../docs/API_SPECIFICATION.md)
- [协议规范](../docs/PROTOCOL_SPECIFICATION.md)

---

**最后更新**: 2026-02-08
**维护者**: TermCat Team
