# SSH 功能快速测试指南

## 测试准备

### 1. 准备测试环境

确保有一个可以 SSH 连接的 Linux 服务器（或使用本地虚拟机）。

**推荐测试环境**:
- VirtualBox/VMware 虚拟机运行 Ubuntu/Debian
- 云服务器（AWS/阿里云/腾讯云等）
- Docker容器启用 SSH 服务

### 2. 启用 SSH 服务

在 Linux 服务器上：

```bash
# 安装 SSH 服务器
sudo apt-get update
sudo apt-get install openssh-server

# 启动 SSH 服务
sudo systemctl start ssh
sudo systemctl enable ssh

# 检查服务状态
sudo systemctl status ssh

# 查看 SSH 端口（默认 22）
sudo ss -tlnp | grep ssh
```

### 3. 创建测试用户

```bash
# 创建测试用户
sudo useradd -m -s /bin/bash testuser
sudo passwd testuser

# 或使用现有用户
```

## 测试步骤

### 1. 启动应用

```bash
cd termcat_client
npm run electron:dev
```

或使用构建后的应用：

```bash
# macOS
open release/mac/TermCat.app

# 已生成的文件：
# - release/TermCat-1.0.0.dmg （macOS 安装包）
# - release/TermCat-1.0.0-mac.zip （macOS zip 包）
```

### 2. 添加 SSH 主机

在应用主界面中：

1. 点击"添加主机"按钮
2. 填写连接信息：
   - **主机名**: 服务器 IP 地址（例如：192.168.1.100）
   - **端口**: 22（默认）
   - **用户名**: testuser（或你的用户名）
   - **认证方式**: 选择"密码"或"SSH 密钥"
   - **密码**: 输入密码（如果使用密码认证）
3. 点击"保存"

### 3. 测试连接

#### 测试 1: 基本连接

1. 点击主机卡片连接
2. 观察连接状态：
   - 应该显示 "Connecting..."
   - 然后变为 "Connected"（绿点）
   - 如果失败，会显示 "Connection Failed"（红点）

#### 测试 2: 交互式终端（推荐）

1. 连接成功后，确保选择"交互终端"模式
2. 测试基本命令：

```bash
# 查看当前用户
whoami

# 查看当前目录
pwd

# 列出文件
ls -la

# 查看系统信息
uname -a

# 查看内存使用
free -h
```

3. 测试交互式程序：

```bash
# 使用 top（按 q 退出）
top

# 使用 vim（按 :q 退出）
vim test.txt

# 使用 nano
nano test.txt
```

4. 测试颜色和样式：

```bash
# 彩色输出
ls --color=auto

# 显示颜色测试
for i in {0..255}; do echo -e "\e[38;5;${i}m${i} "; done

# 查看系统日志（有颜色）
journalctl -n 20 --no-pager
```

#### 测试 3: 命令模式

1. 切换到"命令模式"
2. 测试单个命令：

```bash
ls -la
df -h
uptime
who
ps aux | head -10
```

3. 查看命令历史：
   - 点击"历史"按钮
   - 从历史记录中选择命令

#### 测试 4: 窗口调整

1. 在交互式终端模式下
2. 调整浏览器窗口大小
3. 运行 `tput cols` 和 `tput lines` 查看终端大小
4. 应该自动适应新的窗口大小

#### 测试 5: 多行输出

运行生成大量输出的命令：

```bash
# 查看大文件
cat /var/log/syslog

# 递归列出文件
find /usr -name "*.so" | head -100

# 显示网络连接
netstat -tuln
```

#### 测试 6: 特殊字符和编码

```bash
# 中文字符
echo "你好世界"

# 特殊符号
echo "★☆♪♫◆◇▲△"

# 表情符号
echo "😀 🎉 🚀"
```

## 预期结果

### ✅ 成功指标

1. **连接成功**
   - 绿色连接指示灯
   - 显示欢迎信息和命令提示符

2. **交互式终端**
   - 能够运行 vim、nano、top 等程序
   - 256 色彩正确显示
   - 实时响应键盘输入
   - 窗口大小自动调整

3. **命令模式**
   - 命令输出完整显示
   - 命令历史功能正常
   - 错误信息正确显示

4. **性能**
   - 输入无延迟
   - 大量输出流畅显示
   - 无卡顿或崩溃

### ⚠️ 常见问题

#### 问题 1: 连接超时

**原因**:
- 服务器 IP 或端口错误
- 防火墙阻止连接
- SSH 服务未启动

**解决**:
```bash
# 检查 SSH 服务
sudo systemctl status ssh

# 检查防火墙
sudo ufw status
sudo ufw allow 22/tcp

# 测试连接
telnet <server-ip> 22
```

#### 问题 2: 认证失败

**原因**:
- 用户名或密码错误
- SSH 密钥配置错误

**解决**:
```bash
# 重置密码
sudo passwd <username>

# 检查 SSH 配置
sudo cat /etc/ssh/sshd_config | grep PermitRootLogin
sudo cat /etc/ssh/sshd_config | grep PasswordAuthentication
```

#### 问题 3: 终端显示异常

**解决**:
1. 切换终端模式（交互 ↔ 命令）
2. 重新连接
3. 检查浏览器控制台错误

#### 问题 4: 中文乱码

**解决**:
```bash
# 在服务器上设置 UTF-8
export LANG=en_US.UTF-8
export LC_ALL=en_US.UTF-8

# 或在应用中配置终端编码
```

## 高级测试

### 1. 测试长时间运行的命令

```bash
# 运行 5 分钟的监控
while true; do date; sleep 1; done

# Ctrl+C 中断
```

### 2. 测试大文件传输（未来功能）

```bash
# 上传文件
scp local-file.txt user@server:/path/

# 下载文件
scp user@server:/path/remote-file.txt ./
```

### 3. 测试端口转发（未来功能）

```bash
# 本地端口转发
ssh -L 8080:localhost:80 user@server

# 远程端口转发
ssh -R 9090:localhost:3000 user@server
```

## 性能测试

### 1. 输出性能

```bash
# 快速输出大量文本
seq 1 10000

# 测试滚动性能
cat /var/log/syslog
```

### 2. 输入性能

```bash
# 快速输入测试
# 连续按键，观察是否有延迟
```

### 3. 连接稳定性

```bash
# 长时间保持连接
# 等待 10-30 分钟，观察是否断开
```

## 测试报告

完成测试后，记录：

- ✅ 功能正常项
- ❌ 发现的问题
- 📝 改进建议
- 🐛 Bug 报告

## 下一步

测试通过后，可以：
1. 添加更多主机
2. 自定义终端主题
3. 配置快捷命令
4. 使用 AI 命令生成功能
