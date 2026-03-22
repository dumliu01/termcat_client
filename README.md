<p align="center">
  <img src="assets/termcat_icon.png" alt="TermCat" width="120" />
</p>

<h1 align="center">TermCat</h1>

<p align="center">
  <b>AI-Powered Intelligent Remote Terminal Management</b><br/>
  SSH Terminal &bull; File Manager &bull; System Monitor &bull; AI Ops &mdash; All in One Desktop App
</p>

<p align="center">
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-AGPL--3.0-blue.svg" alt="License" /></a>
  <img src="https://img.shields.io/badge/platform-macOS%20%7C%20Windows%20%7C%20Linux-lightgrey.svg" alt="Platform" />
  <img src="https://img.shields.io/badge/electron-28-47848F.svg" alt="Electron" />
  <img src="https://img.shields.io/badge/react-18-61DAFB.svg" alt="React" />
  <img src="https://img.shields.io/badge/typescript-5-3178C6.svg" alt="TypeScript" />
</p>

<p align="center">
  <a href="https://termcat.uniline.site">Homepage</a> &bull;
  <a href="README_cn.md">中文文档</a>
</p>

---

## Screenshots

<p align="center">
  <img src="assets/images/termcat_screen.png" alt="TermCat Dashboard" width="100%" />
</p>

<p align="center">
  <img src="assets/images/termcat_screen_02.png" alt="TermCat Terminal" width="100%" />
</p>

## Features

### Terminal Management
- **Multi-tab SSH Terminal** — Connect to multiple servers simultaneously with tab switching (no re-mounting)
- **Local Terminal** — Built-in local PTY terminal support
- **SFTP File Browser** — Browse, upload, download, edit remote files with a visual file tree
- **Port Tunneling** — Create SSH port forwarding tunnels
- **Proxy Support** — SOCKS5 / HTTP / HTTPS proxy for SSH connections

### AI Operations (3 Modes)
- **Normal Mode** — AI-powered Q&A, command suggestions, and one-click execution
- **Advanced (Agent) Mode** — Automated multi-step task planning and execution with error recovery
- **Code Mode** — Claude Code SDK integration with tool permission control, risk assessment, and interactive feedback loop

### System & UX
- **Real-time System Monitoring** — CPU, memory, disk, network metrics with history charts
- **Plugin System** — Built-in plugins (AI Ops, File Browser, Command Library, Transfer Manager, Monitoring) with extensible architecture
- **Themes** — 5 app themes (dark / regular / dim / urban / light) + 5 terminal themes
- **i18n** — Chinese, English, Spanish
- **Host Management** — Local storage + cloud sync (dual-sync mode when logged in)
- **Code Editor** — CodeMirror 6 with multi-language syntax highlighting

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Desktop Framework | Electron 28 (Main + Renderer + Preload) |
| UI Framework | React 18 + TypeScript 5 |
| Build Tool | Vite 5 + vite-plugin-electron |
| Styling | Tailwind CSS 3 |
| Terminal | xterm.js (FitAddon / Unicode11Addon / WebLinksAddon) |
| SSH | ssh2 (Node.js, Main process) |
| AI Communication | WebSocket (connects to Agent Server) |
| Code Editor | CodeMirror 6 |
| Icons | lucide-react |

## Architecture

TermCat Client follows Electron's three-process model:

```
┌──────────────────────────────────────────┐
│         Main Process (Node.js)           │
│  ├── Window management                   │
│  ├── SSH connection service              │
│  ├── SFTP file transfer                  │
│  ├── Port tunnel service                 │
│  └── Local PTY manager                   │
└──────────────┬───────────────────────────┘
               │ IPC (contextBridge)
┌──────────────▼───────────────────────────┐
│          Preload Script                  │
│  └── Secure IPC bridge                   │
└──────────────┬───────────────────────────┘
               │
┌──────────────▼───────────────────────────┐
│       Renderer Process (React)           │
│  ├── UI Components (Dashboard/Terminal)  │
│  ├── Plugin System (builtin plugins)     │
│  ├── AI Agent SDK (event-driven)         │
│  ├── Service Layer (API/Auth/SSH/Host)   │
│  └── Shared Components (MsgViewer)       │
└──────────────────────────────────────────┘
```

The AI Agent SDK (`src/core/ai-agent/`) is a standalone, UI-independent module that can be reused across Electron and CLI environments.

For detailed architecture documentation, see [`claude_refs/ARCHITECTURE.md`](claude_refs/ARCHITECTURE.md).

## Prerequisites

