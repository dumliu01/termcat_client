# termcat-plugin-server-dashboard

外部插件示例 — 展示如何使用 **UI 贡献点模板系统** 构建服务器概览面板。

## 功能

SSH 连接后自动采集服务器信息，通过模板驱动渲染：

| 模板 | 用途 |
|------|------|
| `header` | 面板标题 + LIVE 徽章 |
| `key-value` | 主机信息、负载平均值 |
| `metric-bars` | 内存使用率条形图 |
| `metric-ring` | 磁盘用量环形图（compact 变体） |
| `sparkline` | 负载趋势迷你折线图 |
| `table` | Top 5 进程列表（可排序、可折叠） |
| `notification` | 内存/磁盘告警通知 |

## 安装

将本目录复制到 TermCat 插件目录：

```bash
# macOS
cp -r termcat-plugin-server-dashboard ~/Library/Application\ Support/termcat/plugins/

# Linux
cp -r termcat-plugin-server-dashboard ~/.config/termcat/plugins/

# Windows
# 复制到 %APPDATA%/termcat/plugins/
```

重启 TermCat 即可自动发现并加载。

## 核心 API 用法

```javascript
// 1. 注册模板驱动面板
api.ui.registerPanel({
  id: 'server-dashboard',
  title: 'Server Dashboard',
  icon: 'layout-dashboard',
  slot: 'sidebar-right',
  defaultSize: 320,
});

// 2. 推送全量数据（section 数组）
api.ui.setPanelData('server-dashboard', [
  { id: 'header', template: 'header', data: { title: '...', badge: {...} } },
  { id: 'info',   template: 'key-value', data: { pairs: [...] } },
  { id: 'ring',   template: 'metric-ring', data: { value: 75, ... }, variant: 'compact' },
]);

// 3. 局部更新单个 section
api.ui.updateSection('server-dashboard', 'info', { pairs: [...] });
```

## 开发

本示例为纯 JavaScript，无需构建。如需 TypeScript 开发，参考 `termcat-plugin-git-status` 示例的项目结构。
