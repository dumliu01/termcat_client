/**
 * TermCat Plugin API Implementation
 *
 * Provides the termcat.* namespace for plugins to call.
 * Each plugin instance has an independent API proxy, with access controlled by the permission system.
 */

import type {
  Disposable,
  PluginPermission,
  TerminalInfo,
  CommandResult,
  TerminalDecorator,
  TerminalCompletionProvider,
  SSHConnectionInfo,
  ConnectionInitHook,
  PluginFileItem,
  FilePreviewProvider,
  FileContextMenuItem,
  PluginAIMessage,
  AIMessagePreprocessor,
  SlashCommand,
  PreExecuteHook,
  PluginSystemMetrics,
  MetricsCollector,
  AlertRule,
  InputBoxOptions,
  QuickPickItem,
  ConfirmOptions,
  MessageBoxOptions,
  FormDialogOptions,
  WebviewPanelOptions,
  WebviewPanel,
  SidebarViewProvider,
  StatusBarItem,
  ToolbarButton,
  PluginHost,
  HostDecorator,
  PluginNotification,
} from './types';
import type { PanelRegistration, SectionDescriptor, TemplateData } from './ui-contribution/types';

// ==================== Global Registry ====================

/**
 * Plugin registry - collects all plugin-registered Providers / Hooks / UI components
 * Both PluginManager and Renderer read from this registry
 */
export class PluginRegistry {
  // Commands
  private commands = new Map<string, { pluginId: string; handler: (...args: unknown[]) => unknown }>();

  // Terminal
  private terminalDecorators: Array<{ pluginId: string; decorator: TerminalDecorator }> = [];
  private completionProviders: Array<{ pluginId: string; provider: TerminalCompletionProvider }> = [];

  // SSH
  private connectionInitHooks: Array<{ pluginId: string; hook: ConnectionInitHook }> = [];

  // Files
  private filePreviewProviders: Array<{ pluginId: string; provider: FilePreviewProvider }> = [];
  private fileContextMenus: Array<{ pluginId: string; item: FileContextMenuItem }> = [];

  // AI
  private messagePreprocessors: Array<{ pluginId: string; preprocessor: AIMessagePreprocessor }> = [];
  private slashCommands: Array<{ pluginId: string; command: SlashCommand }> = [];
  private preExecuteHooks: Array<{ pluginId: string; hook: PreExecuteHook }> = [];

  // Monitor
  private metricsCollectors: Array<{ pluginId: string; collector: MetricsCollector }> = [];
  private alertRules: Array<{ pluginId: string; rule: AlertRule }> = [];

  // UI
  private statusBarItems: Array<{ pluginId: string; item: StatusBarItem }> = [];
  private toolbarButtons: Array<{ pluginId: string; button: ToolbarButton }> = [];
  private sidebarViews = new Map<string, { pluginId: string; provider: SidebarViewProvider }>();
  private webviewPanels = new Map<string, WebviewPanel>();

  // Host
  private hostDecorators: Array<{ pluginId: string; decorator: HostDecorator }> = [];

  // Event listeners
  private eventListeners = new Map<string, Array<{ pluginId: string; callback: (...args: unknown[]) => void }>>();

  // Config store
  private configStore = new Map<string, Map<string, unknown>>();

  // Plugin storage
  private storageStore = new Map<string, Map<string, unknown>>();

  // UI update callbacks (registered by Renderer)
  private uiUpdateCallbacks: Array<() => void> = [];

  // ---- 命令 ----

  registerCommand(pluginId: string, id: string, handler: (...args: unknown[]) => unknown): Disposable {
    const fullId = id.includes('.') ? id : `${pluginId}.${id}`;
    this.commands.set(fullId, { pluginId, handler });
    return { dispose: () => { this.commands.delete(fullId); } };
  }

  async executeCommand(id: string, ...args: unknown[]): Promise<unknown> {
    const entry = this.commands.get(id);
    if (!entry) throw new Error(`Command not found: ${id}`);
    return await entry.handler(...args);
  }

  getCommands(): string[] {
    return Array.from(this.commands.keys());
  }

