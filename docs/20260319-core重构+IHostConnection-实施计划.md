# Core 重构 + IHostConnection 实施计划

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将底层通信组件迁移到 `src/core/` 并重命名，然后引入 `IHostConnection` 统一 host 连接入口。

**Architecture:** 分两阶段：(1) Core 重构 — 移动 4 个 Main 进程底层模块到 `src/core/`，重命名去掉 "service" 后缀；(2) IHostConnection — 在 `src/services/terminal-backends/` 新增 `IHostConnection` 接口 + SSH/Local 两个实现 + 工厂，TerminalView 改为持有 `IHostConnection`。

**Tech Stack:** TypeScript, Electron IPC, React

**Spec:** `docs/20260319-桌面本地终端AI等能力扩展实现方案.md` + `docs/20260319-桌面本地终端AI等能力扩展实现方案-代码实现.md`

---

## 文件结构

### 阶段一：Core 重构（移动 + 重命名）

| 原路径 | 新路径 | 说明 |
|--------|--------|------|
| `src/main/ssh-service.ts` | `src/core/ssh/ssh-manager.ts` | SSH 连接管理 |
| `src/main/ssh-config-parser.ts` | `src/core/ssh/ssh-config-parser.ts` | SSH 配置解析 |
| `src/main/local-pty-service.ts` | `src/core/pty/local-pty-manager.ts` | PTY 进程管理 |
| `src/main/file-transfer-service.ts` | `src/core/transfer/file-transfer-handler.ts` | SFTP 传输 |
| `src/main/tunnel-service.ts` | `src/core/tunnel/tunnel-manager.ts` | 端口隧道 |

受影响的 import 更新：

| 文件 | 旧 import | 新 import |
|------|-----------|-----------|
| `src/main/main.ts:5` | `from './ssh-service'` | `from '../core/ssh/ssh-manager'` |
| `src/main/main.ts:6` | `from './file-transfer-service'` | `from '../core/transfer/file-transfer-handler'` |
| `src/main/main.ts:7` | `from './tunnel-service'` | `from '../core/tunnel/tunnel-manager'` |
| `src/main/main.ts:12` | `from './local-pty-service'` | `from '../core/pty/local-pty-manager'` |
| `src/core/transfer/file-transfer-handler.ts:4` | `from './ssh-service'` | `from '../ssh/ssh-manager'` |
| `src/core/ssh/ssh-manager.ts:7` | `from './ssh-config-parser'` | `from './ssh-config-parser'`（同目录，不变） |

### 阶段二：IHostConnection

| 操作 | 文件路径 |
|------|----------|
| Create | `src/services/terminal-backends/IHostConnection.ts` |
| Create | `src/services/terminal-backends/SSHHostConnection.ts` |
| Create | `src/services/terminal-backends/LocalHostConnection.ts` |
| Create | `src/services/terminal-backends/HostConnectionFactory.ts` |
| Modify | `src/services/terminal-backends/index.ts` |
| Modify | `src/plugins/builtin/types.ts` — ConnectionInfo 新增 connectionType |
| Modify | `src/components/TerminalView.tsx` — 使用 IHostConnection |

---

## Task 1: 创建 src/core/ 目录结构并移动文件

**Files:**
- Move: `src/main/ssh-service.ts` → `src/core/ssh/ssh-manager.ts`
- Move: `src/main/ssh-config-parser.ts` → `src/core/ssh/ssh-config-parser.ts`
- Move: `src/main/local-pty-service.ts` → `src/core/pty/local-pty-manager.ts`
- Move: `src/main/file-transfer-service.ts` → `src/core/transfer/file-transfer-handler.ts`
- Move: `src/main/tunnel-service.ts` → `src/core/tunnel/tunnel-manager.ts`

- [ ] **Step 1: 创建目录结构**

```bash
mkdir -p src/core/ssh src/core/pty src/core/transfer src/core/tunnel
```

- [ ] **Step 2: 移动文件**

```bash
git mv src/main/ssh-service.ts src/core/ssh/ssh-manager.ts
git mv src/main/ssh-config-parser.ts src/core/ssh/ssh-config-parser.ts
git mv src/main/local-pty-service.ts src/core/pty/local-pty-manager.ts
git mv src/main/file-transfer-service.ts src/core/transfer/file-transfer-handler.ts
git mv src/main/tunnel-service.ts src/core/tunnel/tunnel-manager.ts
```

