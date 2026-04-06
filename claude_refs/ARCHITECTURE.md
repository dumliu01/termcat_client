# TermCat Client - 程序架构文档

> 📐 本文档为 Claude Code 开发时的架构参考，与 `CLAUDE.md` 互补。
> `CLAUDE.md` 侧重 **开发规范**，本文档侧重 **系统结构**。

---

## 1. 概述

### 🎯 项目使命

**AI 驱动的智能远程终端管理桌面应用** —— 集 SSH 终端、文件管理、系统监控、AI 运维于一体。

### 技术栈

| 层次 | 技术 |
|------|------|
| 桌面框架 | Electron 28（Main + Renderer + Preload 三进程模型） |
| UI 框架 | React 18 + TypeScript 5 |
| 构建工具 | Vite 5 + vite-plugin-electron |
| 样式系统 | Tailwind CSS 3 |
| 终端渲染 | xterm.js（FitAddon / Unicode11Addon / WebLinksAddon） |
| SSH 连接 | ssh2（Node.js 原生，Main 进程） |
| AI 通信 | WebSocket（连接 Agent Server） |
| 代码编辑 | CodeMirror 6（多语言语法高亮） |
| 国际化 | 自研 I18nContext（zh / en / es） |
| 图标 | lucide-react |

### 三进程模型

```
┌─────────────────────────────────────────────┐
│              Main Process (Node.js)          │
│  ├── main.ts          入口 + 窗口管理        │
│  ├── ssh-service.ts   SSH 连接管理           │
│  ├── file-transfer-service.ts  SFTP 传输     │
│  └── tunnel-service.ts  端口隧道             │
└──────────────┬──────────────────────────────┘
               │ IPC (contextBridge)
┌──────────────▼──────────────────────────────┐
│            Preload Script                    │
│  └── preload.ts  安全 IPC 桥接              │
└──────────────┬──────────────────────────────┘
               │
┌──────────────▼──────────────────────────────┐
│          Renderer Process (React)            │
│  ├── App.tsx          根组件 + 全局状态      │
│  ├── components/      UI 组件               │
│  ├── services/        前端服务层            │
│  ├── hooks/           自定义 Hook           │
│  ├── modules/ai-agent AI Agent SDK          │
│  ├── contexts/        React Context         │
│  ├── locales/         多语言包              │
│  ├── types/           TypeScript 类型定义    │
│  └── utils/           工具函数              │
└─────────────────────────────────────────────┘
```

---

## 2. 目录结构（自动生成区域）

> 💡 此区域由 `scripts/update_architecture_manifest.py` 自动维护，
> 通过 Claude Code Hook（PostToolUse → Write|Edit）触发更新。

<!-- AUTO-GENERATED:START -->
<!-- 自动生成，请勿手动编辑此区域 | Auto-generated, do not edit manually -->
<!-- 最后更新: 2026-04-06 17:34:48 -->

