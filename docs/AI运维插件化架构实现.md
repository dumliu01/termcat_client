# AI 运维插件化架构实现

> 记录 AI 运维面板从 `components/ai-ops/` 迁移为 `plugins/builtin/ai-ops/` 内置插件的架构设计与实现。

---

## 1. 架构概览

### 迁移前

AI 运维面板是一个紧耦合的大组件，所有 UI 渲染、状态管理、交互逻辑混合在 `components/ai-ops/` 目录中：

```
components/ai-ops/
├── AIOpsMessages.tsx          # 消息列表渲染（包含全部消息类型的判断逻辑）
├── MessageBubble.tsx          # 单条消息气泡（内含 Markdown 渲染 + 代码块）
├── AgentUxStepDetail.tsx      # 步骤详情（命令确认 / 执行 / 结果）
├── AgentUxCommandConfirm.tsx  # 高风险命令二次确认
├── AgentUxPasswordInput.tsx   # 密码输入
├── AgentUxToolApproval.tsx    # Code 模式工具审批
├── AgentUxUserChoice.tsx      # 用户选择
├── OperationPlan.tsx          # 执行计划
├── hooks/                     # 8 个专用 Hook（状态/消息/命令/会话/密码/...）
└── utils/                     # 工具函数（交互检测/命令构建/...）
```

**问题**：
- UI 组件与业务消息模型强耦合，无法复用
- 8 个 Hook 职责交叉，状态分散难以追踪
- 新增消息类型需修改多处渲染逻辑
- 无法作为独立插件加载/卸载

### 迁移后

采用 **三层分离** 架构：

```
┌─────────────────────────────────────────────────┐
│  plugins/builtin/ai-ops/                        │  ← 插件层（业务编排）
│  ├── index.ts          插件注册                  │
│  ├── AIOpsPanel.tsx    主面板                    │
│  ├── adapter/toMsgBlocks.ts  消息适配器          │
│  ├── components/       插件专属 UI 组件          │
│  └── hooks/            插件专属 Hook             │
├─────────────────────────────────────────────────┤
│  hooks/useAIAgent.ts                            │  ← 逻辑层（统一 Hook）
│  modules/ai-agent/                              │
├─────────────────────────────────────────────────┤
│  components/msg-viewer/                         │  ← 展示层（通用控件）
│  ├── MsgViewer.tsx     虚拟化列表               │
│  ├── types.ts          Block 类型定义            │
│  └── blocks/           Block 渲染组件            │
└─────────────────────────────────────────────────┘
```

---

## 2. 核心设计

### 2.1 msg-viewer 通用控件

与业务逻辑完全解耦的富消息展示控件，只关心"显示什么"和"用户做了什么操作"。

**Block 联合类型**（`msg-viewer/types.ts`）：

| Block 类型 | 渲染组件 | 说明 |
|-----------|---------|------|
| `user_text` | `UserTextBubble` | 用户消息 + 文件附件 |
| `assistant_text` | `AssistantTextBubble` | AI 回复（Markdown + 可执行代码块） |
| `command_suggestion` | `CommandSuggestionCard` | 命令建议 |
| `operation_plan` | `OperationPlanCard` | 执行计划（步骤列表 + 进度） |
| `step_detail` | `StepDetailCard` | 步骤详情（确认 / 执行 / 密码 / 结果） |
| `tool_use` | `ToolUseCard` | 工具调用审批（Code 模式非 Bash） |
| `user_choice` | `UserChoiceCard` | 用户选择提示 |
| `feedback` | `FeedbackPrompt` | 任务完成反馈（完成 / 继续） |
| `ad` | `AdBubble` | 广告（API / Script 双模式） |
| `loading` | `LoadingIndicator` | 加载状态 |

**MsgViewerActions 接口**：统一的操作回调，包括命令执行、步骤确认/跳过、密码提交、工具审批、用户选择、反馈等。msg-viewer 不知道这些操作的业务含义，只负责在用户交互时调用对应回调。

### 2.2 Adapter 适配器

`plugins/builtin/ai-ops/adapter/toMsgBlocks.ts` 负责将业务消息模型转换为 msg-viewer 的通用 Block 模型：

```
AIOpsMessage[] ──toMsgBlocks()──→ MsgBlock[]
```

**转换规则**：

| AIOpsMessage 特征 | 生成的 Block |
|-------------------|-------------|
| `role === 'user'` | `user_text` |
| `taskType === 'answer'` 或无 taskState | `assistant_text` |
| 有 `suggestion` | `command_suggestion` |
| `taskType === 'operation'` 且有 plan | `operation_plan` |
| `taskType === 'step_detail'` | `step_detail` |
| `taskType === 'tool_use'` + Bash | `step_detail`（复用） |
| `taskType === 'tool_use'` + 非 Bash | `tool_use` |
| `taskType === 'user_choice'` | `user_choice` |
| `status === 'waiting_feedback'` | `feedback` |

一条 AIOpsMessage 可能产生 1~N 个 Block（例如同时有 content + suggestion）。

广告消息 `AdMessage[]` 通过双指针归并按时间戳插入。

### 2.3 插件注册

```typescript
// plugins/builtin/ai-ops/index.ts
export const aiOpsPlugin: BuiltinPlugin = {
  id: 'builtin-ai-ops',
  activate(context) {
    context.registerSidebarPanel({
      id: 'ai-ops',
      position: 'right',
      component: AIOpsWrapper,
      defaultWidth: 360,
      defaultVisible: false,
      storageKeyPrefix: 'termcat_ai_panel',
    });
  },
};
```