- [ ] **Step 3: 更新 ssh-manager.ts 内部 import**

在 `src/core/ssh/ssh-manager.ts` 中，`ssh-config-parser` 的 import 路径不需要改（同目录）。但需要更新 logger 的 import：

原: `import { logger, LOG_MODULE } from '../utils/logger'`
新: `import { logger, LOG_MODULE } from '../../utils/logger'`

检查文件中所有 `../` 开头的 import，根据新目录深度调整。

- [ ] **Step 4: 更新 file-transfer-handler.ts 内部 import**

原: `import { sshService } from './ssh-service'`
新: `import { sshService } from '../ssh/ssh-manager'`

同样更新 logger 等 `../` import 的路径。

- [ ] **Step 5: 更新 local-pty-manager.ts 内部 import**

更新 logger import：
原: `import { logger, LOG_MODULE } from '../utils/logger'`
新: `import { logger, LOG_MODULE } from '../../utils/logger'`

- [ ] **Step 6: 更新 tunnel-manager.ts 内部 import**

更新 logger 等 import 路径。

- [ ] **Step 7: 更新 ssh-config-parser.ts 内部 import**

如果有 `../` 路径的 import，根据新位置调整。

- [ ] **Step 8: 更新 main.ts 的 import**

```typescript
// 旧:
import { sshService } from './ssh-service';
import { fileTransferService } from './file-transfer-service';
import { tunnelService, TunnelConfig } from './tunnel-service';
import { localPtyService } from './local-pty-service';

// 新:
import { sshService } from '../core/ssh/ssh-manager';
import { fileTransferService } from '../core/transfer/file-transfer-handler';
import { tunnelService, TunnelConfig } from '../core/tunnel/tunnel-manager';
import { localPtyService } from '../core/pty/local-pty-manager';
```

- [ ] **Step 9: 更新 chat-history-service.ts 的 import（如果有）**

检查 `src/main/chat-history-service.ts` 是否 import 了被移动的模块，如有则更新。

- [ ] **Step 10: 验证编译**

```bash
npx tsc --noEmit --pretty 2>&1 | head -50
```

- [ ] **Step 11: Commit**

```bash
git add -A
git commit -m "refactor: 迁移底层通信组件到 src/core/，重命名去掉 service 后缀"
```

---

## Task 2: 更新 vite.config.ts 确保 core/ 目录参与 Main 进程编译

**Files:**
- Modify: `vite.config.ts`

- [ ] **Step 1: 检查 vite-plugin-electron 是否自动跟踪 import**

vite-plugin-electron 的 `entry: 'src/main/main.ts'` 会自动跟踪所有 import 并打包。由于 `main.ts` 已经 import 了 `../core/` 下的模块，Vite 会自动包含它们。

验证构建：
```bash
npm run build 2>&1 | tail -20
```

如果有问题，检查 rollupOptions.external 是否需要调整。

- [ ] **Step 2: Commit（如有改动）**

---

## Task 3: ConnectionInfo 扩展

**Files:**
- Modify: `src/plugins/builtin/types.ts`

- [ ] **Step 1: 在 ConnectionInfo 中新增 connectionType**

找到 `ConnectionInfo` 接口定义，新增 `connectionType` 字段：

```typescript
export interface ConnectionInfo {
  connectionId: string;
  connectionType: 'ssh' | 'local';  // 新增
  hostname: string;
  isVisible: boolean;
  isActive: boolean;
  language: string;
}
```

- [ ] **Step 2: 更新 TerminalView 中 setConnectionInfo 调用**

在 `src/components/TerminalView.tsx` 中，找到 `builtinPluginManager.setConnectionInfo()` 调用，添加 connectionType：

```typescript
builtinPluginManager.setConnectionInfo(
  (connectionId && !isLocal) ? {
    connectionId,
    connectionType: host.connectionType === 'local' ? 'local' : 'ssh',
    hostname: host.hostname,
    isVisible: showSidebar,
    isActive,
    language,
  } : null
);
```

注意：当前代码有 `!isLocal` 条件，本地终端不推送 ConnectionInfo。此处先保持这个行为不变（第二期子系统实现后再开放）。

- [ ] **Step 3: 验证编译**

```bash
npx tsc --noEmit --pretty 2>&1 | head -30
```

- [ ] **Step 4: Commit**

```bash
git add src/plugins/builtin/types.ts src/components/TerminalView.tsx
git commit -m "feat: ConnectionInfo 新增 connectionType 字段"
```

