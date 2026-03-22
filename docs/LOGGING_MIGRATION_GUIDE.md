# TermCat Client 日志迁移指南

本文档指导如何将现有代码中的 `console.log/error/warn/info` 迁移到新的日志系统。

---

## 迁移前检查

### 1. 识别需要迁移的代码

使用以下命令查找项目中直接使用 `console` 的地方：

```bash
# 在项目根目录下执行
cd termcat_client
grep -r "console\.log\|console\.error\|console\.warn\|console\.info" src/ --include="*.ts" --include="*.tsx"
```

### 2. 迁移模式

| 原代码 | 迁移后 |
|--------|--------|
| `console.log('message')` | `logger.info('event.name', 'message', { module: LOG_MODULE.XXX })` |
| `console.error('error:', err)` | `logger.error('event.name', 'error message', { module: LOG_MODULE.XXX, error: err.code })` |
| `console.warn('warning')` | `logger.warn('event.name', 'warning', { module: LOG_MODULE.XXX })` |
| `console.log('data:', data)` | `logger.info('event.name', 'message', { module: LOG_MODULE.XXX, ...data })` |

---

## 迁移示例

### 示例 1: 简单日志

**迁移前:**
```typescript
console.log('SSH connection established');
```

**迁移后:**
```typescript
import { logger, LOG_MODULE } from '@/utils/logger';

logger.info('ssh.connection.established', 'SSH connection established', {
  module: LOG_MODULE.SSH,
});
```

### 示例 2: 带变量的日志

**迁移前:**
```typescript
console.log(`Connecting to ${host}:${port}`);
```

**迁移后:**
```typescript
import { logger, LOG_MODULE } from '@/utils/logger';

logger.info('ssh.connection.starting', 'SSH connection starting', {
  module: LOG_MODULE.SSH,
  host,
  port,
});
```

### 示例 3: 错误日志

**迁移前:**
```typescript
console.error('SSH connection failed:', error);
```

**迁移后:**
```typescript
import { logger, LOG_MODULE } from '@/utils/logger';

logger.error('ssh.connection.failed', 'SSH connection failed', {
  module: LOG_MODULE.SSH,
  error: 1001,  // 错误码
  msg: error.message,
  host: config.host,
});
```

### 示例 4: 使用 withFields（推荐在文件顶部定义一次）

**迁移前:**
```typescript
console.log('User action:', { userId, action, timestamp });
```

**迁移后:**
```typescript
import { logger, LOG_MODULE } from '@/utils/logger';

// 在文件顶部定义
const log = logger.withFields({ module: LOG_MODULE.YOUR_MODULE });

// 在代码中使用
log.info('user.action', 'User action performed', {
  user_id: userId,
  action,
  timestamp,
});
```

### 示例 5: 性能日志

**迁移前:**
```typescript
const startTime = Date.now();
// ... 执行操作
console.log(`Operation took ${Date.now() - startTime}ms`);
```

**迁移后:**
```typescript
import { logger, LOG_MODULE } from '@/utils/logger';

const startTime = Date.now();
// ... 执行操作
const latencyMs = Date.now() - startTime;

logger.performance('operation.completed', 'Operation completed', latencyMs, {
  module: LOG_MODULE.YOUR_MODULE,
});
```

---

## 模块常量

使用 `LOG_MODULE` 常量定义模块名称：

```typescript
import { LOG_MODULE } from '@/utils/logger';

LOG_MODULE.TERMINAL  // 终端模块
LOG_MODULE.SSH       // SSH 模块
LOG_MODULE.HTTP      // HTTP 模块
LOG_MODULE.AI        // AI 模块
LOG_MODULE.FILE     // 文件模块
LOG_MODULE.AUTH     // 认证模块
LOG_MODULE.UI       // UI 模块
LOG_MODULE.MAIN     // 主进程模块
LOG_MODULE.SFTP     // SFTP 模块
```

---

## 事件命名规范

### 命名格式

```
模块.资源.操作.状态
```

### 示例

| 场景 | 事件名称 |
|------|----------|
| SSH 连接开始 | `ssh.connection.starting` |
| SSH 连接成功 | `ssh.connection.established` |
| SSH 连接失败 | `ssh.connection.failed` |
| SSH 连接关闭 | `ssh.connection.closed` |
| 命令开始执行 | `ssh.command.executing` |
| 命令执行完成 | `ssh.command.completed` |
| 命令执行错误 | `ssh.command.error` |
| SFTP 会话创建 | `sftp.session.created` |
| SFTP 会话关闭 | `sftp.session.closed` |
| 文件上传开始 | `file.upload.started` |
| 文件上传完成 | `file.upload.completed` |
| 文件上传失败 | `file.upload.failed` |
| API 请求开始 | `http.request.starting` |
| API 请求完成 | `http.request.completed` |
| API 请求失败 | `http.request.failed` |

---

## 错误码参考

### 通用错误码

| 错误码 | 含义 |
|--------|------|
| 0 | 成功 |
| 1 | 通用错误 |
| 400 | 请求参数错误 |
| 401 | 未认证 |
| 403 | 无权限 |
| 404 | 资源不存在 |
| 408 | 请求超时 |
| 500 | 服务器错误 |

