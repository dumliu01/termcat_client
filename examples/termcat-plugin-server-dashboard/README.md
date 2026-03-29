# termcat-plugin-server-dashboard

External plugin example — demonstrates how to build a server overview panel using the **UI Contribution Point Template System**.

## Features

Automatically collects server information after SSH connection, rendered via template-driven system:

| Template | Usage |
|------|------|
| `header` | Panel title + LIVE badge |
| `key-value` | Host info, load averages |
| `metric-bars` | Memory usage bar chart |
| `metric-ring` | Disk usage ring chart (compact variant) |
| `sparkline` | Load trend sparkline chart |
| `table` | Top 5 process list (sortable, collapsible) |
| `notification` | Memory/disk alert notifications |

## Installation

Copy this directory to TermCat plugins directory:

```bash
# macOS
cp -r termcat-plugin-server-dashboard ~/Library/Application\ Support/termcat/plugins/

# Linux
cp -r termcat-plugin-server-dashboard ~/.config/termcat/plugins/

# Windows
# Copy to %APPDATA%/termcat/plugins/
```

Restart TermCat to automatically discover and load the plugin.

## Core API Usage

```javascript
// 1. Register template-driven panel
api.ui.registerPanel({
  id: 'server-dashboard',
  title: 'Server Dashboard',
  icon: 'layout-dashboard',
  slot: 'sidebar-right',
  defaultSize: 320,
});

// 2. Push full data (section array)
api.ui.setPanelData('server-dashboard', [
  { id: 'header', template: 'header', data: { title: '...', badge: {...} } },
  { id: 'info',   template: 'key-value', data: { pairs: [...] } },
  { id: 'ring',   template: 'metric-ring', data: { value: 75, ... }, variant: 'compact' },
]);

// 3. Partial update for single section
api.ui.updateSection('server-dashboard', 'info', { pairs: [...] });
```

## Development

This example is pure JavaScript with no build step. For TypeScript development, refer to the `termcat-plugin-git-status` example project structure.
