# 终端交互功能测试指南

## 🚀 启动应用

```bash
cd termcat_client
npm run electron:dev
```

## ✅ 测试步骤

### 1. 基本连接测试

1. 点击一个主机连接
2. 观察连接状态变化：
   - 黄色圆点 + "Connecting..." → 连接中
   - 绿色圆点 + "Connected" → 连接成功

### 2. Shell 初始化测试

连接成功后，终端应该显示：
```
Initializing shell...
Shell ready. You can now type commands.
```

**查看日志**（应该看到）：
- 浏览器控制台：`Creating interactive shell for connection: xxx`
- 浏览器控制台：`Shell created successfully, setting isShellReady to true`
- 终端窗口：`ssh-create-shell handler called: xxx`

### 3. 基本命令测试

测试以下命令，确保输入和输出都正常：

#### 测试 1: 简单命令
```bash
whoami
```
**预期**：显示当前用户名

#### 测试 2: 带输出的命令
```bash
ls -la
```
**预期**：显示文件列表

#### 测试 3: 带颜色输出的命令
```bash
ls --color=auto
```
**预期**：显示带颜色的文件列表

#### 测试 4: 多行输出
```bash
cat /etc/os-release
```
**预期**：显示操作系统信息

### 4. 特殊键测试

#### 回车键 (Enter)
- 按回车应该执行命令
- **日志检查**：终端窗口应显示 `data: "\\r"`

#### 退格键 (Backspace)
- 输入 `lssss` 然后按3次退格，应该删除 `sss`
- 再按回车，应该执行 `ls`
- **日志检查**：终端窗口应显示 `data: "\\x7f"` 或 `data: "\\b"`

#### Tab 补全
- 输入 `wh` 然后按 Tab
- **预期**：自动补全为 `whoami` 或显示候选列表

#### Ctrl+C
- 运行 `ping 8.8.8.8`
- 按 Ctrl+C
- **预期**：命令被中断，返回到提示符

### 5. 交互式程序测试

#### 测试 vim
```bash
vim test.txt
```
- 按 `i` 进入插入模式
- 输入一些文字
- 按 ESC
- 输入 `:wq` 保存退出
- **预期**：vim 正常工作，能看到光标和文字

#### 测试 top
```bash
top
```
- **预期**：实时显示系统进程
- 按 `q` 退出

#### 测试 nano
```bash
nano test.txt
```
- 输入文字
- 按 Ctrl+X 退出
- **预期**：nano 正常工作

### 6. 长输出测试

```bash
dmesg | head -100
```
**预期**：
- 显示100行系统日志
- 终端可以滚动查看
- 不卡顿

### 7. 错误命令测试

```bash
asdfghjkl
```
**预期**：显示 "command not found" 错误信息

## 🔍 调试日志检查

### 浏览器控制台（渲染进程）应该显示：

```
Creating interactive shell for connection: ssh-xxx
Shell created successfully, setting isShellReady to true
Terminal size set to: 80 x 24
Received shell data, length: xxx
```

### 终端窗口（主进程）应该显示：

```
ssh-create-shell handler called: ssh-xxx
Creating interactive shell for connection: ssh-xxx
Interactive shell created successfully
ssh-shell-write handler called: { connectionId: 'ssh-xxx', dataLength: 1, data: 'l' }
Write result: true
```

## ⚠️ 常见问题

### 问题 1: 输入没有反应

**检查**：
- 浏览器控制台是否显示 "Shell not ready yet, ignoring input"
- 主进程日志是否显示 shell 创建成功

**解决**：
- 等待 shell 初始化完成
- 检查 SSH 连接是否真正建立

### 问题 2: 输入可见但没有输出

**检查**：
- 主进程日志中 `Write result` 是否为 `true`
- 是否有数据接收日志 "Received shell data"

**解决**：
- 检查 SSH shell 是否创建成功
- 检查 IPC 监听器是否正确注册

### 问题 3: 中文乱码

**检查**：
- 终端编码设置（应为 UTF-8）
- SSH 服务器语言环境

**解决**：
```bash
export LANG=zh_CN.UTF-8
```

### 问题 4: 终端大小不对

**检查**：
- 浏览器控制台中 "Terminal size set to" 显示的尺寸
- 调整窗口大小时是否触发 resize

**解决**：
- 刷新页面
- 手动调整窗口大小触发 resize

## 📊 性能测试

### 大量输出测试
```bash
cat /var/log/syslog
```
**预期**：流畅显示，无卡顿

### 快速输入测试
快速输入一长串命令
```bash
echo "test1" && echo "test2" && echo "test3" && echo "test4"
```
**预期**：所有命令正常执行

## ✨ 高级功能测试

### 复制粘贴
- 选中终端中的文字
- Cmd+C (Mac) 或 Ctrl+C (Windows/Linux) 复制
- Cmd+V (Mac) 或 Ctrl+V (Windows/Linux) 粘贴
- **预期**：正确复制粘贴

### 搜索功能（如果实现）
- Cmd+F 打开搜索
- 输入关键词
- **预期**：高亮显示匹配项

### 多窗口/多标签（如果实现）
- 同时连接多个服务器
- 切换标签
- **预期**：每个连接独立工作

## 🎯 完整测试流程示例

```bash
# 1. 查看当前目录
pwd

# 2. 列出文件
ls -la

# 3. 创建测试文件
echo "Hello from TermCat" > test.txt

# 4. 查看文件内容
cat test.txt

# 5. 编辑文件
vim test.txt
# (在vim中添加更多内容，然后保存退出)

# 6. 再次查看
cat test.txt

# 7. 查看系统信息
uname -a

# 8. 查看磁盘使用
df -h

# 9. 查看内存使用
free -h

# 10. 清理测试文件
rm test.txt

# 11. 验证删除
ls -la test.txt
# (应该显示文件不存在)
```

## 📝 测试报告模板

```
✅ 基本连接：通过/失败
✅ Shell 初始化：通过/失败
✅ 简单命令：通过/失败
✅ 回车键：通过/失败
✅ 退格键：通过/失败
✅ Tab 补全：通过/失败
✅ Ctrl+C：通过/失败
✅ vim：通过/失败
✅ top：通过/失败
✅ 长输出：通过/失败
✅ 错误处理：通过/失败
✅ 复制粘贴：通过/失败

发现的问题：
1.
2.
3.

建议改进：
1.
2.
3.
```

## 🐛 提交问题时请提供

1. **完整的日志**（浏览器控制台 + 终端窗口）
2. **复现步骤**
3. **预期行为 vs 实际行为**
4. **系统环境**（操作系统、Node版本、Electron版本）
5. **SSH服务器信息**（操作系统、SSH版本）
