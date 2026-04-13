# TermCat 适配 Claude Code 功能规划

> 背景：AI 工具发展迅速，终端 + AI 对话模式（如 Claude Code）日益流行。TermCat 作为 AI 驱动的远程终端管理工具，应探索与 Claude Code 互补的功能设计，提升竞争力。

---

## 1. 产品定位对比

### 核心差异

| 维度 | TermCat | Claude Code |
|------|---------|-------------|
| **本质** | GUI 桌面应用，多服务器运维管理 | CLI 工具，单项目开发助手 |
| **目标用户** | 运维人员、管理多台服务器 | 开发者、单项目编码 |
| **服务器管理** | 多主机、分组、批量连接 | 无（只操作当前目录） |
| **AI 交互** | 通过 WebSocket 对话面板 | 直接在终端内对话 |
| **文件管理** | SFTP 可视化浏览器 | 通过工具调用（Read/Write/Edit） |
| **监控** | 实时系统指标仪表盘 | 无 |
| **终端** | xterm.js 渲染，分屏 | 用户自己的终端 |

### Claude Code 的"盲区"（TermCat 的机会）

1. **不管理多台服务器** — 用户需自己 SSH 到每台机器再启动 Claude Code
2. **无可视化** — 全靠文字，看监控数据、浏览文件不直观
3. **无持久化会话管理** — 退出即丢失上下文
4. **无跨机器协调** — 无法同时操作多台服务器完成一个任务

### TermCat 现有优势

1. **多服务器管理能力** — Claude Code 没有
2. **可视化层** — Claude Code 是纯 CLI
3. **持久化上下文** — Claude Code 是会话式的
4. **环境感知** — 已有监控、文件浏览等数据
5. **已有 Code 模式集成** — 通过 MCP proxy 与 Claude SDK 对接

---

## 2. 核心策略

**不是"替代 Claude Code"，而是成为 Claude Code 在多服务器运维场景下的最佳伴侣。**

---

## 3. 功能设计

### 3.1 一键 Claude Code 远程启动器 [P0]

**痛点**：用户要在远程服务器上用 Claude Code，需要先 SSH 登录、确认安装、配置 API Key、再启动，每台机器都要重复。

**方案**：
- TermCat 主机连接后，提供一键启动远程 Claude Code 的能力
- 检测远程是否安装了 Claude Code CLI
- 一键安装/更新 Claude Code
- 管理 API Key（安全注入环境变量，无需每台机器单独配置）
- 启动后，TermCat 的 xterm.js 终端直接承载 Claude Code 的交互界面

**竞争力**：把 "SSH + 安装 + 配置 + 启动" 变成一键操作。

**技术要点**：
- SSH 执行 `which claude` 检测安装状态
- 通过 SSH 执行安装脚本（`npm install -g @anthropic-ai/claude-code` 或官方安装命令）
- API Key 通过环境变量注入（`ANTHROPIC_API_KEY`），不落盘到远程服务器
- xterm.js 已支持完整终端交互，Claude Code 的 TUI 界面可直接渲染

---

### 3.2 远程工作区上下文桥接（Context Bridge）[P0]

**痛点**：Claude Code 对远程服务器的环境缺少上下文。用户通过 TermCat 已知服务器 CPU 高、磁盘满、某个服务挂了，但启动 Claude Code 后还得重新描述。

**方案**：
- TermCat 自动收集当前主机的上下文信息：
  - 系统指标（CPU、内存、磁盘、网络）
  - 最近告警和异常事件
  - 运行中的服务列表
  - 已知问题记录
- 启动 Claude Code 时，自动注入为 `CLAUDE.md` 或通过 `--prompt` 参数传入
- 用户场景示例：看到某台主机 CPU 100%，点击"AI 诊断"，TermCat 自动将监控数据 + 告警信息作为上下文喂给 Claude Code

**竞争力**：消除 GUI 监控和 AI 终端之间的信息断层。

**技术要点**：
- 利用现有 `systemMonitorService` 获取实时指标
- 生成结构化的上下文描述（Markdown 格式）
- 通过 SSH 在远程创建临时 CLAUDE.md 或使用 `--print` / `--prompt` 参数注入
- 可考虑 MCP Server 方式：TermCat 作为 MCP Server 为 Claude Code 提供实时监控数据

---

### 3.3 多服务器 AI 任务编排（Claude Code Orchestrator）[P1]

**痛点**：Claude Code 一次只能在一台机器上工作。但运维经常需要"在 10 台机器上都做同样的事"。

**方案**：
- 用户在 TermCat 写一个自然语言任务描述（如"升级所有服务器的 nginx 到 1.25"）
- 选择目标主机组
- 在每台主机上通过 SSH 启动 Claude Code（或利用已有的 Code 模式 MCP proxy），并行执行
- TermCat 的 GUI 汇总展示每台机器的执行进度和结果
- 支持操作：暂停、回滚、跳过某台主机

**竞争力**：这是 Claude Code 本身做不到的，是 TermCat 多服务器管理能力和 AI 的结合。

**技术要点**：
- 基于现有 `AIAgent` + `ICommandExecutor` 架构扩展
- 新增 `OrchestratorAgent` 管理多台主机上的并行任务
- 任务状态聚合视图（成功/失败/进行中/跳过）
- 错误处理策略：单机失败是否继续其他机器（可配置）
- 结果对比视图：同一命令在不同机器上的执行结果差异