```
termcat_client/
├── index.html
├── package.json
├── postcss.config.js
├── tailwind.config.js
├── tsconfig.json
├── tsconfig.node.json
├── vite.config.ts
└── src/
    ├── vite-env.d.ts                           # <reference types="vite/client" />
    ├── base/
    │   ├── http/
    │   │   └── api.ts
    │   ├── i18n/
    │   │   ├── I18nContext.tsx                 # 多语言 Context 和 Hook
    │   │   └── locales/
    │   │       ├── en.ts                       # English Language Pack
    │   │       ├── es.ts                       # Paquete de Idioma Español
    │   │       ├── index.ts                    # Internationalization Configuration Index
    │   │       └── zh.ts                       # 中文语言包
    │   ├── logger/
    │   │   ├── log-file-writer.ts              # Log File Writer
    │   │   └── logger.ts                       # TermCat Client Logging Component
    │   └── websocket/
    │       └── aiWebSocketService.ts           # AI WebSocket Service (Compatibility Layer)
    ├── core/
    │   ├── ad/
    │   │   ├── adService.ts                    # Ad Service - Multi-platform Aggregator
    │   │   ├── index.ts                        # Ad Service Module Exports
    │   │   ├── types.ts                        # Ad System Type Definitions
    │   │   └── platforms/
    │   │       ├── AdMobPlatform.ts            # Google AdMob Ad Platform (script mode)
    │   │       ├── AdsterraPlatform.ts         # Adsterra Ad Platform (script mode)
    │   │       ├── CSJPlatform.ts              # ByteDance CSJ Ad Platform (Pangolin / 穿山甲)
    │   │       ├── CarbonAdsPlatform.ts        # Carbon Ads Ad Platform
    │   │       ├── GDTPlatform.ts              # Tencent GDT Ad Platform (Guangdiantong / 优量汇)
    │   │       └── SelfHostedPlatform.ts       # Self-Hosted Ad Platform
    │   ├── ai-agent/
    │   │   ├── AIAgent.ts                      # AI Agent Core Class
    │   │   ├── AIAgentConnection.ts            # AI Agent WebSocket Connection Management
    │   │   ├── EventEmitter.ts                 # Lightweight EventEmitter Implementation
    │   │   ├── ICommandExecutor.ts             # Command Executor Interface
    │   │   ├── index.ts                        # AI Agent 独立模块
    │   │   ├── types.ts                        # AI Agent Module Type Definitions
    │   │   ├── cli/
    │   │   │   ├── NodeWebSocket.ts            # Node.js WebSocket Adapter
    │   │   │   ├── TerminalRenderer.ts         # Terminal Renderer
    │   │   │   └── cli-agent.ts
    │   │   ├── executors/
    │   │   │   ├── BaseShellExecutor.ts        # Shell Command Executor Base Class
    │   │   │   ├── DirectSSHExecutor.ts        # Direct SSH Command Executor
    │   │   │   ├── ElectronShellExecutor.ts    # Electron Shell Command Executor
    │   │   │   ├── LocalShellExecutor.ts       # Local Shell Command Executor
    │   │   │   ├── MockExecutor.ts             # Mock Command Executor
    │   │   │   └── NodeSSHShellExecutor.ts     # Node.js SSH Shell 命令执行器
    │   │   ├── testing/
    │   │   │   └── MockAIAgentConnection.ts    # Mock AI Agent Connection
    │   │   └── utils/
    │   │       ├── interactiveDetector.ts      # Interactive Prompt Detector
    │   │       ├── markerDetector.ts           # Command Completion Detector (Clean Solution)
    │   │       ├── pagerDetector.ts            # 分页器检测器
    │   │       └── shellCommandBuilder.ts      # Shell Command Builder
    │   ├── auth/
    │   │   └── authService.ts
    │   ├── chat/
    │   │   ├── chatHistoryService.ts           # 会话记录服务（Renderer 进程）
    │   │   ├── types.ts                        # AI Conversation Record Type Definitions
    │   │   └── utils.ts                        # Conversation Record Utility Functions
    │   ├── commerce/
    │   │   ├── commerceService.ts              # Commerce Configuration Service
    │   │   ├── paymentService.ts
    │   │   └── types.ts                        # Commerce Configuration Type Definitions
    │   ├── host/
    │   │   ├── hostService.ts
    │   │   └── hostStorageService.ts
    │   ├── license/
    │   │   ├── licenseService.ts               # License Service
    │   │   └── types.ts                        # License System Type Definitions
    │   ├── monitor/
    │   │   ├── systemMonitorService.ts
    │   │   └── monitors/
    │   │       ├── darwinMonitor.ts
    │   │       ├── linuxMonitor.ts
    │   │       ├── types.ts
    │   │       └── windowsMonitor.ts
    │   ├── plugin/
    │   │   └── pluginService.ts                # Plugin Service (Renderer Process)
    │   ├── pty/
    │   │   └── local-pty-manager.ts            # Local PTY service
    │   ├── ssh/
    │   │   ├── ssh-config-parser.ts
    │   │   ├── ssh-manager.ts
    │   │   └── sshService.ts
    │   ├── terminal/
    │   │   ├── HostConnectionFactory.ts        # Host connection factory
    │   │   ├── ICmdExecutor.ts                 # One-time command executor abstraction interface
    │   │   ├── IFsHandler.ts                   # File system operation abstraction interface
    │   │   ├── IHostConnection.ts              # Unified entry point for Host connections
    │   │   ├── ITerminalBackend.ts             # Abstract terminal backend interface
    │   │   ├── LocalCmdExecutor.ts             # Local command executor
    │   │   ├── LocalFsHandler.ts               # Local file system operations
    │   │   ├── LocalHostConnection.ts          # Local host connection
    │   │   ├── LocalPrivateShellExecutor.ts    # Local Private Shell Executor
    │   │   ├── LocalTerminalBackend.ts         # Local terminal backend
    │   │   ├── NestedSSHDetector.ts            # NestedSSHDetector - Detects nested SSH sessions from terminal output.
    │   │   ├── PrivateShellExecutor.ts         # Private Shell Executor
    │   │   ├── ProxyCmdExecutor.ts             # ProxyCmdExecutor — transparent command execution proxy
    │   │   ├── ProxyFsHandler.ts               # ProxyFsHandler — transparent file operation proxy
    │   │   ├── SSHCmdExecutor.ts               # SSH command executor
    │   │   ├── SSHFsHandler.ts
    │   │   ├── SSHHostConnection.ts            # SSH host connection
    │   │   ├── SSHTerminalBackend.ts           # SSH terminal backend
    │   │   ├── TerminalBackendFactory.ts       # Terminal backend factory
    │   │   ├── TerminalCmdExecutor.ts          # Terminal command executor
    │   │   ├── TerminalFsHandler.ts            # Terminal-based file system handler
    │   │   ├── index.ts
    │   │   └── types.ts                        # Terminal abstraction layer type definitions
    │   ├── transfer/
    │   │   └── file-transfer-handler.ts
    │   └── tunnel/
    │       ├── tunnel-manager.ts
    │       └── tunnelService.ts
    ├── features/
    │   ├── auth/
    │   │   ├── components/
    │   │   │   └── LoginView.tsx
    │   │   └── hooks/
    │   │       └── useUserAuth.ts              # User Authentication and Login Hook
    │   ├── dashboard/
    │   │   ├── components/
    │   │   │   ├── Dashboard.tsx
    │   │   │   └── HostConfigModal.tsx
    │   │   └── hooks/
    │   │       └── useHostManager.ts           # Host / Group / Proxy CRUD Hook
    │   ├── extensions/
    │   │   └── components/
    │   │       ├── ExtensionsView.tsx
    │   │       └── PluginSettingsForm.tsx      # 插件设置表单 — 共享组件
    │   ├── payment/
    │   │   └── components/
    │   │       └── PaymentModalNew.tsx
    │   ├── settings/
    │   │   ├── components/
    │   │   │   ├── SettingAppearance.tsx
    │   │   │   ├── SettingMembershipCenter.tsx
    │   │   │   ├── SettingPersonalCenter.tsx
    │   │   │   ├── SettingPlugins.tsx          # 设置页 → 插件 tab
    │   │   │   ├── SettingSupport.tsx
    │   │   │   └── SettingsView.tsx
    │   │   └── hooks/
    │   │       └── useAppSettings.ts           # App Settings Hook
    │   ├── shared/
    │   │   ├── components/
    │   │   │   ├── Header.tsx
    │   │   │   ├── HoverPopupMenu.tsx
    │   │   │   ├── MonitoringSidebar.tsx
    │   │   │   ├── PluginNotifications.tsx     # Plugin notifications component
    │   │   │   ├── PluginStatusBar.tsx         # Plugin status bar component
    │   │   │   ├── PluginToolbar.tsx           # Plugin toolbar button component
    │   │   │   ├── Sidebar.tsx
    │   │   │   └── UpdateModal.tsx
    │   │   └── contexts/
    │   │       └── AIServiceContext.tsx        # AI service context
    │   └── terminal/
    │       ├── types.ts
    │       ├── utils.ts
    │       ├── components/
    │       │   ├── CommandInputArea.tsx
    │       │   ├── TabbedPanelGroup.tsx        # TabbedPanelGroup — Multi-panel Tab switch container at the same position
    │       │   ├── TerminalTabBar.tsx          # Terminal Tab Bar component
    │       │   ├── TerminalView.tsx
    │       │   └── XTermTerminal.tsx
    │       └── hooks/
    │           ├── useAIAgent.ts               # useAIAgent — AIAgent 模块的 React 适配层
    │           ├── useAIWebSocket.ts
    │           ├── useBuiltinPlugins.ts        # useBuiltinPlugins - Builtin Plugin System React Hook
    │           ├── usePanelData.ts             # UI Contribution Point React Hooks
    │           ├── usePlugins.ts               # usePlugins - Plugin System React Hook
    │           ├── useSessionManager.ts        # Terminal Session Manager Hook
    │           └── useSharedAIConnection.ts    # useSharedAIConnection — User-level shared AI WebSocket connection management
    ├── main/
    │   ├── chat-history-service.ts             # Chat History Persistence Service (Main Process)
    │   ├── main.ts
    │   ├── window-manager.ts                   # src/main/window-manager.ts
    │   └── services/
    │       └── local-fs-provider.ts            # Local File System Operations Provider (Main Process)
    ├── plugins/
    │   ├── index.ts                            # TermCat 插件系统 - 统一导出
    │   ├── plugin-api.ts                       # TermCat Plugin API Implementation
    │   ├── plugin-manager.ts                   # TermCat 插件管理器（Main 进程）
    │   ├── types.ts                            # TermCat 插件系统 - 类型定义
    │   ├── builtin/
    │   │   ├── builtin-plugin-manager.ts       # Builtin Plugin Manager (Renderer Process)
    │   │   ├── events.ts                       # Builtin Plugin Event Constants
    │   │   ├── index.ts                        # 内置插件注册中心
    │   │   ├── types.ts                        # Builtin Plugin Type Definitions
    │   │   ├── ai-ops/
    │   │   │   ├── AIOpsPanel.tsx              # AI Ops Panel (Plugin version)
    │   │   │   ├── i18n.ts
    │   │   │   ├── index.ts                    # 内置插件：AI 运维面板（右侧边栏）
    │   │   │   ├── adapter/
    │   │   │   │   └── toMsgBlocks.ts          # AIOpsMessage[] + AdMessage[] → MsgBlock[] Adapter
    │   │   │   ├── components/
    │   │   │   │   ├── AIOpsHeader.tsx         # AI 运维面板头部组件
    │   │   │   │   ├── AIOpsInput.tsx          # AI Ops Input Area Component
    │   │   │   │   ├── AgentSuggestion.tsx     # Agent 模式建议组件
    │   │   │   │   ├── ConversationList.tsx    # 会话记录列表组件
    │   │   │   │   ├── DeviceActivationDialog.tsx  # Device Activation Dialog Component
    │   │   │   │   ├── InsufficientGemsModal.tsx
    │   │   │   │   ├── InteractionDialog.tsx   # 交互式确认对话框组件
    │   │   │   │   └── PurchaseDialog.tsx      # Purchase Dialog Component
    │   │   │   ├── hooks/
    │   │   │   │   └── useAdManager.ts         # 广告调度管理 Hook
    │   │   │   └── locales/
    │   │   │       ├── en.ts
    │   │   │       ├── es.ts
    │   │   │       ├── index.ts
    │   │   │       └── zh.ts
    │   │   ├── command-library/
    │   │   │   ├── i18n.ts
    │   │   │   ├── index.ts                    # 内置插件：快捷命令库（底部面板）
    │   │   │   ├── components/
    │   │   │   │   └── CommandLibraryPanel.tsx
    │   │   │   └── locales/
    │   │   │       ├── en.ts
    │   │   │       ├── es.ts
    │   │   │       ├── index.ts
    │   │   │       └── zh.ts
    │   │   ├── demo-panel/
    │   │   │   └── index.ts                    # 示例内置插件：模板驱动面板 Demo
    │   │   ├── file-browser/
    │   │   │   ├── i18n.ts
    │   │   │   ├── index.ts                    # 内置插件：文件浏览器（底部面板）
    │   │   │   ├── components/
    │   │   │   │   ├── FileBrowserPanel.tsx
    │   │   │   │   ├── FileContextMenu.tsx
    │   │   │   │   ├── FileEditorModal.tsx
    │   │   │   │   ├── FileListPanel.tsx
    │   │   │   │   ├── FilePermissionModal.tsx
    │   │   │   │   ├── FileTreePanel.tsx
    │   │   │   │   └── InputDialog.tsx
    │   │   │   └── locales/
    │   │   │       ├── en.ts
    │   │   │       ├── es.ts
    │   │   │       ├── index.ts
    │   │   │       └── zh.ts
    │   │   ├── monitoring-sidebar/
    │   │   │   ├── MonitoringSidebarPanel.tsx  # Monitoring sidebar panel component (Plugin version)
    │   │   │   ├── i18n.ts
    │   │   │   ├── index.ts                    # Builtin plugin: System Monitor Sidebar (Template-driven version)
    │   │   │   ├── locales/
    │   │   │   │   ├── en.ts
    │   │   │   │   ├── es.ts
    │   │   │   │   ├── index.ts
    │   │   │   │   └── zh.ts
    │   │   │   └── services/
    │   │   │       ├── systemMonitorService.ts
    │   │   │       └── monitors/
    │   │   │           ├── darwinMonitor.ts
    │   │   │           ├── linuxMonitor.ts
    │   │   │           ├── types.ts
    │   │   │           └── windowsMonitor.ts
    │   │   ├── transfer-manager/
    │   │   │   ├── i18n.ts
    │   │   │   ├── index.ts                    # Builtin plugin: Transfer Manager (Bottom panel)
    │   │   │   ├── components/
    │   │   │   │   └── TransferPanel.tsx
    │   │   │   └── locales/
    │   │   │       ├── en.ts
    │   │   │       ├── es.ts
    │   │   │       ├── index.ts
    │   │   │       └── zh.ts
    │   │   └── utils/
    │   │       └── create-plugin-i18n.ts
    │   └── ui-contribution/
    │       ├── PanelRenderer.tsx               # Generic panel renderer
    │       ├── index.ts                        # UI 贡献点系统 — 统一导出
    │       ├── panel-data-store.ts             # 面板数据存储 + 事件总线
    │       ├── types.ts                        # UI 贡献点类型定义
    │       ├── templates/
    │       │   ├── AreaChartTemplate.tsx
    │       │   ├── BarChartTemplate.tsx
    │       │   ├── ButtonGroupTemplate.tsx
    │       │   ├── ColumnsTemplate.tsx
    │       │   ├── FormTemplate.tsx
    │       │   ├── GridTemplate.tsx
    │       │   ├── HeaderTemplate.tsx
    │       │   ├── KeyValueTemplate.tsx
    │       │   ├── ListTemplate.tsx
    │       │   ├── LogStreamTemplate.tsx
    │       │   ├── MetricBarsTemplate.tsx
    │       │   ├── MetricRingTemplate.tsx
    │       │   ├── NotificationTemplate.tsx
    │       │   ├── ProgressTemplate.tsx
    │       │   ├── SparklineTemplate.tsx
    │       │   ├── StatusBarTemplate.tsx
    │       │   ├── TableTemplate.tsx
    │       │   ├── TabsTemplate.tsx
    │       │   ├── TextTemplate.tsx
    │       │   ├── TreeViewTemplate.tsx
    │       │   └── index.ts                    # 模板组件注册表
    │       └── utils/
    │           ├── icon-resolver.tsx           # 字符串图标名 → lucide-react 组件解析
    │           └── theme-colors.ts             # ThemeColor → Tailwind / CSS 映射工具
    ├── preload/
    │   └── preload.ts
    ├── renderer/
    │   ├── App.tsx
    │   ├── main.tsx
    │   └── styles/
    │       └── index.css
    ├── shared-components/
    │   └── msg-viewer/
    │       ├── MsgViewer.tsx                   # MsgViewer — Universal rich message display component
    │       ├── index.ts                        # msg-viewer public API
    │       ├── locales.ts                      # msg-viewer i18n mapping
    │       ├── types.ts                        # msg-viewer type definitions
    │       ├── blocks/
    │       │   ├── AdBubble.tsx                # Ad message bubble (dual rendering mode)
    │       │   ├── AssistantTextBubble.tsx     # AI assistant text bubble
    │       │   ├── BlockRenderer.tsx           # Block dispatcher renderer
    │       │   ├── CommandSuggestionCard.tsx   # Command suggestion card
    │       │   ├── FeedbackPrompt.tsx          # Task completion feedback prompt
    │       │   ├── LoadingIndicator.tsx        # Loading indicator
    │       │   ├── OperationPlanCard.tsx       # Operation plan card
    │       │   ├── StepDetailCard.tsx          # Step detail card
    │       │   ├── ToolUseCard.tsx             # Tool use display card
    │       │   ├── UserChoiceCard.tsx          # User choice prompt card
    │       │   └── UserTextBubble.tsx          # User message bubble
    │       ├── shared/
    │       │   ├── CodeBlock.tsx               # Code block component
    │       │   ├── CommandConfirmation.tsx     # Interactive command confirmation component
    │       │   ├── CopyButton.tsx
    │       │   ├── MarkdownRenderer.tsx        # Markdown renderer
    │       │   └── PasswordInput.tsx           # Password input row component
    │       └── utils/
    │           ├── riskColors.ts               # Risk level color utility functions
    │           └── stepIcons.tsx               # Step status icons
    └── utils/
        ├── constants.ts
        ├── version.ts                          # Client version information
        └── types/
            ├── axios.d.ts                      # Axios Type Extensions
            └── index.ts
```