- **Node.js** >= 18
- **npm** >= 9
- **Python** >= 3.10 (for `node-pty` native module build)
- Platform build tools:
  - macOS: Xcode Command Line Tools
  - Windows: Visual Studio Build Tools (C++ workload)
  - Linux: `build-essential`, `python3`

### Backend Services (Required)

TermCat Client requires the following companion services:

| Service | Default Port | Description |
|---------|-------------|-------------|
| `termcat_server` | 8080 | Go backend — API gateway, auth, host sync, WebSocket relay |
| `termcat_agent_server` | 5001 | Python AI agent — task planning, command generation, Code mode |

## Getting Started

### 1. Clone the repository

```bash
git clone https://github.com/user/termcat.git
cd termcat/termcat_client
```

### 2. Install dependencies

```bash
npm install
```

### 3. Configure environment

```bash
cp .env.example .env.local
```

Edit `.env.local`:

```env
VITE_API_BASE_URL=http://localhost:8080/api
VITE_WS_BASE_URL=ws://localhost:8080/ws
VITE_AI_WS_BASE_URL=ws://localhost:5001
```

### 4. Start development server

```bash
npm run dev
```

### 5. Build for production

```bash
# macOS (x64)
npm run build:mac

# macOS (Apple Silicon)
npm run build:mac-arm64

# Windows
npm run build:win

# Linux
npm run build:linux
```

Build output is in the `release/` directory.

## CLI Agent

TermCat includes a standalone CLI agent for terminal-based AI operations:

```bash
# Interactive mode
npm run cli

# With parameters
npx tsx src/core/ai-agent/cli/cli-agent.ts \
  --server http://localhost:8080 \
  --agent-server ws://localhost:5001 \
  --email user@example.com \
  --mode agent

# Auto-execute mode (skip confirmations)
npx tsx src/core/ai-agent/cli/cli-agent.ts --auto
```

CLI commands: `/mode`, `/model`, `/auto`, `/stop`, `/status`, `/help`, `/quit`

## Project Structure

```
termcat_client/
├── src/
│   ├── base/              # Base infrastructure (i18n, logger, http)
│   ├── core/              # Core services & business logic
│   │   ├── ai-agent/      # AI Agent SDK (standalone module)
│   │   ├── ssh/           # SSH connection management
│   │   ├── terminal/      # Terminal abstraction layer
│   │   ├── transfer/      # File transfer handler
│   │   ├── tunnel/        # Port tunneling
│   │   ├── monitor/       # System monitoring
│   │   ├── auth/          # Authentication
│   │   ├── host/          # Host management
│   │   └── plugin/        # Plugin service
│   ├── features/          # Feature modules (UI + hooks)
│   │   ├── dashboard/     # Host management dashboard
│   │   ├── terminal/      # Terminal view & components
│   │   ├── settings/      # Settings pages
│   │   └── shared/        # Shared UI components
│   ├── plugins/           # Plugin system
│   │   ├── builtin/       # Built-in plugins
│   │   │   ├── ai-ops/           # AI Operations panel
│   │   │   ├── file-browser/     # SFTP file browser
│   │   │   ├── command-library/  # Command library
│   │   │   ├── transfer-manager/ # Transfer manager
│   │   │   └── monitoring-sidebar/ # System monitor
│   │   └── ui-contribution/      # UI contribution point system
│   ├── shared-components/ # Reusable UI components
│   │   └── msg-viewer/    # Rich message display (virtualized)
│   ├── main/              # Electron main process
│   ├── preload/           # Preload scripts
│   └── renderer/          # Renderer entry point
├── assets/                # Static assets & icons
└── package.json
```

## Contributing

Contributions are welcome! Please follow these guidelines:

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Follow the existing code style (TypeScript strict mode, functional React components)
4. Ensure all user-visible text uses i18n keys (no hardcoded strings)
5. Use the secure IPC pattern for cross-process communication
6. Commit your changes (`git commit -m 'Add amazing feature'`)
7. Push to the branch (`git push origin feature/amazing-feature`)
8. Open a Pull Request

### Code Guidelines

- TypeScript with strict type annotations (avoid `any`)
- Functional components with hooks
- Modals and non-critical views must be lazy-loaded (`React.lazy`)
- High-frequency event handlers (>10/s) must use `requestAnimationFrame` or debounce
- All async operations require error handling
- Logging via centralized `logger` (never `console.log`)

## License

This project is licensed under the **GNU Affero General Public License v3.0 (AGPL-3.0)**.

See [LICENSE](LICENSE) for details, or read the full license at [gnu.org/licenses/agpl-3.0](https://www.gnu.org/licenses/agpl-3.0.html).

Any derivative work or network service built upon this software must also be released under AGPL-3.0, including making the complete source code available to users who interact with it over a network.