**AIOpsWrapper** 将 `SidebarPanelProps` 适配为 `AIOpsPluginPanel` 的 props：
- 从 `AIServiceContext` 获取 `user`、`sharedConn`、`availableModels`
- 通过 `builtinPluginManager.emit()` 事件总线通知宿主执行命令、更新积分余额

### 2.4 useAIAgent 统一 Hook

替代旧版 8 个分散 Hook，集中管理：
- AI Agent 实例创建/销毁
- WebSocket 共享连接（`useSharedAIConnection`）
- Executor 生命周期（独立 effect，支持 sshMode 热切换）
- 消息列表状态
- Code 模式工具权限审批 + 密码处理 + 反馈
- 会话记录持久化

---

## 3. 数据流

### 完整渲染流程

```
用户发送消息
  ↓
useAIAgent.sendMessage()
  ↓ WebSocket
Agent Server 返回消息流（ANSWER / STEP_DETAIL / TOOL_USE / ...）
  ↓
AIAgent 事件 → useAIAgent 更新 messages: AIOpsMessage[]
  ↓
AIOpsPanel 调用 toMsgBlocks(messages, adMessages)
  ↓ useMemo
MsgBlock[]
  ↓
<MsgViewer blocks={blocks} actions={actions} />
  ↓
BlockRenderer 按 block.type 分发 → 具体 Block 组件渲染
```

### 交互回调流程

```
用户点击 StepDetailCard 的"执行"按钮
  ↓
actions.onStepConfirm(blockId, stepIndex, command, risk, needsConfirmation)
  ↓
AIOpsPanel 的 handleStepConfirm 回调
  ↓
  ├─ 高风险？→ 设置 waiting_user_confirm 状态 → CommandConfirmation 二次确认
  ├─ 需要密码？→ 设置 waiting_password 状态 → PasswordInput
  └─ 直接执行 → useAIAgent.executeViaAgent(taskId, stepIndex, command)
       ↓
     AIAgent.confirmExecute() → 服务端执行 → 结果回填
```

---

## 4. 已删除的旧代码

以下文件在插件化完成后已删除：

### 旧组件（14 个）
- `AIOpsMessages.tsx`、`MessageBubble.tsx`、`AdMessageBubble.tsx`
- `CommandSuggestion.tsx`、`OperationPlan.tsx`、`LoadingIndicator.tsx`、`FileAttachment.tsx`
- `AgentUxCommandConfirm.tsx`、`AgentUxPasswordDialog.tsx`、`AgentUxPasswordInput.tsx`
- `AgentUxStepDetail.tsx`、`AgentUxStepUtils.tsx`、`AgentUxToolApproval.tsx`、`AgentUxUserChoice.tsx`

### 旧 Hook（8 个）
- `useAIOpsState.ts`、`useAIOpsMessages.ts`、`useCommandExecution.ts`
- `useShellSession.ts`、`useInteractivePrompt.ts`、`usePasswordHandler.ts`
- `useFileAttachment.ts`、`useTaskManagement.ts`

### 旧工具函数（4 个）
- `utils/interactiveDetector.ts`、`utils/messageFilter.ts`
- `utils/pagerDetector.ts`、`utils/shellCommandBuilder.ts`

> 工具函数在 `modules/ai-agent/utils/` 下有独立副本，供 AIAgent SDK 使用。

### 过渡文件
- `components/AIOpsPanel.agent.tsx`（中间过渡版本，已被插件版替代）

### 已迁入插件的组件（7 个）
以下文件已从 `components/ai-ops/` 完全迁移至插件目录，`components/ai-ops/` 已删除：

| 插件路径 | 说明 |
|----------|------|
| `plugins/builtin/ai-ops/components/AIOpsHeader.tsx` | AI 面板头部（模式/模型切换） |
| `plugins/builtin/ai-ops/components/AIOpsInput.tsx` | AI 输入框（文件附件 + 发送） |
| `plugins/builtin/ai-ops/components/AgentSuggestion.tsx` | Agent 模式建议组件 |
| `plugins/builtin/ai-ops/components/InteractionDialog.tsx` | 交互式确认对话框 |
| `plugins/builtin/ai-ops/components/ConversationList.tsx` | 会话记录列表 |
| `plugins/builtin/ai-ops/components/InsufficientGemsModal.tsx` | Gems 不足提示弹窗 |
| `plugins/builtin/ai-ops/hooks/useAdManager.ts` | 广告调度管理 |

---

## 5. 新增消息类型指南

新增一种 AI 消息的展示类型需要修改 3 处：

1. **定义 Block 类型**：`components/msg-viewer/types.ts` 添加新的 Block interface 并加入 `MsgBlock` 联合类型
2. **实现渲染组件**：`components/msg-viewer/blocks/` 添加对应的 React 组件，在 `BlockRenderer.tsx` 注册
3. **实现适配映射**：`plugins/builtin/ai-ops/adapter/toMsgBlocks.ts` 的 `convertMessage()` 中添加转换逻辑

如果新类型需要用户交互，还需在 `MsgViewerActions` 接口中添加回调，并在 `AIOpsPanel.tsx` 中实现对应处理。

---

**项目**: TermCat Client
**最后更新**: 2026-03-11