<!-- AUTO-GENERATED:END -->

---

## 3. 视图与页面架构

### 3.1 ViewState 路由

应用内使用简单的状态路由（非 react-router）：

```typescript
type ViewState = 'dashboard' | 'terminal' | 'settings';
```

| 视图 | 组件 | 功能 |
|------|------|------|
| `dashboard` | `Dashboard.tsx` | 主机管理、分组管理、代理配置、一键连接 |
| `terminal` | `TerminalView.tsx` | SSH 终端 + AI 面板 + 文件浏览器 + 监控 |
| `settings` | `SettingsView.tsx` | 主题、字体、语言、账户、会员 |

### 3.2 终端视图布局

```
┌────────────────────────────────────────────────────┐
│  Tab Bar (多标签，z-index 切换，避免重新挂载)        │
├─────────────────┬──────────────────┬───────────────┤
│                 │                  │               │
│  XTerm Terminal │  AI Ops Panel    │  File Browser │
│  (SSH 终端)     │  (AI 运维面板)    │  (SFTP 浏览)  │
│                 │                  │               │
│                 ├──────────────────┤               │
│                 │  Monitoring      │               │
│                 │  Sidebar         │               │
└─────────────────┴──────────────────┴───────────────┘
```

- 多标签实现：所有终端 tab 同时挂载，通过 `opacity` + `pointerEvents` + `zIndex` 切换
- AI 面板：全局可见性状态 `isAiPanelVisible`（localStorage 持久化）