---

## Task 4: IHostConnection 接口

**Files:**
- Create: `src/services/terminal-backends/IHostConnection.ts`

- [ ] **Step 1: 创建接口文件**

```typescript
/**
 * Host 连接统一入口
 *
 * 能力层的组合接口，聚合终端 I/O、命令执行等基础能力。
 * SSH 和本地各自实现，上层（TerminalView、插件）仅持有此接口。
 */

import type { ITerminalBackend } from './ITerminalBackend';

/**
 * 连接类型
 */
export type HostConnectionType = 'ssh' | 'local';

/**
 * Host 连接接口
 */
export interface IHostConnection {
  /** 连接类型 */
  readonly type: HostConnectionType;

  /** 连接标识 */
  readonly id: string;

  /** 终端 I/O（xterm.js 数据流） */
  readonly terminal: ITerminalBackend;

  /** 释放所有资源 */
  dispose(): void;
}
```

注意：此处先不加 `executor` 和 `transfer` — 遵循 YAGNI 原则，这些在第二期实现 AI Agent / FileBrowser 子系统时再加。当前只聚合 `terminal`。

- [ ] **Step 2: 验证编译**

```bash
npx tsc --noEmit --pretty 2>&1 | head -20
```

- [ ] **Step 3: Commit**

```bash
git add src/services/terminal-backends/IHostConnection.ts
git commit -m "feat: 新增 IHostConnection 接口"
```

---

## Task 5: SSHHostConnection 实现

**Files:**
- Create: `src/services/terminal-backends/SSHHostConnection.ts`

- [ ] **Step 1: 创建 SSHHostConnection**

```typescript
/**
 * SSH Host 连接
 *
 * 组合 SSHTerminalBackend，管理 SSH 连接生命周期。
 * connect/disconnect 委托给 Renderer 侧 sshService。
 */

import type { IHostConnection, HostConnectionType } from './IHostConnection';
import { SSHTerminalBackend } from './SSHTerminalBackend';
import { Host } from '@/types';
import { sshService } from '@/services/sshService';
import { logger, LOG_MODULE } from '@/utils/logger';

const log = logger.withFields({ module: LOG_MODULE.TERMINAL });

export class SSHHostConnection implements IHostConnection {
  readonly type: HostConnectionType = 'ssh';

  private _id: string = '';
  private _terminal: SSHTerminalBackend | null = null;
  private _isConnected = false;

  constructor(private host: Host) {}

  get id(): string { return this._id; }

  get terminal(): SSHTerminalBackend {
    if (!this._terminal) throw new Error('SSHHostConnection not connected');
    return this._terminal;
  }

  /**
   * 建立 SSH 连接 + 创建终端后端
   */
  async connect(): Promise<void> {
    log.info('ssh-host.connecting', 'SSHHostConnection connecting', {
      host_id: this.host.id, hostname: this.host.hostname,
    });

    const session = await sshService.connect(this.host);

    if (!session.connectionId) {
      throw new Error('SSH connection failed: no connectionId');
    }

    this._id = session.connectionId;
    this._terminal = new SSHTerminalBackend(
      session.connectionId,
      this.host.terminal?.encoding,
    );
    this._isConnected = true;

    log.info('ssh-host.connected', 'SSHHostConnection connected', {
      connection_id: this._id,
    });
  }

  /**
   * 断开 SSH 连接
   */
  async disconnect(): Promise<void> {
    if (this._id) {
      sshService.disconnectSession(this._id);
    }
    this._isConnected = false;
    log.info('ssh-host.disconnected', 'SSHHostConnection disconnected', {
      connection_id: this._id,
    });
  }

  dispose(): void {
    this._terminal?.dispose();
    if (this._isConnected) {
      this.disconnect();
    }
    this._terminal = null;
  }
}
```

- [ ] **Step 2: 验证编译**

```bash
npx tsc --noEmit --pretty 2>&1 | head -20
```

- [ ] **Step 3: Commit**

```bash
git add src/services/terminal-backends/SSHHostConnection.ts
git commit -m "feat: 实现 SSHHostConnection"
```

---

## Task 6: LocalHostConnection 实现

**Files:**
- Create: `src/services/terminal-backends/LocalHostConnection.ts`

- [ ] **Step 1: 创建 LocalHostConnection**

