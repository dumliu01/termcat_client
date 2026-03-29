/**
 * TermCat 插件管理器（Main 进程）
 *
 * 负责：插件发现、加载、激活/停用、生命周期管理
 */

import * as fs from 'fs';
import * as path from 'path';
import { app, ipcMain, BrowserWindow } from 'electron';
import type {
  PluginManifest,
  PluginInfo,
  PluginModule,
  PluginContext,
  PluginLogger,
  PluginState,
  ActivationEvent,
  Disposable,
  PluginPermission,
  SSHConnectionInfo,
  TerminalInfo,
  PluginFileItem,
  CommandResult,
  PluginNotification,
  StatusBarItem,
  ToolbarButton,
  FileContextMenuItem,
  SlashCommand,
} from './types';
import { PLUGIN_IPC_CHANNELS } from './types';
import { PluginRegistry, createPluginAPI, type MainProcessBridge } from './plugin-api';

export class PluginManager {
  private plugins = new Map<string, PluginInstance>();
  private registry: PluginRegistry;
  private mainBridge: MainProcessBridge;
  private pluginsDir: string;
  private pluginDataDir: string;
  private configPath: string;
  private pluginConfig: PluginConfigFile;
  private mainWindow: BrowserWindow | null = null;
  /** 缓存外部插件的面板注册（Renderer reload 后可重放） */
  private panelRegistrations = new Map<string, { pluginId: string; options: any }>();
  /** 缓存外部插件的面板数据（Renderer reload 后可重放） */
  private panelDataCache = new Map<string, any[]>();

  /** Bundled plugins directory (shipped with installer, read-only) */
  private bundledPluginsDir: string;

  constructor() {
    const userDataPath = app.getPath('userData');
    this.pluginsDir = path.join(userDataPath, 'plugins');
    this.pluginDataDir = path.join(userDataPath, 'plugin-data');
    this.configPath = path.join(userDataPath, 'plugin-config.json');
    this.bundledPluginsDir = path.join(process.resourcesPath || '', 'bundled-plugins');
    this.registry = new PluginRegistry();
    this.pluginConfig = { enabled: {}, settings: {} }; // Default, loaded async in initialize()
    this.mainBridge = this.createMainBridge();
  }

  /** 设置主窗口引用（用于 IPC 事件推送） */
  setMainWindow(win: BrowserWindow): void {
    this.mainWindow = win;
    // 补发在 mainWindow 就绪前暂存的事件
    this.flushPendingMessages();
  }

  /** 获取注册表（供外部集成使用） */
  getRegistry(): PluginRegistry {
    return this.registry;
  }

  // ==================== 初始化 ====================

  /** 初始化插件系统：发现 → 注册 IPC → 触发 onStartup */
  async initialize(): Promise<void> {
    console.log('[PluginManager] Initializing plugin system...');

    // Ensure directories and load config (previously in constructor)
    await Promise.all([
      this.ensureDir(this.pluginsDir),
      this.ensureDir(this.pluginDataDir),
      this.loadConfig().then(config => { this.pluginConfig = config; }),
    ]);

    // 1. 扫描并加载所有插件清单（bundled 优先，用户安装的覆盖同名 bundled）
    await this.discoverPluginsFromDir(this.bundledPluginsDir, true);
    await this.discoverPluginsFromDir(this.pluginsDir, false);

    // 2. 注册 IPC 处理器
    this.registerIPCHandlers();

    // 3. 转发本地 Agent 插件事件到 Renderer（必须在 activateByEvent 之前注册，否则事件会丢失）
    this.registry.addEventListener('*', 'local-agent:started', (data: unknown) => {
      console.log('[PluginManager] Forwarding local-agent:started to renderer');
      this.lastLocalAgentData = data;  // 缓存完整数据，供 getLocalAgentStatus 回退查询
      this.sendToRenderer('local-agent:started', data);
    });
    this.registry.addEventListener('*', 'local-agent:stopped', (data: unknown) => {
      console.log('[PluginManager] Forwarding local-agent:stopped to renderer');
      this.lastLocalAgentData = null;
      this.sendToRenderer('local-agent:stopped', data);
    });

    // 4. 激活 onStartup 插件
    await this.activateByEvent('onStartup');

    console.log(`[PluginManager] Initialized. ${this.plugins.size} plugins discovered.`);
  }

  // ==================== 插件发现 ====================