---

## 4. AI 运维系统

### 4.1 运行模式

**服务端模式（积分制）：**

| 模式 | 标识 | 特点 | Gem 消耗 |
|------|------|------|---------|
| Normal | `normal` | 任务分类 → 问答/命令/操作 | 1x |
| Advanced | `agent` | 需求分析 → 执行计划 → 逐步执行 + 错误分析 | 2x |
| Code | `code` | Claude Code SDK + PreToolUse hook + 远程终端代理 + 多轮反馈 | 3x |

**本地插件模式（用户自备 API Key）：**

| 模式 | 标识 | 来源 | License |
|------|------|------|---------|
| Local Ask | `local-ask` | local-ops-aiagent 插件 | 免费 |
| Local X-Agent | `local-xagent` | local-ops-aiagent 插件 | 需购买 Agent 能力包（¥69） |
| Local Code | `local-code` | local-ops-aiagent 插件 | 需购买 Agent 能力包（¥69） |

**License 授权体系：** 插件免费安装，Ask 模式免费使用，X-Agent + Code 模式需购买"Agent 能力包"买断解锁。授权缓存有效期由服务端 `cache_ttl` 控制（默认 1 天），过期后必须联网刷新。详见 `core/license/licenseService.ts`。

### 4.2 AI Agent SDK (`src/modules/ai-agent/`)

独立的、无 UI 依赖的 AI Agent 模块，可复用于 CLI 和 Electron：

```
modules/ai-agent/
├── AIAgent.ts              # 核心状态机（事件驱动）
├── AIAgentConnection.ts    # WebSocket 连接管理
├── EventEmitter.ts         # 自研事件发射器
├── ICommandExecutor.ts     # 命令执行器接口
├── types.ts                # 类型定义（AIMessageType 等）
├── index.ts                # 统一导出
├── executors/              # 命令执行器实现
│   ├── BaseShellExecutor.ts     # 基类（shell 交互逻辑）
│   ├── ElectronShellExecutor.ts # Electron IPC 执行
│   ├── DirectSSHExecutor.ts     # 直接 SSH 执行
│   ├── NodeSSHShellExecutor.ts  # Node SSH Shell 执行
│   └── MockExecutor.ts          # 测试用 Mock
├── utils/                  # 工具函数
│   ├── interactiveDetector.ts   # 交互式命令检测
│   ├── pagerDetector.ts         # 分页器检测
│   ├── markerDetector.ts        # 标记检测
│   └── shellCommandBuilder.ts   # Shell 命令构建
├── cli/                    # CLI Agent（独立终端客户端）
│   ├── cli-agent.ts             # CLI 入口
│   ├── NodeWebSocket.ts         # Node.js WebSocket 适配
│   └── TerminalRenderer.ts      # 终端 UI 渲染
└── testing/
    └── MockAIAgentConnection.ts # 测试用连接 Mock
```

### 4.3 AI 消息协议

```typescript
enum AIMessageType {
  // Client → Server（通用）
  QUESTION                  // 用户提问
  CONFIRM_EXECUTE           // 确认执行（附带命令执行结果）
  CANCEL_EXECUTE            // 取消/跳过步骤
  STOP_TASK                 // 终止任务
  USER_CHOICE_RESPONSE      // 用户选择响应

  // Client → Server（Code 模式）
  TOOL_PERMISSION_RESPONSE  // 工具权限审批（allowed + reason）
  USER_FEEDBACK_RESPONSE    // 任务反馈（accept / continue + message）

  // Server → Client（通用）
  ANSWER                    // 流式回答
  COMMAND                   // 命令建议
  OPERATION_PLAN            // 执行计划
  OPERATION_STEP            // 步骤进度
  STEP_DETAIL               // 步骤详情
  EXECUTE_REQUEST           // 请求执行命令
  EXECUTE_RESULT            // 执行结果
  USER_CHOICE_REQUEST       // 请求用户选择
  TOOL_USE                  // Agent 工具使用通知
  ERROR                     // 错误
  COMPLETE                  // 任务完成
  TOKEN_USAGE               // Token 消耗统计

  // Server → Client（Code 模式）
  TOOL_PERMISSION_REQUEST   // 工具权限请求（含 tool_name, tool_input, risk）
  TOOL_RESULT               // 工具执行结果（tool_use_id + output）
  USER_FEEDBACK_REQUEST     // 任务完成后请求用户反馈
}
```