**UI 设计方向**：
```
┌──────────────────────────────────────────────────┐
│  任务: 升级所有服务器的 nginx 到 1.25             │
│  目标: Web 服务器组 (5 台)                        │
├──────────────────────────────────────────────────┤
│  ● server-01  ✅ 完成  nginx 1.24 → 1.25         │
│  ● server-02  ✅ 完成  nginx 1.24 → 1.25         │
│  ● server-03  🔄 执行中  正在安装...              │
│  ● server-04  ⏳ 等待中                           │
│  ● server-05  ❌ 失败  磁盘空间不足               │
├──────────────────────────────────────────────────┤
│  [暂停全部]  [跳过失败]  [重试失败]  [取消]        │
└──────────────────────────────────────────────────┘
```

---

### 3.4 MCP Server 集中管理 [P1]

**痛点**：Claude Code 的 MCP 配置是单机的，管理多台机器的 MCP 很麻烦。

**方案**：
- TermCat 作为 MCP Server 注册中心
- 可视化管理每台主机上的 MCP 配置
- 支持一键分发 MCP 配置到多台主机
- TermCat 自身也可暴露 MCP 接口，供本地 Claude Code 调用：
  - `remote_terminal` — 远程终端执行
  - `remote_file_browser` — 远程文件浏览
  - `remote_monitor` — 远程系统监控数据
  - `host_manager` — 主机列表查询

**竞争力**：TermCat 变成 Claude Code 的"基础设施层"。

**技术要点**：
- 实现 MCP Server 协议（stdio 或 SSE 传输）
- 复用现有的 `sshService`、`fileBrowserService`、`systemMonitorService`
- MCP 配置文件管理：读取/写入远程 `~/.claude/` 目录下的配置
- 配置模板：预定义常用 MCP Server 配置供用户选择

---

### 3.5 Claude Code 会话可视化增强 [P2]

**痛点**：Claude Code 在终端里的输出是纯文本流，看 diff、文件树、代码块不够直观。

**方案**：利用 TermCat 已有的 `msg-viewer` 组件体系：
- 拦截/解析 Claude Code 的终端输出流（ANSI 解析）
- 在侧边面板中增强渲染：
  - 文件变更用可视化 diff viewer 展示
  - 工具调用用已有的 `ToolUseCard`、`StepDetailCard` 展示
  - 命令执行结果用高亮代码块展示
- 本质上是给 Claude Code 加了一个"可视化副屏"

**竞争力**：把 CLI-only 的体验升级为 CLI + GUI 混合体验。

**技术要点**：
- Claude Code 输出解析器（识别工具调用、diff、代码块等结构化内容）
- 映射到现有 `MsgBlock` 类型体系
- 侧边面板实时同步更新
- 挑战：Claude Code 的输出格式可能随版本变化，需要维护解析器

---

### 3.6 AI 运维知识库（跨会话记忆）[P2]

**痛点**：Claude Code 的会话是短暂的，每次启动都是全新上下文。但运维知识（部署方式、常见故障、特殊配置）是长期积累的。

**方案**：
- TermCat 为每台主机维护一个运维知识库（自动 + 手动）
- 每次 AI 任务执行后，自动提取关键信息存入知识库：
  - 执行过的操作和结果
  - 发现的问题和解决方案
  - 服务器特殊配置说明
- 启动 Claude Code 时，自动将相关知识注入上下文
- 支持跨用户共享知识（团队协作场景）

**竞争力**：让 AI 对每台服务器"有记忆"，运维经验可积累、可传承。

**数据模型方向**：
```
HostKnowledge {
  host_id: string
  entries: KnowledgeEntry[]
}

KnowledgeEntry {
  category: 'config' | 'issue' | 'procedure' | 'note'
  title: string
  content: string        // Markdown
  tags: string[]
  created_at: Date
  created_by: string     // 用户 or 'auto'
  source_session?: string // 来源 AI 会话 ID
}
```

---

## 4. 优先级总结

| 优先级 | 功能 | 复杂度 | 理由 |
|--------|------|--------|------|
| **P0** | 一键远程启动器 | 低 | 实现简单，直接解决痛点，利用现有 SSH 能力 |
| **P0** | 上下文桥接 | 低-中 | 利用现有监控数据，差异化明显 |
| **P1** | 多服务器任务编排 | 高 | 杀手级功能，但复杂度高 |
| **P1** | MCP Server 管理 | 中 | TermCat 成为 Claude Code 的基础设施 |
| **P2** | 会话可视化增强 | 中 | 锦上添花，需要解析 Claude Code 输出格式 |
| **P2** | 运维知识库 | 中-高 | 长期价值，需要设计数据模型和存储方案 |

---

## 5. 实施路线建议

### Phase 1 — 快速验证（1-2 周）
- 实现一键远程启动器（检测 + 安装 + API Key 注入 + 启动）
- 实现基础上下文桥接（监控数据 → CLAUDE.md 注入）

### Phase 2 — 核心能力（3-4 周）
- 实现 TermCat MCP Server（remote_terminal + remote_file_browser）
- 多服务器任务编排的基础框架

### Phase 3 — 体验增强（持续迭代）
- Claude Code 输出可视化增强
- 运维知识库
- 任务编排高级功能（回滚、对比、审批流程）

---

## 6. 竞争力总结

TermCat 的核心叙事：

> **"Claude Code 是你的 AI 编码助手，TermCat 是让它管理整个服务器集群的控制台。"**

差异化壁垒：
1. 多服务器管理 — Claude Code 天然不具备
2. 可视化监控 — CLI 工具的天然短板
3. 上下文持久化 — 运维知识跨会话积累
4. 一站式体验 — SSH + AI + 文件 + 监控统一入口

---

*文档创建: 2026-04-13*
*状态: 初稿，待补充完善*