  // ---- Terminal ----

  registerTerminalDecorator(pluginId: string, decorator: TerminalDecorator): Disposable {
    const entry = { pluginId, decorator };
    this.terminalDecorators.push(entry);
    return { dispose: () => { this.removeFromArray(this.terminalDecorators, entry); } };
  }

  registerCompletionProvider(pluginId: string, provider: TerminalCompletionProvider): Disposable {
    const entry = { pluginId, provider };
    this.completionProviders.push(entry);
    return { dispose: () => { this.removeFromArray(this.completionProviders, entry); } };
  }

  getTerminalDecorators(): TerminalDecorator[] {
    return this.terminalDecorators.map(e => e.decorator);
  }

  getCompletionProviders(): TerminalCompletionProvider[] {
    return this.completionProviders.map(e => e.provider);
  }

  // ---- SSH ----

  registerConnectionInitHook(pluginId: string, hook: ConnectionInitHook): Disposable {
    const entry = { pluginId, hook };
    this.connectionInitHooks.push(entry);
    return { dispose: () => { this.removeFromArray(this.connectionInitHooks, entry); } };
  }

  getConnectionInitHooks(): ConnectionInitHook[] {
    return this.connectionInitHooks.map(e => e.hook);
  }

  // ---- Files ----

  registerFilePreviewProvider(pluginId: string, provider: FilePreviewProvider): Disposable {
    const entry = { pluginId, provider };
    this.filePreviewProviders.push(entry);
    return { dispose: () => { this.removeFromArray(this.filePreviewProviders, entry); } };
  }

  registerFileContextMenu(pluginId: string, item: FileContextMenuItem): Disposable {
    const entry = { pluginId, item };
    this.fileContextMenus.push(entry);
    this.notifyUIUpdate();
    return { dispose: () => { this.removeFromArray(this.fileContextMenus, entry); this.notifyUIUpdate(); } };
  }

  getFilePreviewProviders(): FilePreviewProvider[] {
    return this.filePreviewProviders.map(e => e.provider);
  }

  getFileContextMenuItems(): FileContextMenuItem[] {
    return this.fileContextMenus.map(e => e.item);
  }

  // ---- AI ----

  registerMessagePreprocessor(pluginId: string, preprocessor: AIMessagePreprocessor): Disposable {
    const entry = { pluginId, preprocessor };
    this.messagePreprocessors.push(entry);
    return { dispose: () => { this.removeFromArray(this.messagePreprocessors, entry); } };
  }

  registerSlashCommand(pluginId: string, command: SlashCommand): Disposable {
    const entry = { pluginId, command };
    this.slashCommands.push(entry);
    this.notifyUIUpdate();
    return { dispose: () => { this.removeFromArray(this.slashCommands, entry); this.notifyUIUpdate(); } };
  }

  registerPreExecuteHook(pluginId: string, hook: PreExecuteHook): Disposable {
    const entry = { pluginId, hook };
    this.preExecuteHooks.push(entry);
    return { dispose: () => { this.removeFromArray(this.preExecuteHooks, entry); } };
  }

  getMessagePreprocessors(): AIMessagePreprocessor[] {
    return this.messagePreprocessors.map(e => e.preprocessor);
  }

  getSlashCommands(): SlashCommand[] {
    return this.slashCommands.map(e => e.command);
  }

  getPreExecuteHooks(): PreExecuteHook[] {
    return this.preExecuteHooks.map(e => e.hook);
  }

  // ---- Monitor ----

  registerMetricsCollector(pluginId: string, collector: MetricsCollector): Disposable {
    const entry = { pluginId, collector };
    this.metricsCollectors.push(entry);
    return { dispose: () => { this.removeFromArray(this.metricsCollectors, entry); } };
  }

  registerAlertRule(pluginId: string, rule: AlertRule): Disposable {
    const entry = { pluginId, rule };
    this.alertRules.push(entry);
    return { dispose: () => { this.removeFromArray(this.alertRules, entry); } };
  }

  getMetricsCollectors(): MetricsCollector[] {
    return this.metricsCollectors.map(e => e.collector);
  }