### 4.4 消息流程（Advanced 模式）

```
用户输入 prompt
  ↓
AIAgent.ask(prompt, mode='agent')
  ↓
AIAgentConnection.sendQuestion()
  ↓ WebSocket
Agent Server
  ↓
OPERATION_PLAN → 显示执行计划
  ↓
EXECUTE_REQUEST → AIAgent 调用 ICommandExecutor.execute()
  ↓
ICommandExecutor 在 SSH 终端执行命令
  ↓
CONFIRM_EXECUTE → 上报执行结果
  ↓
  ├─ 成功 → 下一步 EXECUTE_REQUEST
  └─ 失败 → 错误分析
       ├─ 自动修复 → 新 EXECUTE_REQUEST
       └─ USER_CHOICE_REQUEST → 显示选项 → 用户选择 → 继续
  ↓
COMPLETE → 最终总结
```

### 4.5 消息流程（Code 模式）

```
用户输入 prompt
  ↓
AIAgent.ask(prompt, mode='code')
  ↓
AIAgentConnection.sendQuestion()
  ↓ WebSocket
Agent Server (code_agent_service.py)
  ↓
ClaudeSDKClient.connect(async_generator_prompt)
  ↓
Claude 决定调用工具 → PreToolUse hook 触发
  ↓
TOOL_PERMISSION_REQUEST → 前端显示审批 UI
  ├─ Bash 工具 (mcp__remote_ops__bash):
  │   → StepDetailCard（msg-viewer 组件）
  │   → 风险评估 (_assess_bash_risk): high/medium → 二次确认 (CommandConfirmation)
  │   → sudo 检测 → 密码输入 (PasswordInput) → 缓存
  │   → 批准 → TOOL_PERMISSION_RESPONSE(allowed=true)
  │     ↓
  │   MCP bash tool → remote_terminal_proxy → EXECUTE_REQUEST → 前端 SSH 执行
  │     → EXECUTE_RESULT → SDK 继续
  └─ 非 Bash 工具 (read/write/edit/glob/grep):
      → ToolUseCard（msg-viewer 组件）
      → 批准/拒绝 → TOOL_PERMISSION_RESPONSE
  ↓
Claude 完成任务 → ResultMessage
  ↓
USER_FEEDBACK_REQUEST → 前端显示反馈 UI（FeedbackPrompt）
  ├─ 用户选"完成" → USER_FEEDBACK_RESPONSE(accept) → COMPLETE
  └─ 用户选"继续" + 新指令 → USER_FEEDBACK_RESPONSE(continue)
       → client.query(新指令) → 重新进入工具调用循环
```

### 4.6 AI 运维插件化架构

AI 运维面板已从 `components/ai-ops/` 迁移为 `plugins/builtin/ai-ops/` 内置插件，
采用 **Adapter + MsgViewer** 模式分离业务逻辑与 UI 渲染：

```
plugins/builtin/ai-ops/
├── index.ts                # 插件注册（右侧边栏）
├── AIOpsPanel.tsx          # 主面板（useAIAgent + MsgViewer）
├── adapter/
│   └── toMsgBlocks.ts      # AIOpsMessage[] → MsgBlock[] 适配器
├── components/             # re-export 共享 UI 组件
└── hooks/
    └── useAdManager.ts     # re-export 广告调度 Hook
```

**数据流**：`useAIAgent` → `AIOpsMessage[]` → `toMsgBlocks()` → `MsgBlock[]` → `MsgViewer`

**交互回调**：`MsgViewer actions` → `useAIAgent` 方法（confirmExecute / approveToolPermission / acceptFeedback 等）

| msg-viewer 组件 | 对应 Block 类型 | 交互场景 |
|-----------------|-----------------|----------|
| `StepDetailCard` | `step_detail` | 命令确认 / 执行 / 密码 / 结果 |
| `ToolUseCard` | `tool_use` | 非 Bash 工具权限审批 |
| `CommandSuggestionCard` | `command_suggestion` | 命令建议 |
| `OperationPlanCard` | `operation_plan` | 执行计划展示 |
| `UserChoiceCard` | `user_choice` | 用户选择 |
| `FeedbackPrompt` | `feedback` | 任务完成反馈 |
| `AssistantTextBubble` | `assistant_text` | AI 回复（Markdown + 可执行代码块） |

`approveToolPermission`（`useAIAgent.ts`）统一处理三阶段流程：
1. 风险检查 → 2. sudo 密码 → 3. 发送审批

---

## 5. IPC 通信（Electron）

### 5.1 通信模式

```typescript
// Main 进程注册
ipcMain.handle('ssh:connect', async (event, config) => { ... });

// Preload 暴露
contextBridge.exposeInMainWorld('electronAPI', {
  ssh: { connect: (config) => ipcRenderer.invoke('ssh:connect', config) }
});

// Renderer 调用
const result = await window.electronAPI.ssh.connect(config);
```

### 5.2 IPC 通道清单

| 通道 | 方向 | 功能 |
|------|------|------|
| `ssh:connect` | R→M | 建立 SSH 连接 |
| `ssh:disconnect` | R→M | 断开连接 |
| `ssh:data` | R→M | 发送终端输入 |
| `ssh:resize` | R→M | 终端 resize |
| `ssh:output` | M→R | 终端输出（事件流） |
| `sftp:list` | R→M | 列出目录 |
| `sftp:upload` | R→M | 上传文件 |
| `sftp:download` | R→M | 下载文件 |
| `tunnel:create` | R→M | 创建端口隧道 |
| `tunnel:close` | R→M | 关闭隧道 |
| `license:getMachineId` | R→M | 获取设备指纹（MAC+OS hash，缓存到磁盘） |

---

## 6. 前端服务层 (`src/services/`)

| 服务 | 文件 | 职责 |
|------|------|------|
| API | `api.ts` | HTTP API（RPC 风格，统一 POST + JSON Body，axios 封装，JWT 拦截器） |
| Auth | `authService.ts` | 登录/登出、Token 管理、401 事件广播 |
| AI WebSocket | `aiWebSocketService.ts` | AI WS 兼容层（委托 AIAgentConnection） |
| SSH | `sshService.ts` | SSH 连接管理（Renderer 侧） |
| Host | `hostService.ts` | 主机 CRUD + 服务器同步（双向同步模式） |
| Host Storage | `hostStorageService.ts` | 本地主机存储（localStorage） |
| File Browser | `fileBrowserService.ts` | SFTP 文件浏览 |
| Payment | `paymentService.ts` | 支付（充值 Gems / VIP / Agent 能力包） |
| License | `licenseService.ts` | 本地插件授权管理（缓存/验证/设备激活/功能门控） |
| System Monitor | `systemMonitorService.ts` | 系统指标采集（CPU/Mem/Disk/Net） |
| Tunnel | `tunnelService.ts` | 端口隧道管理 |

