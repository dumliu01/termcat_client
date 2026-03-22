# SSH 连接问题已修复

## 问题原因

**错误信息**: `Error: No handler registered for 'ssh-connect'`

**根本原因**:
- `ssh-service.ts` 文件没有被 Vite 编译
- `main.ts` 尝试动态加载不存在的 `ssh-service.js` 文件
- 导致 SSH Service 初始化失败，IPC handlers 没有被注册

## 解决方案

将 `SSHService` 类的代码直接整合到 `main.ts` 中，这样：
1. ✅ 无需额外的编译配置
2. ✅ 代码在单个文件中，易于管理
3. ✅ 避免模块加载问题
4. ✅ 确保 IPC handlers 正确注册

## 修改的文件

- **termcat_client/src/main/main.ts** - 整合了完整的 SSH Service 实现

## 重新启动应用

### 方法 1: 开发模式（推荐用于测试）

```bash
cd termcat_client

# 停止旧进程（如果有运行的话）
pkill -f "electron" 2>/dev/null

# 重新启动
npm run electron:dev
```

### 方法 2: 重新构建

```bash
cd termcat_client
npm run build:mac  # macOS
npm run build:win  # Windows
```

## 验证修复

启动应用后，检查主进程日志应该看到：

```
SSH Service initialized successfully
Main process starting...
Registering basic IPC handlers...
Registering SSH IPC handlers...
SSH IPC handlers registered successfully
```

然后尝试连接 SSH 服务器，应该可以正常连接了。

## 测试连接

使用你的服务器信息：
- **主机**: 193.112.187.26
- **端口**: 22
- **用户名**: ubuntu
- **密码**: [你的密码]

连接后应该会显示绿色的 "Connected" 状态指示器。

## 注意事项

如果仍然遇到问题：

1. **完全重启应用**：
   ```bash
   pkill -f "electron"
   pkill -f "vite"
   npm run electron:dev
   ```

2. **清理缓存**：
   ```bash
   rm -rf node_modules/.vite
   rm -rf dist
   npm run electron:dev
   ```

3. **检查防火墙**：确保服务器的 22 端口可访问

4. **查看完整日志**：在 DevTools Console 和主进程控制台中查看详细错误信息