```typescript
/**
 * 本地 Host 连接
 *
 * 组合 LocalTerminalBackend。
 * 无需建立网络连接，PTY 在 terminal.connect() 时创建。
 */

import type { IHostConnection, HostConnectionType } from './IHostConnection';
import { LocalTerminalBackend } from './LocalTerminalBackend';
import { Host } from '@/types';
import { logger, LOG_MODULE } from '@/utils/logger';

const log = logger.withFields({ module: LOG_MODULE.TERMINAL });

export class LocalHostConnection implements IHostConnection {
  readonly type: HostConnectionType = 'local';

  private _id: string;
  private _terminal: LocalTerminalBackend;

  constructor(private host: Host) {
    this._id = `local-${Date.now()}`;
    this._terminal = new LocalTerminalBackend({
      shell: host.localConfig?.shell,
      cwd: host.localConfig?.cwd,
      env: host.localConfig?.env,
    });
  }

  get id(): string { return this._id; }
  get terminal(): LocalTerminalBackend { return this._terminal; }

  dispose(): void {
    log.info('local-host.disposing', 'LocalHostConnection disposing', {
      id: this._id,
    });
    this._terminal.dispose();
  }
}
```

- [ ] **Step 2: 验证编译**

```bash
npx tsc --noEmit --pretty 2>&1 | head -20
```

- [ ] **Step 3: Commit**

```bash
git add src/services/terminal-backends/LocalHostConnection.ts
git commit -m "feat: 实现 LocalHostConnection"
```

---

## Task 7: HostConnectionFactory + 导出更新

**Files:**
- Create: `src/services/terminal-backends/HostConnectionFactory.ts`
- Modify: `src/services/terminal-backends/index.ts`

- [ ] **Step 1: 创建 HostConnectionFactory**

```typescript
/**
 * Host 连接工厂
 *
 * 根据 Host 的 connectionType 创建对应的 IHostConnection 实现。
 */

import type { IHostConnection } from './IHostConnection';
import { SSHHostConnection } from './SSHHostConnection';
import { LocalHostConnection } from './LocalHostConnection';
import { Host } from '@/types';

export class HostConnectionFactory {
  static create(host: Host): IHostConnection {
    if (host.connectionType === 'local') {
      return new LocalHostConnection(host);
    }
    return new SSHHostConnection(host);
  }
}
```

- [ ] **Step 2: 更新 index.ts 导出**

```typescript
export type { ITerminalBackend } from './ITerminalBackend';
export { SSHTerminalBackend } from './SSHTerminalBackend';
export { LocalTerminalBackend } from './LocalTerminalBackend';
export { TerminalBackendFactory } from './TerminalBackendFactory';
export type { IHostConnection, HostConnectionType } from './IHostConnection';
export { SSHHostConnection } from './SSHHostConnection';
export { LocalHostConnection } from './LocalHostConnection';
export { HostConnectionFactory } from './HostConnectionFactory';
```

- [ ] **Step 3: 验证编译**

```bash
npx tsc --noEmit --pretty 2>&1 | head -20
```

- [ ] **Step 4: Commit**

```bash
git add src/services/terminal-backends/
git commit -m "feat: 新增 HostConnectionFactory，完善 terminal-backends 模块导出"
```

---

## Task 8: TerminalView 重构 — 使用 IHostConnection

这是最大的改动。当前 TerminalView 直接调用 `sshService.connect()`、`TerminalBackendFactory.create()`、`sshService.disconnectSession()`。重构后统一通过 `IHostConnection` 管理。

**Files:**
- Modify: `src/components/TerminalView.tsx`

- [ ] **Step 1: 替换 import**

```typescript
// 移除:
import { sshService } from '../services/sshService';
import { TerminalBackendFactory } from '../services/terminal-backends';
import type { ITerminalBackend } from '../services/terminal-backends/ITerminalBackend';

// 新增:
import { HostConnectionFactory } from '../services/terminal-backends';
import type { IHostConnection } from '../services/terminal-backends/IHostConnection';
```

- [ ] **Step 2: 替换 backendRef 为 connectionRef**

```typescript
// 旧:
const backendRef = useRef<ITerminalBackend | null>(null);

// 新:
const connectionRef = useRef<IHostConnection | null>(null);
```

- [ ] **Step 3: 重构连接 useEffect**

将当前分支（本地 vs SSH）统一为 `HostConnectionFactory.create()` + `connection.connect()`：

