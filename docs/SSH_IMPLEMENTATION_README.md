# SSH 远程登录功能实现说明

## 功能概述

本项目已实现完整的 SSH 远程登录和命令行控制功能，支持：

1. **SSH 连接管理**：使用 ssh2 库建立真实的 SSH 连接
2. **交互式终端**：基于 xterm.js 的完整终端体验
3. **命令模式**：传统的命令输入和输出显示
4. **密码和密钥认证**：支持两种认证方式
5. **实时数据流**：通过 Electron IPC 实现实时终端交互

## 技术架构

### 1. 主进程（Main Process）

**文件**: `src/main/ssh-service.ts`

- 使用 `ssh2` 库建立 SSH 连接
- 管理连接池和会话
- 提供交互式 shell（PTY）
- 处理命令执行和数据流

**关键功能**:
- `connect(config)`: 建立 SSH 连接
- `createShell(connectionId, webContents)`: 创建交互式 shell
- `writeToShell(connectionId, data)`: 向 shell 写入数据
- `resizeShell(connectionId, cols, rows)`: 调整终端大小
- `executeCommand(connectionId, command)`: 执行单个命令
- `disconnect(connectionId)`: 断开连接

### 2. IPC 通信

**文件**: `src/main/main.ts`, `src/preload/preload.ts`

**已注册的 IPC Handlers**:
- `ssh-connect`: 建立 SSH 连接
- `ssh-execute`: 执行命令
- `ssh-create-shell`: 创建交互式 shell
- `ssh-shell-write`: 向 shell 写入数据
- `ssh-shell-resize`: 调整终端大小
- `ssh-disconnect`: 断开连接
- `ssh-is-connected`: 检查连接状态

**IPC 事件**:
- `ssh-shell-data`: 从 shell 接收数据
- `ssh-shell-close`: shell 关闭事件

### 3. 前端组件

#### XTermTerminal 组件
**文件**: `src/components/XTermTerminal.tsx`

基于 xterm.js 的完整终端组件，支持：
- 256 色彩支持
- 自动调整大小（FitAddon）
- Web 链接识别（WebLinksAddon）
- 实时数据流
- 终端大小调整通知

#### TerminalView 组件
**文件**: `src/components/TerminalView.tsx`

主终端视图，支持两种模式：
1. **交互终端模式**：使用 xterm.js 提供完整的终端体验
2. **命令模式**：传统的命令输入输出模式

### 4. 服务层

**文件**: `src/services/sshService.ts`

前端 SSH 服务，负责：
- 与 Electron IPC 通信
- 管理会话状态
- 提供 mock 数据（开发模式）

## 使用方法

### 1. 安装依赖

```bash
cd termcat_client
npm install
```

### 2. 开发模式运行

```bash
npm run electron:dev
```

### 3. 构建应用

```bash
# Windows
npm run build:win

# macOS
npm run build:mac
```

## SSH 连接配置

连接 SSH 服务器时需要提供以下信息：

```typescript
interface SSHConfig {
  host: string;        // 服务器地址
  port: number;        // SSH 端口（默认 22）
  username: string;    // 用户名
  password?: string;   // 密码（密码认证）
  privateKey?: string; // 私钥（密钥认证）
}
```

## 终端模式切换

在终端界面顶部有模式切换按钮：

1. **交互终端**（Interactive）
   - 完整的终端体验
   - 支持 vim、nano 等交互式程序
   - 颜色和样式支持
   - 实时响应

2. **命令模式**（Command）
   - 简单的命令输入输出
   - 适合快速执行单个命令
   - 命令历史记录

## 主要特性

### 1. 连接管理
- 自动重连
- 连接状态显示
- 错误提示

### 2. 终端功能
- 256 色支持
- 自适应大小
- 滚动缓冲区（1000 行）
- 光标闪烁
- 可点击链接

### 3. 安全性
- 密码不在日志中显示
- 支持 SSH 密钥认证
- 连接超时设置
- Keepalive 机制

## 故障排除

### 1. SSH 连接失败

**可能原因**:
- 服务器地址或端口错误
- 用户名或密码错误
- 网络连接问题
- SSH 服务未启动

**解决方法**:
- 检查连接配置
- 确认服务器可访问
- 查看主进程日志

### 2. 终端显示异常

**可能原因**:
- 终端大小不匹配
- 编码问题
- 颜色主题问题

**解决方法**:
- 切换终端模式
- 刷新页面
- 检查浏览器控制台

### 3. 交互式程序无法使用

确保：
- 使用"交互终端"模式
- SSH 连接正常
- 终端大小已正确同步

## 开发注意事项

### 1. 添加新的终端功能

在 `ssh-service.ts` 中添加新方法，然后：
1. 在 `main.ts` 中注册 IPC handler
2. 在 `preload.ts` 中暴露 API
3. 在前端组件中调用

### 2. 调试 SSH 连接

查看主进程日志：
```bash
# 日志会输出到控制台
console.log() 输出会显示在终端中
```

### 3. 修改终端样式

编辑 `XTermTerminal.tsx` 中的 theme 配置。

## 依赖说明

- **ssh2**: Node.js SSH 客户端库
- **xterm**: 浏览器端终端模拟器
- **xterm-addon-fit**: 自动调整终端大小
- **xterm-addon-web-links**: Web 链接识别
- **electron**: 跨平台桌面应用框架

## 许可证

MIT