---

## 7. 自定义 Hook

### 全局 Hook (`src/hooks/`)

| Hook | 功能 |
|------|------|
| `useAIWebSocket` | AI WebSocket 连接生命周期管理 |
| `useAIAgent` | AIAgent 实例管理 + 状态订阅 + Code 模式工具审批/密码/反馈 |
| `useSharedAIConnection` | 用户级共享 AI WebSocket（懒建连 + 空闲断连 + 活跃任务保护） |
| `useBuiltinPlugins` | 内置插件注册的侧栏/底部面板、工具栏按钮的响应式访问 |

### AI 运维插件 Hook

| Hook | 位置 | 功能 |
|------|------|------|
| `useAdManager` | `plugins/builtin/ai-ops/hooks/` | 广告调度管理 |

> 旧版 AI Ops 专用 Hook（useAIOpsState / useCommandExecution / useShellSession 等）
> 已被 `useAIAgent` 统一替代并删除。

---

## 8. 组件结构

### 8.1 核心组件

```
components/
├── App.tsx                 # 根组件（全局状态中心）
├── Sidebar.tsx             # 侧边导航栏
├── Dashboard.tsx           # 主机管理仪表板
├── TerminalView.tsx        # 终端视图容器
├── XTermTerminal.tsx       # xterm.js 终端封装
├── LoginView.tsx           # 登录页面
├── SettingsView.tsx        # 设置页面
├── HostConfigModal.tsx     # 主机配置弹窗
├── PaymentModalNew.tsx     # 支付弹窗
├── TabbedPanelGroup.tsx    # 同位置多面板 Tab 切换容器
└── CommandInputArea.tsx    # 命令输入区域
```

### 8.2 msg-viewer 通用控件 (`components/msg-viewer/`)

与业务逻辑完全解耦的富消息展示控件，基于 react-virtuoso 虚拟化列表：

```
msg-viewer/
├── MsgViewer.tsx               # 主控件（虚拟化列表 + 自动滚动）
├── types.ts                    # Block 联合类型 + Actions 接口
├── index.ts                    # 公共 API
├── blocks/                     # Block 渲染组件
│   ├── BlockRenderer.tsx       # 分发渲染器
│   ├── AssistantTextBubble.tsx # AI 回复（Markdown + 可执行代码块）
│   ├── UserTextBubble.tsx      # 用户消息
│   ├── StepDetailCard.tsx      # 步骤详情（确认/执行/密码/结果）
│   ├── ToolUseCard.tsx         # 工具调用审批
│   ├── CommandSuggestionCard.tsx
│   ├── OperationPlanCard.tsx
│   ├── UserChoiceCard.tsx
│   ├── FeedbackPrompt.tsx      # 任务完成反馈
│   ├── AdBubble.tsx            # 广告
│   └── LoadingIndicator.tsx
├── shared/                     # 可复用子组件
│   ├── MarkdownRenderer.tsx
│   ├── CodeBlock.tsx
│   ├── CommandConfirmation.tsx # 高风险命令二次确认
│   ├── PasswordInput.tsx       # 密码输入行
│   └── CopyButton.tsx
└── utils/
    ├── riskColors.ts
    └── stepIcons.tsx
```

### 8.3 AI 运维插件组件 (`plugins/builtin/ai-ops/`)

AI 运维插件全部组件已迁移至插件目录，`components/ai-ops/` 已删除：

```
plugins/builtin/ai-ops/
├── index.ts                     # 插件注册入口
├── AIOpsPanel.tsx               # 主面板（useAIAgent + MsgViewer）
├── adapter/
│   └── toMsgBlocks.ts           # AIOpsMessage[] → MsgBlock[] 适配器
├── components/
│   ├── AIOpsHeader.tsx          # AI 面板头部（模式/模型切换）
│   ├── AIOpsInput.tsx           # AI 输入框（文件附件 + 发送）
│   ├── AgentSuggestion.tsx      # Agent 模式建议组件
│   ├── InteractionDialog.tsx    # 交互式确认对话框
│   ├── ConversationList.tsx     # 会话记录列表
│   ├── InsufficientGemsModal.tsx # Gems 不足提示
│   ├── PurchaseDialog.tsx       # Agent 能力包购买引导弹窗
│   └── DeviceActivationDialog.tsx # 新设备激活弹窗
└── hooks/
    └── useAdManager.ts          # 广告调度管理
```

---

## 9. 类型系统

### 核心类型 (`src/types/index.ts`)

| 类型 | 用途 |
|------|------|
| `Host` | 主机配置（SSH 连接参数 + 高级选项 + 代理 + 隧道） |
| `Session` | 终端会话 |
| `User` | 用户信息（gems / tier / token） |
| `ViewState` | 视图路由状态 |
| `AITaskState` | AI 任务状态（status + plan + tokenUsage + choiceData + toolName/toolInput/permissionId） |
| `MessageType` | WebSocket 消息类型枚举 |
| `SystemMetrics` | 系统监控指标（CPU/Mem/Disk/Net + 历史数据） |
| `FileItem` | 文件浏览项 |
| `TransferItem` | 文件传输项 |
| `Proxy` | 代理配置（SOCKS5/HTTP/HTTPS） |
| `Tunnel` | 端口隧道配置 |

### AI 类型 (`src/types/aiOps.ts`)

| 类型 | 用途 |
|------|------|
| `AIOpsMessage` | AI 消息（含 role / content / taskState / files） |
| `AIOpsMode` | 模式：`normal` / `agent` / `code` |
| `AttachedFile` | 文件附件 |
| `AIOpsPanelProps` | AI 面板属性 |

---

## 10. 主题与国际化

### 主题系统

```typescript
type ThemeType = 'dark' | 'regular' | 'dim' | 'urban' | 'light';
type TerminalThemeType = 'classic' | 'solarized' | 'monokai' | 'dracula' | 'matrix';
```

- CSS 变量注入：`App.tsx` 通过 `<style>` 标签动态设置 `:root` 变量
- 终端主题与应用主题独立配置

### 国际化 (`src/locales/` + `src/contexts/I18nContext.tsx`)

```typescript
const { t, language, setLanguage } = useI18n();
// t.common.save → "保存" / "Save"
```

- 支持语言：中文（zh）、英文（en）、西班牙语（es）
- 规则：**禁止硬编码文本**，所有用户可见文本通过 `t.模块.键名` 访问

