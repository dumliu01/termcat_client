# Logger 浏览器显示优化指南

## 🎯 问题说明

**技术限制**：JavaScript 无法改变浏览器控制台显示的 `console.log()` 调用位置。

浏览器会自动在每条日志前显示：
```
logger.ts:151 [RealFile.tsx:123] [timestamp] [level] ...
↑ 浏览器添加    ↑ 我们添加的真实位置
(无法去除)      (可以突出显示)
```

## ✅ 解决方案

### 方案 1：CSS 样式突出显示（已实现）

**效果**：真实位置使用蓝色粗体背景突出显示

```
logger.ts:151 [RealFile.tsx:123] [timestamp] ...
              ↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑
              蓝色粗体，醒目！
```

**实现**：使用 `console.log('%c...', 'style')` 添加 CSS 样式

### 方案 2：浏览器控制台过滤（推荐）

#### Chrome/Edge 控制台

**方法 A：隐藏 logger.ts 前缀**

1. 打开控制台（F12）
2. 在过滤框中输入：`-logger.ts`
3. 现在日志显示为：
   ```
   [RealFile.tsx:123] [timestamp] [level] ...
   ↑ logger.ts 前缀被隐藏了！
   ```

**方法 B：只显示特定文件的日志**

在过滤框中输入：
- `AIOpsPanel.tsx` - 只显示 AIOpsPanel 的日志
- `useAIMessageHandler` - 只显示消息处理器的日志
- `task_id=abc123` - 只显示特定任务的日志

**方法 C：组合过滤**

```
-logger.ts AIOpsPanel
↑ 隐藏 logger.ts 前缀，只显示 AIOpsPanel 的日志
```

#### Firefox 控制台

1. 右键点击日志
2. 选择 "Hide messages from logger.ts"
3. 或者在过滤框中输入 `-logger.ts`

### 方案 3：使用 Chrome DevTools 设置（推荐）

#### 永久隐藏特定文件的日志前缀

1. 打开 Chrome DevTools（F12）
2. 点击右上角 ⚙️ 图标（Settings）
3. 在左侧选择 "Ignore List"
4. 点击 "Add pattern..."
5. 添加：`**/logger.ts`
6. 保存并刷新

**效果**：以后所有日志都不会显示 logger.ts 前缀！

```
之前：logger.ts:151 [RealFile.tsx:123] ...
之后：[RealFile.tsx:123] ...  (logger.ts 被忽略了)
```

## 📊 三种方案对比

| 方案 | 效果 | 优点 | 缺点 |
|------|------|------|------|
| **方案 1：CSS 样式** | 真实位置突出显示 | 自动生效，无需配置 | logger.ts 前缀仍然显示 |
| **方案 2：控制台过滤** | 隐藏 logger.ts 前缀 | 灵活，可以随时开关 | 每次打开控制台需重新输入 |
| **方案 3：Chrome Ignore List** | 完全隐藏 logger.ts | 永久生效，一劳永逸 | 需要一次性配置 |

## 🎨 最佳实践：组合使用

**推荐配置**：

1. **一次性配置**（5 分钟）：
   - 在 Chrome DevTools 中设置 Ignore List 添加 `**/logger.ts`
   - 这样 logger.ts 前缀永久隐藏

2. **日常调试**（实时使用）：
   - CSS 样式会自动突出显示真实位置
   - 使用控制台过滤器快速定位特定文件或事件

3. **高级调试**：
   ```
   搜索：event=step-detail-received AIOpsPanel
   效果：只显示 AIOpsPanel 中的 step-detail-received 事件
   ```

## 🔍 实际效果对比

### 配置前
```
logger.ts:151 [useAIMessageHandler.ts:304] [2026-02-03 08:54:40] [DEBUG] event=step-detail-received ...
logger.ts:151 [AIOpsPanel.tsx:162] [2026-02-03 08:54:10] [DEBUG] event=message-accepted-loading ...
logger.ts:151 [useAIMessageHandler.ts:475] [2026-02-03 08:54:40] [DEBUG] event=step-detail-created ...
```

**问题**：logger.ts:151 重复出现，干扰视线

