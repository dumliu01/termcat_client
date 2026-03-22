# 远程文件匹配功能改进说明

## 改进概述

本次更新完全重构了远程文件匹配和目录状态管理逻辑，解决了 cd 命令失败导致目录状态不同步的问题，并新增了路径深度匹配功能。

---

## 核心问题分析

### 原有问题

1. **目录状态不同步**
   - 前端通过正则解析 cd 命令，推测目标目录
   - 推测的目录立即同步到后端
   - 但如果 cd 命令在 shell 中实际失败（如目录不存在），前端仍认为 cd 成功
   - 导致前端认为的目录和终端实际目录不一致，文件匹配出错

2. **缺少深度匹配**
   - 只能匹配当前目录下的文件
   - 无法处理部分路径输入（如 `cd /home/` 按 Tab 无法继续匹配 `/home/` 下的文件）

---

## 解决方案

### 1. 目录状态管理策略调整

**核心思路：单一真实来源（Single Source of Truth）**

- **移除预测性目录更新**：不再在前端预先解析 cd 命令并更新目录状态
- **依赖 shell 提示符解析**：完全依赖 shell 输出的提示符来获取当前目录
- **被动式同步**：只有当 shell 提示符中的目录发生变化时，才更新目录状态

**改动位置：`CommandInputArea.tsx:799-810`**

```typescript
// 处理 Enter 执行命令
if (e.key === 'Enter') {
  setHistoryIndex(-1);
  const fullCommand = inputValue + autoCompleteText;
  resetCompletionState();

  // 注意：不再预先更新目录状态
  // cd命令的目录更新将完全依赖 shell 输出的提示符解析
  // 这样可以确保只有当cd命令真正成功时，目录状态才会更新

  onExecute(fullCommand);
}
```

**优势**：
- cd 命令失败时，目录状态不会错误更新
- 目录状态始终与终端实际状态一致
- 无需维护复杂的路径解析和错误处理逻辑

---

### 2. 实现路径深度匹配

**核心功能：解析输入路径，匹配任意深度目录下的文件**

**新增函数：`parseInputPath()`**

位置：`CommandInputArea.tsx:273-325`

功能：
- 解析输入路径，分离目标目录和文件名前缀
- 支持绝对路径（如 `/home/user/`）
- 支持相对路径（如 `../dir/`）
- 支持 home 目录（如 `~/dir/`）
- 处理路径规范化（如 `..`、`.`）

示例：
```typescript
// 输入: "cd /home/u"，当前目录: "/root"
parseInputPath("/home/u", "/root")
// 返回: { directory: "/home", prefix: "u" }

// 输入: "cd ../etc/a"，当前目录: "/home/user"
parseInputPath("../etc/a", "/home/user")
// 返回: { directory: "/home/etc", prefix: "a" }
```

**改进 `findFileCompletionMatches()`**

位置：`CommandInputArea.tsx:327-370`

新逻辑：
1. 使用 `parseInputPath()` 解析输入，获取目标目录和文件名前缀
2. 调用 `sshListDir()` 获取目标目录的文件列表
3. 过滤出以文件名前缀开头的文件
4. 返回匹配结果

示例场景：
```bash
# 当前目录: /root
# 用户输入: cd /home/
# 按 Tab
# → 列出 /home/ 下的所有文件/目录

# 用户输入: cd /home/u
# 按 Tab
# → 列出 /home/ 下以 u 开头的文件/目录（如 ubuntu/）
```

---

### 3. 优化文件列表获取

**改进 SFTP 目录类型识别**

位置：`ssh-service.ts:354-357`

原逻辑：
```typescript
// 根据 longname 判断是否是目录（不可靠）
return item.filename + (item.longname.endsWith('/') ? '/' : '');
```

新逻辑：
```typescript
// 使用 SFTP attrs.isDirectory() 方法判断
const isDir = item.attrs && item.attrs.isDirectory && item.attrs.isDirectory();
return item.filename + (isDir ? '/' : '');
```

**改进 shell ls 命令**

位置：`ssh-service.ts:372`

原命令：`ls -1`

新命令：`ls -1Fp`
- `-F`：在目录后添加 `/` 标识
- `-p`：确保目录以 `/` 结尾

**路径规范化**

位置：`ssh-service.ts:315`

```typescript
// 移除末尾多余的 /，但保留根目录的 /
const normalizedPath = path.replace(/\/+$/, '') || '/';
```

---

## 测试场景

### 场景 1：cd 命令失败时目录状态保持正确

**步骤**：
1. 当前目录：`/root`
2. 输入命令：`cd /nonexistent`（不存在的目录）
3. 按 Enter 执行