  /**
   * Scan a directory for plugins.
   * @param dir - Directory to scan
   * @param isBundled - If true, these are read-only bundled plugins shipped with the installer.
   *   User-installed plugins (isBundled=false) override bundled ones with the same id.
   */
  private async discoverPluginsFromDir(dir: string, isBundled: boolean): Promise<void> {
    let entries;
    try {
      entries = await fs.promises.readdir(dir, { withFileTypes: true });
    } catch {
      return; // Directory doesn't exist
    }

    for (const entry of entries) {
      // Support symlink directories (common during development: ln -s)
      if (!entry.isDirectory() && !entry.isSymbolicLink()) continue;

      const pluginDir = path.join(dir, entry.name);
      const pkgPath = path.join(pluginDir, 'package.json');

      try { await fs.promises.access(pkgPath); } catch { continue; }

      try {
        const manifest = await this.parseManifest(pluginDir, pkgPath);
        if (!manifest) continue;

        // User-installed plugins override bundled ones
        if (isBundled && this.plugins.has(manifest.id)) continue;

        const enabled = this.pluginConfig.enabled[manifest.id] !== false;

        this.plugins.set(manifest.id, {
          manifest,
          state: 'installed',
          enabled,
          pluginDir,
          module: null,
          context: null,
          api: null,
        });

        console.log(`[PluginManager] Discovered plugin: ${manifest.displayName} (${manifest.id})${isBundled ? ' [bundled]' : ''}`);
      } catch (err) {
        console.error(`[PluginManager] Failed to parse plugin at ${pluginDir}:`, err);
      }
    }
  }

  private async parseManifest(pluginDir: string, pkgPath: string): Promise<PluginManifest | null> {
    const raw = await fs.promises.readFile(pkgPath, 'utf-8');
    const pkg = JSON.parse(raw);
    const termcatConfig = pkg.termcat;
    if (!termcatConfig) return null;

    return {
      id: pkg.name || path.basename(pluginDir),
      displayName: termcatConfig.displayName || pkg.name || path.basename(pluginDir),
      description: termcatConfig.description || pkg.description || '',
      version: pkg.version || '0.0.0',
      entry: termcatConfig.entry || 'dist/extension.js',
      activationEvents: termcatConfig.activationEvents || [],
      permissions: termcatConfig.permissions || [],
      contributes: termcatConfig.contributes || {},
    };
  }

  // ==================== 插件激活 ====================

  /** 根据事件激活匹配的插件 */
  async activateByEvent(event: ActivationEvent): Promise<void> {
    for (const [id, instance] of this.plugins) {
      if (!instance.enabled || instance.state === 'activated') continue;

      const shouldActivate = instance.manifest.activationEvents.some(e => {
        if (e === event) return true;
        // 支持通配符匹配，如 onCommand:* 匹配 onCommand:xxx
        if (e.includes(':') && event.includes(':')) {
          const [eType] = e.split(':');
          const [evtType] = event.split(':');
          return eType === evtType && e.endsWith('*');
        }
        return false;
      });

      if (shouldActivate) {
        await this.activatePlugin(id);
      }
    }
  }

  /** 激活单个插件 */
  async activatePlugin(pluginId: string): Promise<void> {
    const instance = this.plugins.get(pluginId);
    if (!instance) throw new Error(`Plugin not found: ${pluginId}`);
    if (instance.state === 'activated') return;

    console.log(`[PluginManager] Activating plugin: ${pluginId}`);

    try {
      // 1. 加载插件模块
      const entryPath = path.join(instance.pluginDir, instance.manifest.entry);
      try { await fs.promises.access(entryPath); } catch { throw new Error(`Entry file not found: ${entryPath}`); }

      // 清除 require 缓存以支持热重载
      delete require.cache[require.resolve(entryPath)];
      const mod: PluginModule = require(entryPath);

      if (typeof mod.activate !== 'function') {
        throw new Error('Plugin must export an activate() function');
      }

      // 2. 创建插件上下文
      const storagePath = path.join(this.pluginDataDir, pluginId);
      await this.ensureDir(storagePath);

      const logger = this.createPluginLogger(pluginId);
      const context: PluginContext = {
        pluginId,
        pluginPath: instance.pluginDir,
        subscriptions: [],
        logger,
        storagePath,
      };

      // 3. 创建 API 代理
      const api = createPluginAPI(
        pluginId,
        instance.manifest.permissions,
        this.registry,
        this.mainBridge,
      );

      // 4. 注册声明式扩展（contributes）
      this.registerContributions(pluginId, instance.manifest, context);

      // 5. 调用 activate
      // 将 api 挂载到全局让插件访问（模拟 require('@termcat/plugin-api')）
      instance.module = mod;
      instance.context = context;
      instance.api = api;

      // 通过全局变量传递 API（插件内通过 context.api 或参数获取）
      await mod.activate(Object.assign(context, { api }));

      instance.state = 'activated';
      instance.activatedAt = Date.now();

      console.log(`[PluginManager] Plugin activated: ${pluginId}`);
      this.notifyStateChange(pluginId);
    } catch (err) {
      instance.state = 'error';
      instance.error = (err as Error).message;
      console.error(`[PluginManager] Failed to activate plugin ${pluginId}:`, err);
      this.notifyStateChange(pluginId);
    }
  }