---

## 11. 数据同步

### Host 同步模式

```typescript
enum SyncMode {
  LOCAL_ONLY   // 未登录：纯本地 localStorage
  DUAL_SYNC    // 已登录：本地 + 服务器双向同步
}
```

- 登录后自动从服务器拉取主机列表
- CRUD 操作同时更新本地和服务器
- 导入/导出 JSON 配置文件

### 认证流程

```
LoginView → api('/auth/login', { email, password }) → JWT Token
  ↓
authService.setUser() → localStorage 持久化
  ↓
apiClient（axios 拦截器自动附加 Authorization header）
  ↓
401 响应 → authService.onAuthFailed() → 自动登出 + 显示登录
```

### API 调用风格

采用 RPC 风格：所有业务接口统一 `POST`，请求参数和响应数据全部通过 JSON Body 传递：

```typescript
// 统一调用方式
const { data } = await api('/host/list', { page: 1, pageSize: 20 });
const { data } = await api('/host/get', { id: 'host_123' });
await api('/host/delete', { id: 'host_123' });

// 统一响应格式：{ code: 0, message: "success", data: {...} }
```

---

## 12. 日志系统

```typescript
import { logger, LOG_MODULE } from '@/utils/logger';

// 方式 1：直接调用
logger.info(LOG_MODULE.SSH, 'ssh.connection.established', 'SSH connected', { ... });

// 方式 2：模块作用域
const log = logger.withFields({ module: LOG_MODULE.SSH });
log.info('ssh.command.executed', 'Command executed', { ... });
```

### 日志模块

```
LOG_MODULE.TERMINAL / SSH / HTTP / AI / FILE / AUTH / UI / MAIN / SFTP / APP
```

### 日志级别

- `DEBUG` — 开发调试（按模块开关）
- `INFO` — 用户可感知事件（连接、操作、导航）
- `WARN` — 警告（同步失败、降级）
- `ERROR` — 错误（含错误码）

---

### 日志存储
 日志文件位置：
  - macOS: ~/Library/Logs/TermCat/ (dev: ~/Library/Logs/TermCat-Dev/)
  - Windows: %APPDATA%/TermCat/logs/
  - Linux: ~/.config/TermCat/logs/

  轮转规则：
  - termcat.log → 当前日志
  - termcat.1.log ~ termcat.4.log → 历史日志
  - 文件达到 10MB 自动轮转，最多保留 5 个文件

## 13. 构建与部署

```bash
npm run dev              # 开发（Vite + Electron HMR）
npm run build            # 构建（vite build + electron-builder）
npm run build:mac        # macOS (dmg + zip)
npm run build:win        # Windows (nsis + portable)
npm run build:linux      # Linux (AppImage + deb + tar.xz)
npm run cli              # 运行 CLI Agent（独立终端客户端）
```

### 构建输出

```
dist/
├── main/       # Main 进程编译输出
├── preload/    # Preload 脚本编译输出
└── renderer/   # Renderer 前端资源

release/        # electron-builder 打包输出
```

---

## 14. 模块依赖关系图

```
                    ┌────────────────────┐
                    │     App.tsx        │
                    │   (全局状态中心)    │
                    └────────┬───────────┘
                             │
          ┌──────────────────┼──────────────────┐
          ▼                  ▼                  ▼
    ┌───────────┐    ┌──────────────┐    ┌───────────┐
    │ Dashboard │    │ TerminalView │    │ Settings  │
    └─────┬─────┘    └──────┬───────┘    └───────────┘
          │                 │
          │         ┌───────┼───────┬──────────┐
          │         ▼       ▼       ▼          ▼
          │    ┌────────┐ ┌─────┐ ┌──────┐ ┌────────┐
          │    │ XTerm  │ │AIOps│ │ File │ │Monitor │
          │    │Terminal│ │Panel│ │Browse│ │Sidebar │
          │    └───┬────┘ └──┬──┘ └──┬───┘ └────────┘
          │        │         │       │
          │   ┌────▼─────────▼───────▼──────┐
          │   │      services/ 层            │
          │   ├─ sshService                  │
          │   ├─ aiWebSocketService          │
          │   ├─ fileBrowserService          │
          │   ├─ systemMonitorService        │
          │   └─ hostService                 │
          │   └──────────────┬───────────────┘
          │                  │
          └──────────────────┤
                             ▼
                    ┌────────────────┐
                    │  modules/      │
                    │  ai-agent/     │
                    ├────────────────┤
                    │ AIAgent        │◄─── 事件驱动状态机
                    │ AIAgentConn    │◄─── WebSocket 连接
                    │ ICommandExec   │◄─── 命令执行接口
                    │ Executors      │◄─── SSH/Mock 实现
                    └────────────────┘
                             │
                    ┌────────▼────────┐
                    │  Main Process   │
                    │  (Electron IPC) │
                    ├─────────────────┤
                    │ ssh-service     │
                    │ file-transfer   │
                    │ tunnel-service  │
                    └─────────────────┘
```

---

## 15. 性能架构规范

### 15.1 Bundle 分包策略

Renderer 进程使用 Vite 构建，通过 `manualChunks` + `React.lazy` 实现代码分割。

**Vendor 分包（vite.config.ts）：**

| Chunk 名 | 包含内容 | 说明 |
|-----------|---------|------|
| `vendor-react` | react, react-dom | React 核心 |
| `vendor-xterm` | xterm + 所有 addon | 终端渲染引擎 |
| `vendor-markdown` | react-markdown | Markdown 渲染 |
| `vendor-i18n` | i18next, react-i18next | 国际化框架 |
| `vendor-lucide` | lucide-react | 图标库 |

**规则：** 新增大型第三方依赖（>30KB）时，应在 `manualChunks` 中为其分配独立 chunk。

### 15.2 懒加载边界

以下模块已配置为懒加载（`React.lazy` / 动态 `import()`），**禁止将其改为静态导入**：

| 模块 | 加载时机 | 方式 |
|------|---------|------|
| `SettingsView` | 用户点击设置 | `React.lazy` |
| `ExtensionsView` | 用户点击扩展 | `React.lazy` |
| `PaymentModalNew` | 用户触发支付 | `React.lazy` |
| `HostConfigModal` | 用户编辑主机配置 | `React.lazy` |
| `UpdateModal` | 检测到新版本 | `React.lazy` |
| 5 个内置插件 | App 初始化（异步） | `import()` in `plugins/builtin/index.ts` |
| AI Agent 模块 | 首次建连 | `import()` in `useSharedAIConnection.ts` |
| CodeMirror 语言包 | 打开文件编辑器 | `import()` in `FileEditorModal.tsx` |
| 非默认语言包 (en/es) | 用户切换语言 | `import()` in `locales/index.ts` |