### 配置后（Ignore List + CSS）
```
[useAIMessageHandler.ts:304] [2026-02-03 08:54:40] [DEBUG] event=step-detail-received ...
↑↑↑ 蓝色粗体背景，醒目

[AIOpsPanel.tsx:162] [2026-02-03 08:54:10] [DEBUG] event=message-accepted-loading ...
↑↑↑ 蓝色粗体背景，醒目

[useAIMessageHandler.ts:475] [2026-02-03 08:54:40] [DEBUG] event=step-detail-created ...
↑↑↑ 蓝色粗体背景，醒目
```

**改进**：
- ✅ logger.ts 前缀消失
- ✅ 真实位置突出显示
- ✅ 一眼就能看到调用位置

## 🚀 快速设置指南（5分钟）

### 步骤 1：设置 Chrome Ignore List（2分钟）

1. 按 F12 打开 DevTools
2. 按 F1 打开 Settings（或点击 ⚙️ 图标）
3. 左侧选择 "Ignore List"
4. 勾选 ✅ "Enable Ignore Listing"
5. 点击 "Add pattern..."
6. 输入：`**/logger.ts`
7. 点击 "Add"
8. 关闭 Settings

### 步骤 2：验证效果（1分钟）

1. 刷新页面（Cmd/Ctrl + R）
2. 打开控制台
3. 触发一些日志输出
4. 查看日志：
   - ✅ logger.ts 前缀应该消失
   - ✅ 真实位置显示为蓝色粗体

### 步骤 3：学习过滤（2分钟）

在控制台过滤框中尝试：
- 输入：`AIOpsPanel` - 只看这个文件的日志
- 输入：`event=step-detail` - 只看这个事件的日志
- 输入：`-ERROR` - 隐藏所有 ERROR 级别的日志

## 💡 常见问题

### Q: 为什么不能从代码中完全去掉 logger.ts 前缀？

**A**: 这是 JavaScript 和浏览器的技术限制。

浏览器会自动记录调用 `console.log()` 的位置：
```javascript
// logger.ts 第 151 行
console.log(message);  // <- 浏览器记录这个位置
```

无法通过以下方式改变：
- ❌ `console.log.call()` - 不改变调用栈
- ❌ `eval()` - 不安全且有独立调用栈
- ❌ `Function()` 构造函数 - 仍然在 logger.ts 调用

### Q: 设置 Ignore List 后，如果我需要调试 logger.ts 本身怎么办？

**A**: 有两种方法：

1. **临时禁用**：
   - 打开 Settings → Ignore List
   - 取消勾选 "Enable Ignore Listing"

2. **使用过滤器**：
   - 在控制台输入：`logger.ts`
   - 现在只显示 logger.ts 的日志

### Q: 其他浏览器支持吗？

**A**: 支持情况：

| 浏览器 | Ignore List | CSS 样式 | 控制台过滤 |
|--------|-------------|----------|-----------|
| Chrome | ✅ 完全支持 | ✅ 支持 | ✅ 支持 |
| Edge | ✅ 完全支持 | ✅ 支持 | ✅ 支持 |
| Firefox | ⚠️ 部分支持 | ✅ 支持 | ✅ 支持 |
| Safari | ⚠️ 部分支持 | ✅ 支持 | ✅ 支持 |

**Firefox 替代方案**：右键日志 → "Filter out logger.ts messages"

### Q: CSS 样式能自定义吗？

**A**: 可以！修改 `logger.ts` 的 `locationStyle` 变量：

```typescript
// 当前样式（蓝色背景）
const locationStyle = 'font-weight:bold;color:#2563eb;background:#eff6ff;padding:2px 4px;border-radius:3px;';

// 红色背景
const locationStyle = 'font-weight:bold;color:#dc2626;background:#fef2f2;padding:2px 4px;';

// 绿色背景
const locationStyle = 'font-weight:bold;color:#16a34a;background:#f0fdf4;padding:2px 4px;';

// 黄色背景
const locationStyle = 'font-weight:bold;color:#ca8a04;background:#fefce8;padding:2px 4px;';
```

## 📚 相关链接

- [Chrome DevTools: Ignore List](https://developer.chrome.com/docs/devtools/settings/ignore-list/)
- [Console API: Styling](https://developer.chrome.com/docs/devtools/console/format-style/)
- [Firefox Console: Filtering](https://firefox-source-docs.mozilla.org/devtools-user/browser_console/)

---

**更新日期**：2026-02-03
**状态**：✅ CSS 样式已实现，Ignore List 需用户配置
**推荐**：强烈建议配置 Chrome Ignore List，一劳永逸！