  getAlertRules(): AlertRule[] {
    return this.alertRules.map(e => e.rule);
  }

  // ---- UI ----

  registerStatusBarItem(pluginId: string, item: StatusBarItem): Disposable {
    const entry = { pluginId, item };
    this.statusBarItems.push(entry);
    this.notifyUIUpdate();
    return {
      dispose: () => {
        this.removeFromArray(this.statusBarItems, entry);
        this.notifyUIUpdate();
      },
    };
  }

  updateStatusBarItem(id: string, updates: Partial<StatusBarItem>): void {
    const entry = this.statusBarItems.find(e => e.item.id === id);
    if (entry) {
      Object.assign(entry.item, updates);
      this.notifyUIUpdate();
    }
  }

  registerToolbarButton(pluginId: string, button: ToolbarButton): Disposable {
    const entry = { pluginId, button };
    this.toolbarButtons.push(entry);
    this.notifyUIUpdate();
    return {
      dispose: () => {
        this.removeFromArray(this.toolbarButtons, entry);
        this.notifyUIUpdate();
      },
    };
  }

  registerSidebarView(pluginId: string, viewId: string, provider: SidebarViewProvider): Disposable {
    this.sidebarViews.set(viewId, { pluginId, provider });
    this.notifyUIUpdate();
    return {
      dispose: () => {
        this.sidebarViews.delete(viewId);
        this.notifyUIUpdate();
      },
    };
  }

  getStatusBarItems(): StatusBarItem[] {
    return this.statusBarItems.map(e => e.item);
  }

  getToolbarButtons(area?: string): ToolbarButton[] {
    const buttons = this.toolbarButtons.map(e => e.button);
    return area ? buttons.filter(b => b.area === area) : buttons;
  }

  getSidebarViews(): Array<{ viewId: string; pluginId: string; provider: SidebarViewProvider }> {
    return Array.from(this.sidebarViews.entries()).map(([viewId, v]) => ({
      viewId,
      pluginId: v.pluginId,
      provider: v.provider,
    }));
  }

  // ---- Host ----

  registerHostDecorator(pluginId: string, decorator: HostDecorator): Disposable {
    const entry = { pluginId, decorator };
    this.hostDecorators.push(entry);
    return { dispose: () => { this.removeFromArray(this.hostDecorators, entry); } };
  }

  getHostDecorators(): HostDecorator[] {
    return this.hostDecorators.map(e => e.decorator);
  }

  // ---- 事件 ----

  addEventListener(pluginId: string, event: string, callback: (...args: unknown[]) => void): Disposable {
    if (!this.eventListeners.has(event)) {
      this.eventListeners.set(event, []);
    }
    const entry = { pluginId, callback };
    this.eventListeners.get(event)!.push(entry);
    return {
      dispose: () => {
        const listeners = this.eventListeners.get(event);
        if (listeners) {
          const idx = listeners.indexOf(entry);
          if (idx >= 0) listeners.splice(idx, 1);
        }
      },
    };
  }

  emitEvent(event: string, ...args: unknown[]): void {
    const listeners = this.eventListeners.get(event);
    if (!listeners) return;
    for (const { callback } of listeners) {
      try {
        callback(...args);
      } catch (err) {
        console.error(`[PluginRegistry] Event handler error for "${event}":`, err);
      }
    }
  }

  // ---- 配置 ----

  getConfig(pluginId: string, key: string): unknown {
    return this.configStore.get(pluginId)?.get(key);
  }

  setConfig(pluginId: string, key: string, value: unknown): void {
    if (!this.configStore.has(pluginId)) {
      this.configStore.set(pluginId, new Map());
    }
    this.configStore.get(pluginId)!.set(key, value);
  }

  // ---- 存储 ----

  getStorage(pluginId: string, key: string): unknown {
    return this.storageStore.get(pluginId)?.get(key);
  }

  setStorage(pluginId: string, key: string, value: unknown): void {
    if (!this.storageStore.has(pluginId)) {
      this.storageStore.set(pluginId, new Map());
    }
    this.storageStore.get(pluginId)!.set(key, value);
  }