```typescript
useEffect(() => {
  let isCleanedUp = false;

  const connectHost = async () => {
    try {
      setIsConnecting(true);
      setConnectionError(null);

      const connection = HostConnectionFactory.create(host);

      if (connection.type === 'ssh') {
        // SSH 需要建立网络连接
        await (connection as SSHHostConnection).connect();
      }

      if (isCleanedUp) {
        connection.dispose();
        return;
      }

      connectionRef.current = connection;
      setConnectionId(connection.id);
      connectionIdRef.current = connection.id;

      if (connection.type === 'ssh') {
        onConnectionReady?.(connection.id);
      }

      setIsConnected(true);
    } catch (error) {
      // 保留现有的代理重试逻辑...
      const errorMsg = error instanceof Error ? error.message : 'Connection failed';

      if (errorMsg.includes('PROXY_UNREACHABLE:')) {
        // 代理不可达时的重试逻辑（现有逻辑，使用 HostConnectionFactory 重新创建）
        // ... 保留现有代理重试逻辑不变 ...
      } else {
        setConnectionError(errorMsg);
      }
    } finally {
      setIsConnecting(false);
    }
  };

  connectHost();

  return () => {
    isCleanedUp = true;
    if (connectionRef.current) {
      connectionRef.current.dispose();
      connectionRef.current = null;
    }
  };
}, [host]);
```

- [ ] **Step 4: 更新 XTermTerminal 渲染**

```typescript
// 旧:
{backendRef.current && (
  <XTermTerminal backend={backendRef.current} ... />
)}

// 新:
{connectionRef.current && (
  <XTermTerminal backend={connectionRef.current.terminal} ... />
)}
```

- [ ] **Step 5: 更新 handleExecute 和 handleInterrupt**

```typescript
// 旧:
if (backendRef.current) {
  backendRef.current.write(commandWithEnter);
}

// 新:
if (connectionRef.current) {
  connectionRef.current.terminal.write(commandWithEnter);
}
```

同样更新 handleInterrupt 中的 `backendRef.current?.write('\x03')`。

- [ ] **Step 6: 更新 handleReconnect**

```typescript
const handleReconnect = async () => {
  try {
    setIsConnecting(true);
    setConnectionError(null);

    // 清理旧连接
    connectionRef.current?.dispose();

    const connection = HostConnectionFactory.create(host);
    if (connection.type === 'ssh') {
      await (connection as SSHHostConnection).connect();
    }

    connectionRef.current = connection;
    setConnectionId(connection.id);
    setIsConnected(true);
  } catch (error) {
    setConnectionError(error instanceof Error ? error.message : 'Connection failed');
  } finally {
    setIsConnecting(false);
  }
};
```

- [ ] **Step 7: 更新初始 CD（复制 Tab）**

```typescript
// 旧:
backendRef.current?.write(`cd ${...}\n`);

// 新:
connectionRef.current?.terminal.write(`cd ${...}\n`);
```

- [ ] **Step 8: 更新 setConnectionInfo 推送**

```typescript
builtinPluginManager.setConnectionInfo(
  (connectionRef.current && connectionRef.current.type === 'ssh') ? {
    connectionId: connectionRef.current.id,
    connectionType: connectionRef.current.type,
    hostname: host.hostname,
    isVisible: showSidebar,
    isActive,
    language,
  } : null
);
```

- [ ] **Step 9: 验证编译**

```bash
npx tsc --noEmit --pretty 2>&1 | head -50
```

- [ ] **Step 10: Commit**

```bash
git add src/components/TerminalView.tsx
git commit -m "refactor: TerminalView 使用 IHostConnection 替代分散的 sshService/backendRef"
```

---

## Task 9: 集成验证

- [ ] **Step 1: 完整编译检查**

```bash
npx tsc --noEmit --pretty
```

修复任何剩余类型错误。

- [ ] **Step 2: 验证 SSH 终端**

```bash
npm run dev
```

连接一个 SSH 主机，验证：
1. SSH 连接正常
2. 终端输入输出正常
3. Tab 切换正常
4. 文件浏览器正常
5. 关闭 Tab 正常清理

- [ ] **Step 3: 验证本地终端**

点击"本地终端"按钮，验证：
1. 本地 Shell 正常打开
2. 命令输入输出正常
3. Tab 图标显示 Monitor
4. 关闭 Tab 正常清理

- [ ] **Step 4: 修复问题**

根据测试结果修复。

- [ ] **Step 5: Final commit**

```bash
git add -A
git commit -m "feat: 完成 core 重构 + IHostConnection 集成验证"
```