  /** 停用单个插件 */
  async deactivatePlugin(pluginId: string): Promise<void> {
    const instance = this.plugins.get(pluginId);
    if (!instance || instance.state !== 'activated') return;

    console.log(`[PluginManager] Deactivating plugin: ${pluginId}`);

    try {
      // 1. 调用 deactivate
      if (instance.module?.deactivate) {
        await instance.module.deactivate();
      }

      // 2. 释放所有订阅
      if (instance.context) {
        for (const sub of instance.context.subscriptions) {
          try { sub.dispose(); } catch { /* ignore */ }
        }
        instance.context.subscriptions = [];
      }

      // 3. 清理注册表中该插件的所有注册
      this.registry.removePluginRegistrations(pluginId);

      instance.state = 'deactivated';
      instance.module = null;
      instance.context = null;
      instance.api = null;

      console.log(`[PluginManager] Plugin deactivated: ${pluginId}`);
      this.notifyStateChange(pluginId);
    } catch (err) {
      console.error(`[PluginManager] Error deactivating plugin ${pluginId}:`, err);
    }
  }

  // ==================== 声明式扩展注册 ====================

  private registerContributions(pluginId: string, manifest: PluginManifest, context: PluginContext): void {
    const { contributes } = manifest;
    if (!contributes) return;

    // 注册命令（声明式，handler 后续由 activate 中编程式注册覆盖）
    if (contributes.commands) {
      for (const cmd of contributes.commands) {
        // 声明式命令只注册元信息，handler 由插件 activate() 中注册
        // 这里创建一个默认 handler 作为占位
        const disposable = this.registry.registerCommand(pluginId, cmd.id, () => {
          console.warn(`[PluginManager] Command ${cmd.id} has no handler registered yet`);
        });
        context.subscriptions.push(disposable);
      }
    }

    // 初始化声明式配置默认值
    if (contributes.settings) {
      for (const [key, setting] of Object.entries(contributes.settings)) {
        if (this.registry.getConfig(pluginId, key) === undefined) {
          // Check if we have a saved value first
          const savedValue = this.pluginConfig.settings[pluginId]?.[key];
          this.registry.setConfig(pluginId, key, savedValue !== undefined ? savedValue : (setting as any).default);
        }
      }
    }
  }

  // ==================== 事件触发接口 ====================

  /** 终端打开事件 */
  emitTerminalOpen(terminal: TerminalInfo): void {
    this.registry.emitEvent('terminal:open', terminal);
    this.activateByEvent('onTerminalOpen');
  }

  /** 终端关闭事件 */
  emitTerminalClose(terminal: TerminalInfo): void {
    this.registry.emitEvent('terminal:close', terminal);
  }

  /** 终端数据事件 */
  emitTerminalData(sessionId: string, data: string): void {
    this.registry.emitEvent(`terminal:data:${sessionId}`, data);
    this.activateByEvent('onTerminalData');
  }

  /** SSH 连接事件 */
  async emitSSHConnect(info: SSHConnectionInfo): Promise<void> {
    // 先激活插件（插件在 activate() 中注册 onDidConnect 回调），再触发事件
    await this.activateByEvent('onSSHConnect');
    this.registry.emitEvent('ssh:connect', info);

    // 触发所有注册的连接初始化钩子
    for (const hook of this.registry.getConnectionInitHooks()) {
      try {
        await hook.onConnect(info);
      } catch (err) {
        console.error('[PluginManager] ConnectionInitHook error:', err);
      }
    }
  }

  /** SSH 断开事件 */
  emitSSHDisconnect(info: SSHConnectionInfo): void {
    this.registry.emitEvent('ssh:disconnect', info);
    this.activateByEvent('onSSHDisconnect');
  }

  /** 文件打开事件 */
  emitFileOpen(file: PluginFileItem): void {
    this.registry.emitEvent('file:open', file);
    this.activateByEvent('onFileOpen');
  }

  /** 文件保存事件 */
  emitFileSave(file: PluginFileItem): void {
    this.registry.emitEvent('file:save', file);
    this.activateByEvent('onFileSave');
  }

  /** AI 消息事件 */
  emitAIMessage(message: unknown): void {
    this.registry.emitEvent('ai:message', message);
    this.activateByEvent('onAIMessage');
  }

  /** 主机连接事件 */
  emitHostConnect(host: unknown): void {
    this.registry.emitEvent('host:connect', host);
  }

  /** 监控数据更新事件 */
  emitMetricsUpdate(metrics: unknown): void {
    this.registry.emitEvent('monitor:update', metrics);
  }

