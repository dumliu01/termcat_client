# 🚀 快速启动指南

## 问题已修复 ✅

SSH 连接的 IPC handler 注册问题已修复！现在可以正常使用了。

## 立即开始测试

### 1️⃣ 重新启动开发服务器

在终端中运行：

```bash
cd /Users/dum/Vmware_Share/dum_dev/termcat/termcat_client
npm run electron:dev
```

### 2️⃣ 连接你的服务器

应用启动后：

1. **添加主机**（如果还没有）：
   - 点击 "添加主机" 按钮
   - 填写信息：
     ```
     主机名: 193.112.187.26
     端口: 22
     用户名: ubuntu
     认证方式: 密码
     密码: [输入你的密码]
     ```

2. **连接**：
   - 点击主机卡片进行连接
   - 等待状态变为 "Connected"（绿色指示灯）

3. **使用交互式终端**：
   - 确保选择"交互终端"模式
   - 开始输入命令！

### 3️⃣ 测试基本命令

```bash
# 查看当前用户
whoami

# 列出文件
ls -la

# 查看系统信息
uname -a

# 运行交互式程序
top    # 按 q 退出
vim test.txt  # 按 :q 退出
```

## 应该看到的日志

**主进程终端应该显示**：
```
SSH Service initialized successfully
Main process starting...
Registering basic IPC handlers...
Registering SSH IPC handlers...
SSH IPC handlers registered successfully
```

**连接时的日志**：
```
ssh-connect handler called with config: { host: '193.112.187.26', ... }
Connecting to SSH server: ubuntu@193.112.187.26:22
SSH connection established: ssh-1737176xxx-xxxxx
```

## 功能特性

✅ **交互式终端模式**
- 完整的终端体验
- 支持 vim、nano、top 等
- 256 色彩支持
- 实时响应

✅ **命令模式**
- 快速执行单个命令
- 命令历史记录
- 适合简单操作

## 遇到问题？

### 连接超时
```bash
# 测试服务器是否可访问
ping 193.112.187.26
telnet 193.112.187.26 22
```

### IPC 错误
```bash
# 完全重启
pkill -f electron
pkill -f vite
npm run electron:dev
```

### 显示异常
- 尝试切换终端模式（交互 ↔ 命令）
- 刷新页面（Cmd+R / Ctrl+R）
- 查看浏览器控制台

## 文档

- **实现说明**: `SSH_IMPLEMENTATION_README.md`
- **测试指南**: `SSH_TESTING_GUIDE.md`
- **修复记录**: `FIX_SSH_ERROR.md`

## 享受使用！🎉

现在你可以：
- 远程管理 Linux 服务器
- 运行任何 SSH 命令
- 使用完整的交互式终端
- 支持 vim/nano/top 等程序

祝使用愉快！