**预期结果**：
- cd 命令失败，shell 输出错误信息
- 前端目录状态仍然是 `/root`（不会错误更新为 `/nonexistent`）
- 按 Tab 匹配时，匹配的是 `/root` 下的文件

---

### 场景 2：深度路径匹配

**步骤**：
1. 当前目录：`/root`
2. 输入命令：`cd /home/`
3. 按 Tab

**预期结果**：
- 列出 `/home/` 下的所有文件和目录
- 如果只有一个匹配项（如 `ubuntu/`），自动补全为 `cd /home/ubuntu/`
- 如果有多个匹配项，显示列表供选择

---

### 场景 3：相对路径深度匹配

**步骤**：
1. 当前目录：`/home/user`
2. 输入命令：`cd ../../etc/`
3. 按 Tab

**预期结果**：
- 解析路径：`/home/user` + `../../etc/` = `/etc/`
- 列出 `/etc/` 下的所有文件和目录

---

### 场景 4：部分文件名匹配

**步骤**：
1. 当前目录：`/root`
2. 输入命令：`ls /home/u`
3. 按 Tab

**预期结果**：
- 列出 `/home/` 下以 `u` 开头的文件/目录
- 例如：`ubuntu/`、`user/`

---

### 场景 5：目录切换后文件匹配

**步骤**：
1. 当前目录：`/root`
2. 输入并执行：`cd /home`
3. shell 提示符变为：`user@host:/home$`
4. 输入命令：`ls `
5. 按 Tab

**预期结果**：
- 前端从提示符中解析到当前目录是 `/home`
- 按 Tab 匹配时，列出 `/home/` 下的文件

---

## 技术细节

### 提示符解析（已有功能）

位置：`CommandInputArea.tsx:93-162`

监听 shell 数据流，使用正则表达式从提示符中提取当前目录：

支持的提示符格式：
- `user@host:/path/to/dir$`
- `[user@host /path/to/dir]#`
- `/path/to/dir $`
- `/ #`（根目录）

提取成功后：
1. 更新前端 `currentDirectory` 状态
2. 调用 `sshUpdateCwd()` 同步到后端

---

## 关键改进点总结

1. **目录状态管理**：从"预测式"改为"被动式"，确保状态一致性
2. **深度路径匹配**：支持匹配任意深度目录，不再局限于当前目录
3. **路径解析**：支持绝对路径、相对路径、home 目录等多种格式
4. **SFTP 优化**：使用标准 API 判断文件类型，更加可靠
5. **错误处理**：自动回退机制（SFTP → shell ls）

---

## 后续优化建议

1. **性能优化**：
   - 考虑缓存目录列表，减少 SSH 请求
   - 缓存失效策略：cd 成功后清空缓存

2. **用户体验**：
   - 显示加载状态（当前正在获取文件列表）
   - 错误提示（目录不存在时的友好提示）

3. **边界情况处理**：
   - 软链接目录的处理
   - 权限不足的目录处理
   - 网络延迟时的超时处理

---

## 修改的文件清单

1. `termcat_client/src/components/CommandInputArea.tsx`
   - 新增 `parseInputPath()` 函数
   - 改进 `findFileCompletionMatches()` 支持深度匹配
   - 改进 `performAutoComplete()` 使用新的匹配逻辑
   - 移除 cd 命令的预测性目录更新

2. `termcat_client/src/main/ssh-service.ts`
   - 改进 `listDirectory()` 路径规范化
   - 改进 `listDirectoryViaSFTP()` 使用 `attrs.isDirectory()`
   - 改进 `listDirectoryViaShell()` 使用 `ls -1Fp` 命令

---

## 测试建议

### 手动测试

1. **基础功能测试**
   - 当前目录文件匹配
   - cd 命令补全
   - ls 命令参数补全

2. **深度匹配测试**
   - 绝对路径匹配：`cd /home/` + Tab
   - 相对路径匹配：`cd ../dir/` + Tab
   - home 路径匹配：`cd ~/dir/` + Tab

3. **错误场景测试**
   - cd 到不存在的目录
   - cd 到无权限的目录
   - 网络断开时的行为

4. **边界情况测试**
   - 根目录 `/` 的匹配
   - 空目录的匹配
   - 特殊字符文件名的匹配

### 自动化测试（建议添加）

建议为以下功能添加单元测试：
- `parseInputPath()` 路径解析
- 路径规范化逻辑
- 提示符解析正则表达式

---

## 结论

本次改进从根本上解决了目录状态同步的问题，并实现了用户期待的深度路径匹配功能。改进后的系统更加健壮、可靠，用户体验也得到了显著提升。