  /** 命令事件（触发 onCommand:xxx） */
  async emitCommand(commandId: string): Promise<void> {
    await this.activateByEvent(`onCommand:${commandId}` as ActivationEvent);
  }

  // ==================== AI 预执行钩子 ====================

  /** 执行所有 preExecuteHook，返回是否允许执行 */
  async checkPreExecuteHooks(command: string, sessionId: string): Promise<boolean> {
    for (const hook of this.registry.getPreExecuteHooks()) {
      try {
        const allowed = await hook.onBeforeExecute(command, sessionId);
        if (!allowed) return false;
      } catch (err) {
        console.error('[PluginManager] PreExecuteHook error:', err);
      }
    }
    return true;
  }

  /** 通过所有消息预处理器处理 AI 消息 */
  async processAIMessage(message: unknown): Promise<unknown> {
    let processed = message;
    for (const preprocessor of this.registry.getMessagePreprocessors()) {
      try {
        processed = await preprocessor.process(processed as any);
      } catch (err) {
        console.error('[PluginManager] MessagePreprocessor error:', err);
      }
    }
    return processed;
  }

  // ==================== 插件管理操作 ====================

  async enablePlugin(pluginId: string): Promise<void> {
    const instance = this.plugins.get(pluginId);
    if (!instance) return;
    instance.enabled = true;
    this.pluginConfig.enabled[pluginId] = true;
    this.saveConfig();
    // 启用后立即尝试激活插件
    if (instance.state !== 'activated') {
      try {
        await this.activatePlugin(pluginId);
      } catch (err) {
        console.error(`[PluginManager] Failed to activate on enable: ${pluginId}`, err);
      }
    }
    this.notifyStateChange(pluginId);
  }

  disablePlugin(pluginId: string): void {
    const instance = this.plugins.get(pluginId);
    if (!instance) return;
    if (instance.state === 'activated') {
      this.deactivatePlugin(pluginId);
    }
    instance.enabled = false;
    this.pluginConfig.enabled[pluginId] = false;
    this.saveConfig();
    this.notifyStateChange(pluginId);
  }

  getPluginList(): PluginInfo[] {
    return Array.from(this.plugins.values()).map(instance => ({
      manifest: instance.manifest,
      state: instance.state,
      enabled: instance.enabled,
      error: instance.error,
      activatedAt: instance.activatedAt,
    }));
  }

  getPluginInfo(pluginId: string): PluginInfo | null {
    const instance = this.plugins.get(pluginId);
    if (!instance) return null;
    return {
      manifest: instance.manifest,
      state: instance.state,
      enabled: instance.enabled,
      error: instance.error,
      activatedAt: instance.activatedAt,
    };
  }

  // ==================== 插件安装/卸载（VS Code 风格） ====================