  deleteStorage(pluginId: string, key: string): void {
    this.storageStore.get(pluginId)?.delete(key);
  }

  // ---- UI 更新通知 ----

  onUIUpdate(callback: () => void): Disposable {
    this.uiUpdateCallbacks.push(callback);
    return { dispose: () => { this.uiUpdateCallbacks = this.uiUpdateCallbacks.filter(c => c !== callback); } };
  }

  private notifyUIUpdate(): void {
    for (const cb of this.uiUpdateCallbacks) {
      try { cb(); } catch (err) { console.error('[PluginRegistry] UI update callback error:', err); }
    }
  }

  // ---- 清理 ----

  removePluginRegistrations(pluginId: string): void {
    // Remove all content registered by this plugin
    this.commands.forEach((v, k) => { if (v.pluginId === pluginId) this.commands.delete(k); });
    this.terminalDecorators = this.terminalDecorators.filter(e => e.pluginId !== pluginId);
    this.completionProviders = this.completionProviders.filter(e => e.pluginId !== pluginId);
    this.connectionInitHooks = this.connectionInitHooks.filter(e => e.pluginId !== pluginId);
    this.filePreviewProviders = this.filePreviewProviders.filter(e => e.pluginId !== pluginId);
    this.fileContextMenus = this.fileContextMenus.filter(e => e.pluginId !== pluginId);
    this.messagePreprocessors = this.messagePreprocessors.filter(e => e.pluginId !== pluginId);
    this.slashCommands = this.slashCommands.filter(e => e.pluginId !== pluginId);
    this.preExecuteHooks = this.preExecuteHooks.filter(e => e.pluginId !== pluginId);
    this.metricsCollectors = this.metricsCollectors.filter(e => e.pluginId !== pluginId);
    this.alertRules = this.alertRules.filter(e => e.pluginId !== pluginId);
    this.statusBarItems = this.statusBarItems.filter(e => e.pluginId !== pluginId);
    this.toolbarButtons = this.toolbarButtons.filter(e => e.pluginId !== pluginId);
    this.sidebarViews.forEach((v, k) => { if (v.pluginId === pluginId) this.sidebarViews.delete(k); });
    this.hostDecorators = this.hostDecorators.filter(e => e.pluginId !== pluginId);

    this.eventListeners.forEach((listeners, event) => {
      this.eventListeners.set(event, listeners.filter(e => e.pluginId !== pluginId));
    });

    this.configStore.delete(pluginId);
    this.storageStore.delete(pluginId);

    this.notifyUIUpdate();
  }

  // ---- 工具方法 ----

  private removeFromArray<T>(arr: T[], item: T): void {
    const idx = arr.indexOf(item);
    if (idx >= 0) arr.splice(idx, 1);
  }
}

// ==================== Plugin API Proxy Factory ====================

/**
 * Create an independent API proxy for each plugin
 * Access control through permission checking
 */