### SSH 错误码

| 错误码 | 含义 |
|--------|------|
| 1001 | 连接失败 |
| 1002 | 认证失败 |
| 1003 | 超时 |
| 1004 | 断开连接 |
| 1005 | 命令执行失败 |

### 文件传输错误码

| 错误码 | 含义 |
|--------|------|
| 2001 | 文件不存在 |
| 2002 | 权限不足 |
| 2003 | 传输中断 |
| 2004 | 磁盘空间不足 |

---

## 敏感信息处理

### 禁止记录的信息

- ❌ 密码 (password)
- ❌ SSH 私钥 (privateKey)
- ❌ 完整 Token
- ❌ 信用卡信息
- ❌ 个人身份信息 (PII)

### 脱敏处理

```typescript
// ❌ 错误示例
logger.info('auth.login', 'Login attempt', {
  password: userPassword,  // 禁止！
});

// ✅ 正确示例
logger.info('auth.login.attempt', 'Login attempt', {
  module: LOG_MODULE.AUTH,
  username: 'admin',
  password: '***REDACTED***',  // 脱敏
});

// ✅ Token 脱敏
const token = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...';
logger.info('auth.token.validated', 'Token validated', {
  module: LOG_MODULE.AUTH,
  token: `${token.substring(0, 8)}...${token.substring(token.length - 8)}`,
});
```

---

## 配置文件

### 开发环境配置

```typescript
// src/main.ts 或 src/App.tsx
import { setLogConfig, LogLevel, LOG_MODULE } from '@/utils/logger';

setLogConfig({
  level: LogLevel.DEBUG,  // 开发环境启用 DEBUG
  format: 'text',        // 文本格式便于阅读
  debugModules: {
    [LOG_MODULE.TERMINAL]: true,
    [LOG_MODULE.SSH]: true,
    [LOG_MODULE.HTTP]: false,  // 按需启用
    [LOG_MODULE.AI]: false,
    [LOG_MODULE.FILE]: false,
    [LOG_MODULE.AUTH]: false,
    [LOG_MODULE.UI]: false,
    [LOG_MODULE.MAIN]: true,
    [LOG_MODULE.SFTP]: true,
  },
});
```

### 生产环境配置

```typescript
// 生产环境配置
setLogConfig({
  level: LogLevel.INFO,   // 生产环境只用 INFO+
  format: 'json',         // JSON 格式便于收集
  debugModules: {
    [LOG_MODULE.TERMINAL]: false,
    [LOG_MODULE.SSH]: false,
    [LOG_MODULE.HTTP]: false,
    [LOG_MODULE.AI]: false,
    [LOG_MODULE.FILE]: false,
    [LOG_MODULE.AUTH]: false,
    [LOG_MODULE.UI]: false,
    [LOG_MODULE.MAIN]: false,
    [LOG_MODULE.SFTP]: false,
  },
});
```

---

## 常见问题

### Q1: 为什么不直接用 console.log？

1. **一致性**: 所有日志使用相同格式，便于收集和分析
2. **结构化**: JSON 格式便于后续查询和统计
3. **模块化**: 按模块控制 DEBUG 日志开关
4. **可扩展**: 支持性能日志、错误追踪等高级功能

### Q2: 如何临时添加调试日志？

```typescript
import { logger, setLogConfig, LogLevel, LOG_MODULE } from '@/utils/logger';

// 临时启用某个模块的 DEBUG 日志
setLogConfig({
  level: LogLevel.DEBUG,
  debugModules: {
    [LOG_MODULE.SSH]: true,
  },
});
```

### Q3: 日志输出位置不对？

logger.ts 会自动检测调用位置。如果显示不正确：

1. 确保传递了正确的 `module` 字段
2. 检查是否有其他日志工具干扰
3. 重启开发服务器

### Q4: 如何记录堆栈信息？

```typescript
import { logger, LOG_MODULE } from '@/utils/logger';

try {
  // 可能抛出错误的代码
} catch (error) {
  logger.error('operation.failed', 'Operation failed', {
    module: LOG_MODULE.YOUR_MODULE,
    error: 1,
    msg: error.message,
    stack: error.stack,  // 堆栈信息
  });
}
```

---

## 快速迁移清单

- [ ] 导入 `logger` 和 `LOG_MODULE` 常量
- [ ] 将 `console.log` 替换为 `logger.info`
- [ ] 将 `console.error` 替换为 `logger.error`
- [ ] 将 `console.warn` 替换为 `logger.warn`
- [ ] 添加事件名称（第一个参数）
- [ ] 添加 `module: LOG_MODULE.XXX` 字段
- [ ] 将变量移到 fields 对象中
- [ ] 添加适当的错误码
- [ ] 检查并脱敏敏感信息
- [ ] 运行测试确保功能正常

---

## 相关文档

- [日志规范文档](./docs/LOGGING_SPECIFICATION.md)
- [Logger 组件源码](./src/utils/logger.ts)
- [全局日志规范](../docs/LOGGING_SPECIFICATION.md)
