# TermCat Client 实现步骤

## 已完成✅

### 1. 项目结构搭建
- ✅ 创建目录结构
- ✅ package.json 配置
- ✅ TypeScript 配置
- ✅ Vite 配置
- ✅ .gitignore

### 2. 核心文件
- ✅ Electron 主进程 (`src/main/main.ts`)
- ✅ 预加载脚本 (`src/preload/preload.ts`)
- ✅ 类型定义 (`src/types/index.ts`)
- ✅ API服务 (`src/services/api.ts`)
- ✅ App.tsx主应用组件
- ✅ 样式文件 (`src/renderer/styles/index.css`)
- ✅ 入口文件 (`src/renderer/main.tsx`)

## 待完成❌

### 3. 复制并适配aiterm的UI组件

从 `aiterm/components/` 复制以下组件到 `termcat_client/src/components/`:

#### 必需组件:
1. **Sidebar.tsx** - 侧边栏组件
   - 修改导入路径: `from './types'` → `from '../types'`

2. **Dashboard.tsx** - 主机管理面板
   - 修改导入路径: `from '../types'` → `from '../types'`

3. **TerminalView.tsx** - 终端视图组件
   - 修改导入路径
   - 集成真实的SSH连接（调用API服务）

4. **LoginView.tsx** - 登录视图组件
   - 修改导入路径
   - 集成真实的认证API

### 4. 集成WebSocket

创建 `src/services/websocket.ts` 用于SSH实时通信:

```typescript
import { io, Socket } from 'socket.io-client';

class WebSocketService {
  private socket: Socket | null = null;

  connect(sessionId: string) {
    const wsUrl = import.meta.env.VITE_WS_BASE_URL;
    this.socket = io(wsUrl, {
      query: { sessionId }
    });

    return this.socket;
  }

  disconnect() {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
  }
}

export const wsService = new WebSocketService();
```

### 5. 安装依赖

```bash
cd termcat_client
npm install
```

### 6. 启动开发环境

```bash
npm run electron:dev
```

## 重要修改说明

### 本地存储键名变更
所有localStorage键已从`aiterm_*`更改为`termcat_*`:
- `termcat_user` - 用户信息
- `termcat_hosts` - 主机列表
- `termcat_groups` - 主机分组
- `termcat_theme` - 主题设置

### API集成
`src/services/api.ts` 已准备好所有API端点：
- 认证: `/auth/login`, `/auth/register`
- 主机管理: `/hosts/*`
- SSH连接: `/ssh/connect`, `/ssh/execute`
- 文件传输: `/files/upload`, `/files/download`
- AI命令: `/ai/generate`
- 用户管理: `/users/*`

### WebSocket实时通信
需要建立WebSocket连接以实现:
- SSH终端实时输入输出
- 系统监控数据实时更新
- 文件传输进度实时显示

## 下一步: 后端开发

完成前端UI后，需要实现:
1. `termcat_server` - Go后端API服务
2. `termcat_aiagent` - Python AI服务
3. MySQL数据库设计
4. JWT认证实现
5. SSL/HTTPS配置