  /** 下载文件，自动跟随重定向（最多 5 次） */
  private downloadFile(url: string, maxRedirects = 5): Promise<Buffer> {
    // 自动补全协议前缀
    if (url && !url.startsWith('http://') && !url.startsWith('https://')) {
      url = 'https://' + url;
    }
    console.debug(`[PluginManager] Downloading: ${url}`);
    return new Promise((resolve, reject) => {
      if (!url) {
        reject(new Error('Empty URL'));
        return;
      }
      const protocol = url.startsWith('https') ? require('https') : require('http');
      protocol.get(url, (res: any) => {
        // 跟随重定向
        if ((res.statusCode === 301 || res.statusCode === 302 || res.statusCode === 307) && res.headers.location) {
          if (maxRedirects <= 0) {
            reject(new Error('Too many redirects'));
            return;
          }
          this.downloadFile(res.headers.location, maxRedirects - 1).then(resolve, reject);
          return;
        }
        if (res.statusCode !== 200) {
          reject(new Error(`Download failed: HTTP ${res.statusCode}`));
          return;
        }
        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => chunks.push(chunk));
        res.on('end', () => resolve(Buffer.concat(chunks)));
        res.on('error', reject);
      }).on('error', reject);
    });
  }

  /** 从 URL 下载 .tgz 并解压到本地插件目录 */
  async installFromUrl(packageUrl: string, pluginName: string): Promise<{ success: boolean; error?: string }> {
    const targetDir = path.join(this.pluginsDir, pluginName);

    try {
      // 1. 下载 .tgz（使用 Node.js https 模块，自动跟随重定向）
      const tgzBuffer = await this.downloadFile(packageUrl);

      // 2. 清理旧目录（如果存在）
      if (fs.existsSync(targetDir)) {
        fs.rmSync(targetDir, { recursive: true, force: true });
      }
      await this.ensureDir(targetDir);

      // 3. 解压 .tgz（tar.gz）到目标目录
      const tmpTgzPath = path.join(this.pluginsDir, `${pluginName}.tgz`);
      fs.writeFileSync(tmpTgzPath, tgzBuffer);

      const { execSync } = require('child_process');
      execSync(`tar -xzf "${tmpTgzPath}" -C "${targetDir}"`, { timeout: 30000 });

      // 清理临时文件
      fs.unlinkSync(tmpTgzPath);

      // 4. 重新发现插件（只扫描用户目录，bundled 不变）
      await this.discoverPluginsFromDir(this.pluginsDir, false);

      // 5. 安装后立即激活插件
      const instance = this.plugins.get(pluginName);
      if (instance && instance.enabled) {
        try {
          await this.activatePlugin(pluginName);
        } catch (err) {
          console.error(`[PluginManager] Failed to activate after install: ${pluginName}`, err);
        }
      }

      // 6. 通知 Renderer
      this.sendToRenderer(PLUGIN_IPC_CHANNELS.PLUGIN_STATE_CHANGED, {
        pluginId: pluginName,
        event: 'installed',
      });

      console.log(`[PluginManager] Plugin installed: ${pluginName}`);
      return { success: true };
    } catch (err: any) {
      console.error(`[PluginManager] Failed to install plugin ${pluginName}:`, err);
      // 清理失败的安装
      if (fs.existsSync(targetDir)) {
        try { fs.rmSync(targetDir, { recursive: true, force: true }); } catch {}
      }
      return { success: false, error: err.message || String(err) };
    }
  }

  /** 卸载插件：停用并删除本地目录 */
  async uninstallPlugin(pluginId: string): Promise<{ success: boolean; error?: string }> {
    try {
      // 1. 先停用
      const instance = this.plugins.get(pluginId);
      if (instance && instance.state === 'activated') {
        await this.deactivatePlugin(pluginId);
      }

      // 2. 从内存移除
      this.plugins.delete(pluginId);

      // 3. 删除本地目录
      const pluginDir = path.join(this.pluginsDir, pluginId);
      if (fs.existsSync(pluginDir)) {
        fs.rmSync(pluginDir, { recursive: true, force: true });
      }

      // 4. 通知 Renderer
      this.sendToRenderer(PLUGIN_IPC_CHANNELS.PLUGIN_STATE_CHANGED, {
        pluginId,
        event: 'uninstalled',
      });

      console.log(`[PluginManager] Plugin uninstalled: ${pluginId}`);
      return { success: true };
    } catch (err: any) {
      console.error(`[PluginManager] Failed to uninstall plugin ${pluginId}:`, err);
      return { success: false, error: err.message || String(err) };
    }
  }

  // ==================== IPC 处理 ====================

  private registerIPCHandlers(): void {
    // 查询本地 Agent 状态（Renderer 启动后主动拉取，避免事件丢失）
    ipcMain.handle('plugin:get-local-agent-status', () => {
      // 1. 优先返回缓存的完整事件数据（含 modes）
      if (this.lastLocalAgentData) {
        return this.lastLocalAgentData;
      }
      // 2. 回退：检查 pending 队列（mainWindow 未就绪时暂存的）
      const pending = this.pendingRendererMessages.find(m => m.channel === 'local-agent:started');
      if (pending) return pending.data;
      // 3. 最后回退：从 registry config 读取（插件已启动但事件尚未到达时）
      const wsUrl = this.registry.getConfig('local-ops-aiagent', '_wsUrl');
      if (wsUrl) {
        let modes: any[] | undefined;
        try {
          const raw = this.registry.getConfig('local-ops-aiagent', '_modes');
          if (typeof raw === 'string') modes = JSON.parse(raw);
          else if (Array.isArray(raw)) modes = raw;
        } catch {}
        return { wsUrl, port: 0, modes };
      }
      return null;
    });

    ipcMain.handle(PLUGIN_IPC_CHANNELS.LIST_PLUGINS, () => {
      return this.getPluginList();
    });

    ipcMain.handle(PLUGIN_IPC_CHANNELS.ENABLE_PLUGIN, (_event, pluginId: string) => {
      this.enablePlugin(pluginId);
    });

    ipcMain.handle(PLUGIN_IPC_CHANNELS.DISABLE_PLUGIN, (_event, pluginId: string) => {
      this.disablePlugin(pluginId);
    });

    ipcMain.handle(PLUGIN_IPC_CHANNELS.GET_PLUGIN_INFO, (_event, pluginId: string) => {
      return this.getPluginInfo(pluginId);
    });

    ipcMain.handle(PLUGIN_IPC_CHANNELS.GET_STATUS_BAR_ITEMS, () => {
      return this.registry.getStatusBarItems();
    });

    ipcMain.handle(PLUGIN_IPC_CHANNELS.GET_TOOLBAR_BUTTONS, (_event, area?: string) => {
      return this.serializeToolbarButtons(area);
    });

    ipcMain.handle(PLUGIN_IPC_CHANNELS.GET_FILE_CONTEXT_MENUS, () => {
      return this.serializeFileContextMenus();
    });

    ipcMain.handle(PLUGIN_IPC_CHANNELS.GET_SLASH_COMMANDS, () => {
      return this.serializeSlashCommands();
    });

    ipcMain.handle(PLUGIN_IPC_CHANNELS.EXECUTE_COMMAND, async (_event, commandId: string, ...args: unknown[]) => {
      await this.emitCommand(commandId);
      return this.registry.executeCommand(commandId, ...args);
    });

    // 从 URL 下载并安装插件（VS Code 风格：纯本地安装）
    ipcMain.handle(PLUGIN_IPC_CHANNELS.INSTALL_PLUGIN, async (_event, packageUrl: string, pluginName: string) => {
      return this.installFromUrl(packageUrl, pluginName);
    });

    // Renderer 启动/reload 后拉取已缓存的面板注册和数据
    ipcMain.handle('plugin:get-cached-panels', () => {
      return {
        registrations: Array.from(this.panelRegistrations.values()),
        panelData: Array.from(this.panelDataCache.entries()).map(([panelId, sections]) => ({ panelId, sections })),
      };
    });

    // 卸载插件（删除本地目录）
    ipcMain.handle(PLUGIN_IPC_CHANNELS.UNINSTALL_PLUGIN, async (_event, pluginId: string) => {
      return this.uninstallPlugin(pluginId);
    });

    // 获取插件设置定义 + 当前值
    ipcMain.handle('plugin:get-settings', async (_event, pluginId: string) => {
      const plugin = this.plugins.get(pluginId);
      if (!plugin) return { success: false, error: 'Plugin not found' };

      const settingsDefs = plugin.manifest.contributes?.settings || {};
      const currentValues: Record<string, unknown> = {};

      for (const key of Object.keys(settingsDefs)) {
        currentValues[key] = this.registry.getConfig(pluginId, key);
      }

      return { success: true, settings: settingsDefs, values: currentValues };
    });

    // 设置单个插件配置项
    ipcMain.handle('plugin:set-setting', async (_event, pluginId: string, key: string, value: unknown) => {
      const plugin = this.plugins.get(pluginId);
      if (!plugin) return { success: false, error: 'Plugin not found' };

      const oldValue = this.registry.getConfig(pluginId, key);
      this.registry.setConfig(pluginId, key, value);
      this.registry.emitEvent(`config:${pluginId}:${key}`, value, oldValue);

      // 持久化到配置文件
      if (!this.pluginConfig.settings[pluginId]) {
        this.pluginConfig.settings[pluginId] = {};
      }
      this.pluginConfig.settings[pluginId][key] = value;
      await this.saveConfig();

      return { success: true };
    });
  }

  // 序列化方法（去除函数，只传可序列化数据到 Renderer）
  private serializeToolbarButtons(area?: string): Array<Omit<ToolbarButton, 'onClick'>> {
    return this.registry.getToolbarButtons(area).map(({ onClick, ...rest }) => rest);
  }

  private serializeFileContextMenus(): Array<Omit<FileContextMenuItem, 'onClick'>> {
    return this.registry.getFileContextMenuItems().map(({ onClick, ...rest }) => rest);
  }

  private serializeSlashCommands(): Array<Omit<SlashCommand, 'execute'>> {
    return this.registry.getSlashCommands().map(({ execute, ...rest }) => rest);
  }

  // ==================== Main Process Bridge ====================

  private createMainBridge(): MainProcessBridge {
    const manager = this;
    return {
      async invoke(method: string, ...args: unknown[]): Promise<unknown> {
        // 这里桥接到实际的 Main 进程服务
        // 每个方法映射到具体的服务调用
        switch (method) {
          case 'getActiveTerminal':
            return manager.getActiveTerminalInfo();
          case 'getTerminals':
            return manager.getAllTerminalInfos();
          case 'terminalWrite':
            return manager.writeToTerminal(args[0] as string, args[1] as string);
          case 'terminalExecute':
            return manager.executeInTerminal(args[0] as string, args[1] as string);
          case 'getSSHConnection':
            return manager.getSSHConnectionInfo(args[0] as string);
          case 'getSSHConnections':
            return manager.getAllSSHConnections();
          case 'sshExec':
            return manager.sshExec(args[0] as string, args[1] as string);
          case 'fileList':
            return manager.fileList(args[0] as string, args[1] as string);
          case 'fileRead':
            return manager.fileRead(args[0] as string, args[1] as string);
          case 'fileWrite':
            return manager.fileWrite(args[0] as string, args[1] as string, args[2] as string);
          case 'getHosts':
            return manager.getHostList();
          case 'getActiveHost':
            return manager.getActiveHostInfo();
          case 'showNotification':
            manager.sendToRenderer(PLUGIN_IPC_CHANNELS.NOTIFICATION, args[0]);
            return;
          case 'showInputBox':
            return manager.sendToRenderer('plugin:ui:inputbox', { pluginId: args[0], options: args[1] });
          case 'showQuickPick':
            return manager.sendToRenderer('plugin:ui:quickpick', { pluginId: args[0], items: args[1] });
          case 'showConfirm':
            return manager.sendToRenderer('plugin:ui:confirm', { pluginId: args[0], message: args[1], options: args[2] });
          // UI 贡献点面板操作 —— 转发到 Renderer 进程的 panelDataStore（同时缓存，支持 reload 重放）
          case 'panelRegister':
            manager.panelRegistrations.set((args[1] as any).id, { pluginId: args[0] as string, options: args[1] });
            manager.sendToRenderer('plugin:panel:register', { pluginId: args[0], options: args[1] });
            return;
          case 'panelUnregister':
            manager.panelRegistrations.delete(args[0] as string);
            manager.panelDataCache.delete(args[0] as string);
            manager.sendToRenderer('plugin:panel:unregister', { panelId: args[0] });
            return;
          case 'panelSetData':
            manager.panelDataCache.set(args[0] as string, args[1] as any[]);
            manager.sendToRenderer('plugin:panel:setData', { panelId: args[0], sections: args[1] });
            return;
          case 'panelUpdateSection':
            manager.sendToRenderer('plugin:panel:updateSection', { panelId: args[0], sectionId: args[1], data: args[2] });
            return;
          default:
            throw new Error(`Unknown bridge method: ${method}`);
        }
      },

      send(channel: string, data: unknown): void {
        manager.sendToRenderer(channel, data);
      },

      getPluginDataPath(pluginId: string): string {
        return path.join(manager.pluginDataDir, pluginId);
      },
    };
  }

  // ==================== Main 进程服务桥接 ====================

  // 以下方法桥接到实际的 Electron 服务
  // 使用 IPC 与 Renderer 通信获取实时状态

  private activeTerminals = new Map<string, TerminalInfo>();
  private activeSSHConnections = new Map<string, SSHConnectionInfo>();

  /** 注册终端信息（由 main.ts 在终端创建时调用） */
  registerTerminal(info: TerminalInfo): void {
    this.activeTerminals.set(info.sessionId, info);
  }

  unregisterTerminal(sessionId: string): void {
    this.activeTerminals.delete(sessionId);
  }

  registerSSHConnection(info: SSHConnectionInfo): void {
    this.activeSSHConnections.set(info.sessionId, info);
  }

  unregisterSSHConnection(sessionId: string): void {
    this.activeSSHConnections.delete(sessionId);
  }

  private getActiveTerminalInfo(): TerminalInfo | null {
    for (const terminal of this.activeTerminals.values()) {
      if (terminal.isActive) return terminal;
    }
    return null;
  }

  private getAllTerminalInfos(): TerminalInfo[] {
    return Array.from(this.activeTerminals.values());
  }

  private async writeToTerminal(sessionId: string, data: string): Promise<void> {
    this.sendToRenderer('plugin:terminal:write', { sessionId, data });
  }

  private async executeInTerminal(sessionId: string, command: string): Promise<CommandResult> {
    // 通过 IPC 请求 Renderer 执行命令并等待结果
    return new Promise((resolve) => {
      const channel = `plugin:terminal:exec:result:${Date.now()}`;
      ipcMain.once(channel, (_event, result: CommandResult) => {
        resolve(result);
      });
      this.sendToRenderer('plugin:terminal:exec', { sessionId, command, responseChannel: channel });
    });
  }

  private getSSHConnectionInfo(sessionId: string): SSHConnectionInfo | null {
    return this.activeSSHConnections.get(sessionId) || null;
  }

  private getAllSSHConnections(): SSHConnectionInfo[] {
    return Array.from(this.activeSSHConnections.values());
  }

  private async sshExec(sessionId: string, command: string): Promise<CommandResult> {
    return new Promise((resolve) => {
      const channel = `plugin:ssh:exec:result:${Date.now()}`;
      ipcMain.once(channel, (_event, result: CommandResult) => {
        resolve(result);
      });
      this.sendToRenderer('plugin:ssh:exec', { sessionId, command, responseChannel: channel });
    });
  }

  private async fileList(sessionId: string, dirPath: string): Promise<PluginFileItem[]> {
    return new Promise((resolve) => {
      const channel = `plugin:file:list:result:${Date.now()}`;
      ipcMain.once(channel, (_event, result: PluginFileItem[]) => {
        resolve(result);
      });
      this.sendToRenderer('plugin:file:list', { sessionId, path: dirPath, responseChannel: channel });
    });
  }

  private async fileRead(sessionId: string, remotePath: string): Promise<string> {
    return new Promise((resolve) => {
      const channel = `plugin:file:read:result:${Date.now()}`;
      ipcMain.once(channel, (_event, result: string) => {
        resolve(result);
      });
      this.sendToRenderer('plugin:file:read', { sessionId, path: remotePath, responseChannel: channel });
    });
  }

  private async fileWrite(sessionId: string, remotePath: string, content: string): Promise<void> {
    return new Promise((resolve) => {
      const channel = `plugin:file:write:result:${Date.now()}`;
      ipcMain.once(channel, (_event) => {
        resolve();
      });
      this.sendToRenderer('plugin:file:write', { sessionId, path: remotePath, content, responseChannel: channel });
    });
  }

  private async getHostList(): Promise<unknown[]> {
    return new Promise((resolve) => {
      const channel = `plugin:host:list:result:${Date.now()}`;
      ipcMain.once(channel, (_event, result: unknown[]) => {
        resolve(result);
      });
      this.sendToRenderer('plugin:host:list', { responseChannel: channel });
    });
  }

  private async getActiveHostInfo(): Promise<unknown> {
    return new Promise((resolve) => {
      const channel = `plugin:host:active:result:${Date.now()}`;
      ipcMain.once(channel, (_event, result: unknown) => {
        resolve(result);
      });
      this.sendToRenderer('plugin:host:active', { responseChannel: channel });
    });
  }

  // ==================== 工具方法 ====================

  /** 待发送的事件队列（mainWindow 未就绪时暂存） */
  private pendingRendererMessages: Array<{ channel: string; data: unknown }> = [];
  /** 缓存最近一次 local-agent:started 的完整数据（含 modes），供 getLocalAgentStatus 查询 */
  private lastLocalAgentData: unknown = null;

  private sendToRenderer(channel: string, data: unknown): void {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send(channel, data);
    } else {
      // mainWindow 未就绪时暂存，等 setMainWindow 后补发
      this.pendingRendererMessages.push({ channel, data });
    }
  }

  private flushPendingMessages(): void {
    if (!this.mainWindow || this.mainWindow.isDestroyed()) return;
    for (const { channel, data } of this.pendingRendererMessages) {
      this.mainWindow.webContents.send(channel, data);
    }
    this.pendingRendererMessages = [];
  }

  private notifyStateChange(pluginId: string): void {
    const info = this.getPluginInfo(pluginId);
    this.sendToRenderer(PLUGIN_IPC_CHANNELS.PLUGIN_STATE_CHANGED, { pluginId, info });
  }

  private createPluginLogger(pluginId: string): PluginLogger {
    const prefix = `[Plugin:${pluginId}]`;
    return {
      info: (msg, data) => console.log(prefix, msg, data || ''),
      warn: (msg, data) => console.warn(prefix, msg, data || ''),
      error: (msg, data) => console.error(prefix, msg, data || ''),
      debug: (msg, data) => console.debug(prefix, msg, data || ''),
    };
  }

  private async ensureDir(dir: string): Promise<void> {
    await fs.promises.mkdir(dir, { recursive: true }).catch(() => {});
  }

  private async loadConfig(): Promise<PluginConfigFile> {
    try {
      const data = await fs.promises.readFile(this.configPath, 'utf-8');
      return JSON.parse(data);
    } catch {
      return { enabled: {}, settings: {} };
    }
  }

  private saveConfig(): void {
    try {
      fs.writeFileSync(this.configPath, JSON.stringify(this.pluginConfig, null, 2));
    } catch (err) {
      console.error('[PluginManager] Failed to save plugin config:', err);
    }
  }

  /** 应用退出时清理 */
  async shutdown(): Promise<void> {
    console.log('[PluginManager] Shutting down...');
    for (const [id, instance] of this.plugins) {
      if (instance.state === 'activated') {
        await this.deactivatePlugin(id);
      }
    }
  }
}

// ==================== 内部类型 ====================

interface PluginInstance {
  manifest: PluginManifest;
  state: PluginState;
  enabled: boolean;
  pluginDir: string;
  module: PluginModule | null;
  context: PluginContext | null;
  api: unknown;
  error?: string;
  activatedAt?: number;
}

interface PluginConfigFile {
  enabled: Record<string, boolean>;
  settings: Record<string, Record<string, unknown>>;
}

// ==================== 单例 ====================

let pluginManagerInstance: PluginManager | null = null;

export function getPluginManager(): PluginManager {
  if (!pluginManagerInstance) {
    pluginManagerInstance = new PluginManager();
  }
  return pluginManagerInstance;
}