**规则：**
- 弹窗类组件（Modal/Dialog）必须懒加载
- 非首屏视图组件必须懒加载
- 启动时只加载 Dashboard、Sidebar、Header、LoginView、TerminalView 等核心路径组件

### 15.3 插件事件常量隔离

插件事件常量（`AI_OPS_EVENTS`、`COMMAND_LIBRARY_EVENTS`、`TRANSFER_EVENTS`、`FILE_BROWSER_EVENTS`）统一定义在 `plugins/builtin/events.ts`。

**规则：** 宿主代码（App.tsx、TerminalView.tsx 等）**禁止直接 import 插件模块**（如 `from '../plugins/builtin/ai-ops'`），这会将整个插件代码拉入主包，破坏懒加载。应从 `events.ts` 导入事件常量。

### 15.4 AI Agent 模块延迟加载

`useSharedAIConnection` 使用 `import type` 引用 `AIAgentConnection` 类型，运行时通过 `await import('../modules/ai-agent')` 按需加载。

**规则：** 宿主代码中只允许 `import type` 方式引用 `modules/ai-agent` 下的类型。运行时 import 仅在 `ensureConnected()` 中触发。

### 15.5 启动阶段 API 调用

App 初始化使用 `Promise.allSettled` 并行发起所有 API 请求：

```typescript
const [profileResult, hostsResult, ...] = await Promise.allSettled([
  authService.getUserProfile(),
  hostService.getHosts(),
  commerceService.fetchConfig(),
  apiService.getProxies(),
  fetchAIModels(),
]);
```

**规则：**
- 启动阶段的 API 调用必须并行（`Promise.allSettled`），禁止串行 `await`
- 使用 `allSettled` 而非 `all`，确保单个接口失败不阻塞整体初始化
- 禁止在 `initializeData` 中重复调用相同接口

### 15.6 高频更新优化

| 场景 | 优化方式 |
|------|---------|
| AI 流式回答 | `requestAnimationFrame` 合并 chunk，一帧一次 `setMessages` |
| localStorage 持久化 | 300ms 防抖（debounce），合并多个 key 的写入 |
| 终端输出 | XTermTerminal 内部缓冲 + rAF 刷新 |
| 系统监控数据 | 环形缓冲区（CircularBuffer），固定内存开销 |

**规则：**
- 高频事件回调（>10次/秒）中禁止直接调用 `setState`，必须使用 rAF 或 debounce 合并
- localStorage 写入必须防抖，禁止在每次 state 变更时同步写入
- 事件监听器必须在 `useEffect` 返回函数中清理（包括 `cancelAnimationFrame`）

### 15.7 字体加载

使用本地 `@font-face` 声明（`assets/fonts/Inter-*.woff2`），禁止使用 `@import url(...)` 引入外部字体服务。

**规则：** 禁止在 CSS 中使用外部 `@import url()`（Google Fonts 等），避免网络阻塞启动。

### 15.8 Main 进程文件 I/O

插件管理器（`plugin-manager.ts`）的文件操作全部使用 `fs.promises` 异步 API。

**规则：** Main 进程中禁止使用 `fs.readFileSync`、`fs.writeFileSync`、`fs.readdirSync` 等同步文件操作，使用 `fs.promises.*` 异步版本。

### 15.9 构建产物分析

项目集成了 `rollup-plugin-visualizer`，构建后生成 `dist/bundle-report.html`。

```bash
npm run build   # 构建后打开 dist/bundle-report.html 查看 bundle 组成
```

**规则：** 每次引入新依赖后，应检查 bundle report 确认：
- 新依赖未意外进入主包（应在独立 chunk 或 vendor chunk 中）
- 主包大小未显著增长（当前基线：~413KB，gzip ~132KB）

---

## 编码规范

### 注释语言

- **所有代码注释必须使用英文**，包括行内注释、块注释、JSDoc/TSDoc、TODO/FIXME 等
- 提交信息（commit message）也使用英文
- 文档文件（`.md`）不受此限制，可使用中文

```typescript
// ✅ Good
// Initialize WebSocket connection with retry logic
const ws = new WebSocket(url);

/**
 * Parse SSH config and validate required fields.
 * @param config - Raw SSH connection config
 * @returns Validated config object
 */
function parseSSHConfig(config: RawSSHConfig): SSHConfig { ... }

// TODO: Add connection pooling for better performance

// ❌ Bad
// 初始化 WebSocket 连接
const ws = new WebSocket(url);

// 待优化：增加连接池
```

---

## 开发速查

| 场景 | 关键文件 |
|------|----------|
| 新增页面视图 | `App.tsx` 添加 ViewState + 条件渲染 |
| 新增 AI 消息类型 | `modules/ai-agent/types.ts → AIMessageType` |
| 新增 AI 消息 Block 类型 | `components/msg-viewer/types.ts` + `blocks/` 添加渲染组件 |
| 新增 AI Block 的业务映射 | `plugins/builtin/ai-ops/adapter/toMsgBlocks.ts` |
| 新增 SSH IPC 通道 | `main/ssh-service.ts` + `preload/preload.ts` |
| 新增 API 调用 | `services/` 中使用 `api('/module/action', params)` 封装 |
| 新增翻译键 | `locales/zh.ts` + `locales/en.ts` + 组件中 `t.xxx` |
| 新增终端主题 | `constants.ts → TERMINAL_THEMES` |
| 新增命令执行器 | `modules/ai-agent/executors/` 实现 ICommandExecutor |
| 修改 AI 消息处理 | `modules/ai-agent/AIAgent.ts` |
| 修改 Code 模式工具审批 | `hooks/useAIAgent.ts → approveToolPermission / submitPassword` |
| 修改 Code 模式风险评估 | `agent_server/app/services/code_agent_service.py → _assess_bash_risk` |
| 新增内置插件 | `plugins/builtin/` 下创建目录 + 在 `index.ts` 注册 |
| 修改主机同步逻辑 | `services/hostService.ts` |
| 修改 License 授权逻辑 | `core/license/licenseService.ts` + 服务端 `api/license.go` |
| 修改模式门控 | `AIOpsInput.tsx`（locked 标识）+ `useUserAuth.ts`（注入 locked 状态） |
| 新增付费功能 | `events.ts` 发 `OPEN_PAYMENT` 事件 → `App.tsx` 监听打开 PaymentModalNew |

---

## 参考文档索引

| 文档 | 内容 |
|------|------|
| `CLAUDE.md` | 开发规范 + IPC 通信模式 + 日志规范 + 国际化规范 |
| `.cursorrules` | 详细编码标准 |
| `agent_server/docs/agent模式和code模式的交互流程.md` | Agent/Code 模式交互流程设计（组件复用、状态机、实现清单） |
| `docs/` | 27+ 设计文档 |

---

**项目**: TermCat Client
**版本**: 1.0
**最后更新**: 2026-03-11