export function createPluginAPI(
  pluginId: string,
  permissions: PluginPermission[],
  registry: PluginRegistry,
  mainBridge: MainProcessBridge,
) {
  function checkPermission(required: PluginPermission): void {
    if (!permissions.includes(required)) {
      throw new Error(`Plugin "${pluginId}" lacks permission: ${required}`);
    }
  }

  const terminal = {
    async getActiveTerminal(): Promise<TerminalInfo | null> {
      checkPermission('terminal.read');
      return mainBridge.invoke('getActiveTerminal');
    },

    async getTerminals(): Promise<TerminalInfo[]> {
      checkPermission('terminal.read');
      return mainBridge.invoke('getTerminals');
    },

    async getPid(sessionId: string): Promise<number | null> {
      checkPermission('terminal.read');
      return mainBridge.invoke('terminalGetPid', sessionId);
    },

    async write(sessionId: string, data: string): Promise<void> {
      checkPermission('terminal.write');
      return mainBridge.invoke('terminalWrite', sessionId, data);
    },

    async focus(sessionId: string): Promise<void> {
      checkPermission('terminal.write');
      return mainBridge.invoke('terminalFocus', sessionId);
    },

    async executeCommand(sessionId: string, command: string): Promise<CommandResult> {
      checkPermission('terminal.write');
      return mainBridge.invoke('terminalExecute', sessionId, command);
    },

    onData(sessionId: string, callback: (data: string) => void): Disposable {
      checkPermission('terminal.read');
      return registry.addEventListener(pluginId, `terminal:data:${sessionId}`, callback as (...args: unknown[]) => void);
    },

    onDidOpenTerminal(callback: (terminal: TerminalInfo) => void): Disposable {
      checkPermission('terminal.read');
      return registry.addEventListener(pluginId, 'terminal:open', callback as (...args: unknown[]) => void);
    },

    onDidCloseTerminal(callback: (terminal: TerminalInfo) => void): Disposable {
      checkPermission('terminal.read');
      return registry.addEventListener(pluginId, 'terminal:close', callback as (...args: unknown[]) => void);
    },

    registerTerminalDecorator(decorator: TerminalDecorator): Disposable {
      checkPermission('terminal.read');
      return registry.registerTerminalDecorator(pluginId, decorator);
    },

    registerCompletionProvider(provider: TerminalCompletionProvider): Disposable {
      checkPermission('terminal.read');
      return registry.registerCompletionProvider(pluginId, provider);
    },
  };

  const ssh = {
    async getConnection(sessionId: string): Promise<SSHConnectionInfo | null> {
      checkPermission('terminal.read');
      return mainBridge.invoke('getSSHConnection', sessionId);
    },

    async getConnections(): Promise<SSHConnectionInfo[]> {
      checkPermission('terminal.read');
      return mainBridge.invoke('getSSHConnections');
    },

    onDidConnect(callback: (info: SSHConnectionInfo) => void): Disposable {
      checkPermission('terminal.read');
      return registry.addEventListener(pluginId, 'ssh:connect', callback as (...args: unknown[]) => void);
    },

    onDidDisconnect(callback: (info: SSHConnectionInfo) => void): Disposable {
      checkPermission('terminal.read');
      return registry.addEventListener(pluginId, 'ssh:disconnect', callback as (...args: unknown[]) => void);
    },

    async exec(sessionId: string, command: string): Promise<CommandResult> {
      checkPermission('ssh.exec');
      return mainBridge.invoke('sshExec', sessionId, command);
    },

    registerConnectionInitHook(hook: ConnectionInitHook): Disposable {
      checkPermission('ssh.exec');
      return registry.registerConnectionInitHook(pluginId, hook);
    },
  };

  const files = {
    async list(sessionId: string, path: string): Promise<PluginFileItem[]> {
      checkPermission('files.read');
      return mainBridge.invoke('fileList', sessionId, path);
    },

    async read(sessionId: string, remotePath: string): Promise<string> {
      checkPermission('files.read');
      return mainBridge.invoke('fileRead', sessionId, remotePath);
    },

    async write(sessionId: string, remotePath: string, content: string): Promise<void> {
      checkPermission('files.write');
      return mainBridge.invoke('fileWrite', sessionId, remotePath, content);
    },

    onDidOpenFile(callback: (file: PluginFileItem) => void): Disposable {
      checkPermission('files.read');
      return registry.addEventListener(pluginId, 'file:open', callback as (...args: unknown[]) => void);
    },

    onDidSaveFile(callback: (file: PluginFileItem) => void): Disposable {
      checkPermission('files.read');
      return registry.addEventListener(pluginId, 'file:save', callback as (...args: unknown[]) => void);
    },

    registerFilePreviewProvider(provider: FilePreviewProvider): Disposable {
      checkPermission('files.read');
      return registry.registerFilePreviewProvider(pluginId, provider);
    },

    registerFileContextMenu(item: FileContextMenuItem): Disposable {
      checkPermission('files.read');
      return registry.registerFileContextMenu(pluginId, item);
    },
  };

  const ai = {
    async ask(prompt: string, mode?: 'normal' | 'agent' | 'code' | 'x-agent'): Promise<void> {
      checkPermission('ai.message');
      return mainBridge.invoke('aiAsk', prompt, mode);
    },

    onMessage(callback: (message: PluginAIMessage) => void): Disposable {
      checkPermission('ai.message');
      return registry.addEventListener(pluginId, 'ai:message', callback as (...args: unknown[]) => void);
    },

    onTaskStateChange(callback: (state: unknown) => void): Disposable {
      checkPermission('ai.message');
      return registry.addEventListener(pluginId, 'ai:taskstate', callback as (...args: unknown[]) => void);
    },

    registerMessagePreprocessor(preprocessor: AIMessagePreprocessor): Disposable {
      checkPermission('ai.message');
      return registry.registerMessagePreprocessor(pluginId, preprocessor);
    },

    registerSlashCommand(command: SlashCommand): Disposable {
      checkPermission('ai.message');
      return registry.registerSlashCommand(pluginId, command);
    },

    registerPreExecuteHook(hook: PreExecuteHook): Disposable {
      checkPermission('ai.message');
      return registry.registerPreExecuteHook(pluginId, hook);
    },
  };

  const monitor = {
    async getMetrics(sessionId: string): Promise<PluginSystemMetrics> {
      checkPermission('monitor.read');
      return mainBridge.invoke('getMetrics', sessionId);
    },

    onMetricsUpdate(callback: (metrics: PluginSystemMetrics) => void): Disposable {
      checkPermission('monitor.read');
      return registry.addEventListener(pluginId, 'monitor:update', callback as (...args: unknown[]) => void);
    },

    registerMetricsCollector(collector: MetricsCollector): Disposable {
      checkPermission('monitor.read');
      return registry.registerMetricsCollector(pluginId, collector);
    },

    registerAlertRule(rule: AlertRule): Disposable {
      checkPermission('monitor.read');
      return registry.registerAlertRule(pluginId, rule);
    },
  };

  const ui = {
    showNotification(message: string, type: PluginNotification['type'] = 'info'): void {
      mainBridge.send('showNotification', { pluginId, message, type });
    },

    async showInputBox(options: InputBoxOptions): Promise<string | undefined> {
      return mainBridge.invoke('showInputBox', pluginId, options);
    },

    async showQuickPick(items: QuickPickItem[]): Promise<QuickPickItem | undefined> {
      return mainBridge.invoke('showQuickPick', pluginId, items);
    },

    async showConfirm(message: string, options?: ConfirmOptions): Promise<boolean> {
      return mainBridge.invoke('showConfirm', pluginId, message, options);
    },

    /** Display a read-only text modal. Returns when the user closes the dialog. */
    async showMessage(options: MessageBoxOptions): Promise<void> {
      return mainBridge.invoke('showMessage', pluginId, options);
    },

    /**
     * Show a multi-field form dialog. Resolves to a `{ fieldId: value }` map
     * on submit, or `undefined` on cancel. Password-type fields are masked.
     */
    async showForm(options: FormDialogOptions): Promise<Record<string, string> | undefined> {
      return mainBridge.invoke('showForm', pluginId, options);
    },

    registerStatusBarItem(item: StatusBarItem): Disposable {
      return registry.registerStatusBarItem(pluginId, item);
    },

    updateStatusBarItem(id: string, updates: Partial<StatusBarItem>): void {
      registry.updateStatusBarItem(id, updates);
    },

    registerToolbarButton(button: ToolbarButton): Disposable {
      return registry.registerToolbarButton(pluginId, button);
    },

    registerSidebarView(viewId: string, provider: SidebarViewProvider): Disposable {
      return registry.registerSidebarView(pluginId, viewId, provider);
    },

    // ---- UI contribution points (template-driven panels)----

    registerPanel(
      options: PanelRegistration,
      onEvent?: (sectionId: string, eventId: string, payload: unknown) => void,
    ): Disposable {
      // External plugins run in Main process, need to bridge to Renderer's panelDataStore via IPC
      mainBridge.invoke('panelRegister', pluginId, options, Boolean(onEvent));
      const off = onEvent
        ? registry.addEventListener(pluginId, `panel:event:${options.id}`, (...args) => {
            const [sectionId, eventId, payload] = args as [string, string, unknown];
            try {
              onEvent(sectionId, eventId, payload);
            } catch {
              /* swallow */
            }
          })
        : null;
      return {
        dispose: () => {
          off?.dispose();
          mainBridge.invoke('panelUnregister', options.id);
        },
      };
    },

    setPanelData(panelId: string, sections: SectionDescriptor[]): void {
      mainBridge.invoke('panelSetData', panelId, sections);
    },

    updateSection(panelId: string, sectionId: string, data: TemplateData): void {
      mainBridge.invoke('panelUpdateSection', panelId, sectionId, data);
    },
  };

  const commands = {
    registerCommand(id: string, handler: (...args: unknown[]) => unknown): Disposable {
      return registry.registerCommand(pluginId, id, handler);
    },

    async executeCommand(id: string, ...args: unknown[]): Promise<unknown> {
      return registry.executeCommand(id, ...args);
    },

    async getCommands(): Promise<string[]> {
      return registry.getCommands();
    },
  };

  const config = {
    get<T>(key: string): T | undefined {
      return registry.getConfig(pluginId, key) as T | undefined;
    },

    async set(key: string, value: unknown): Promise<void> {
      const oldValue = registry.getConfig(pluginId, key);
      registry.setConfig(pluginId, key, value);
      registry.emitEvent(`config:${pluginId}:${key}`, value, oldValue);
    },

    onDidChange(key: string, callback: (newValue: unknown, oldValue: unknown) => void): Disposable {
      return registry.addEventListener(pluginId, `config:${pluginId}:${key}`, callback);
    },
  };

  const storage = {
    async get(key: string): Promise<unknown> {
      return registry.getStorage(pluginId, key);
    },

    async set(key: string, value: unknown): Promise<void> {
      registry.setStorage(pluginId, key, value);
    },

    async delete(key: string): Promise<void> {
      registry.deleteStorage(pluginId, key);
    },

    getDataPath(): string {
      return mainBridge.getPluginDataPath(pluginId);
    },
  };

  const host = {
    async getHosts(): Promise<PluginHost[]> {
      checkPermission('host.read');
      return mainBridge.invoke('getHosts');
    },

    async getActiveHost(): Promise<PluginHost | null> {
      checkPermission('host.read');
      return mainBridge.invoke('getActiveHost');
    },

    onDidConnect(callback: (host: PluginHost) => void): Disposable {
      checkPermission('host.read');
      return registry.addEventListener(pluginId, 'host:connect', callback as (...args: unknown[]) => void);
    },

    registerHostDecorator(decorator: HostDecorator): Disposable {
      checkPermission('host.read');
      return registry.registerHostDecorator(pluginId, decorator);
    },
  };

  const events = {
    emit(eventName: string, data?: unknown): void {
      registry.emitEvent(eventName, data);
    },
    on(eventName: string, callback: (...args: unknown[]) => void): Disposable {
      return registry.addEventListener(pluginId, eventName, callback);
    },
  };

  const i18n = {
    /** Current UI language as known to the host ('zh' | 'en' | 'es'). */
    async getLanguage(): Promise<string> {
      return mainBridge.invoke('getLanguage');
    },
    /** Subscribe to UI language changes. Fires on every `setLanguage` in the renderer. */
    onDidChangeLanguage(callback: (language: string) => void): Disposable {
      return registry.addEventListener(pluginId, 'i18n:language-change', callback as (...args: unknown[]) => void);
    },
  };

  return { terminal, ssh, files, ai, monitor, ui, commands, config, storage, host, events, i18n };
}

export type PluginAPI = ReturnType<typeof createPluginAPI>;

// ==================== Main Process Bridge ====================

/**
 * Abstract Main process bridge layer
 * Uses direct calls in Main process, can be replaced with IPC/JSON-RPC in the future
 */
export interface MainProcessBridge {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  invoke(method: string, ...args: unknown[]): Promise<any>;
  send(channel: string, data: unknown): void;
  getPluginDataPath(pluginId: string): string;
}
