import axios, { AxiosInstance, AxiosRequestConfig } from 'axios';
import { authService } from '@/core/auth/authService';
import { logger, LOG_MODULE } from '../logger/logger';

// Unified RPC response format
interface ApiResponse<T = any> {
  code: number;
  message: string;
  data?: T;
}

// RPC error
class ApiError extends Error {
  code: number;
  constructor(code: number, message: string) {
    super(message);
    this.code = code;
    this.name = 'ApiError';
  }
}

class ApiService {
  private api: AxiosInstance;
  private baseURL: string;

  constructor() {
    this.baseURL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8080/api/v1';

    this.api = axios.create({
      baseURL: this.baseURL,
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    // Request interceptor
    this.api.interceptors.request.use(
      (config) => {
        const token = authService.getToken();
        if (token) {
          config.headers.Authorization = `Bearer ${token}`;
        }

        // Log HTTP request
        const startTime = Date.now();
        config.metadata = { startTime };

        logger.debug(LOG_MODULE.HTTP, 'http.request.starting', 'HTTP request starting', {
          url: config.url,
          method: config.method?.toUpperCase() || 'POST',
        });

        return config;
      },
      (error) => {
        logger.error(LOG_MODULE.HTTP, 'http.request.error', 'HTTP request error', {
          error: 1,
          msg: error.message || 'Request interceptor error',
        });
        return Promise.reject(error);
      }
    );

    // Response interceptor
    this.api.interceptors.response.use(
      (response) => {
        // Log successful response
        const startTime = response.config.metadata?.startTime || Date.now();
        const latencyMs = Date.now() - startTime;

        logger.info(LOG_MODULE.HTTP, 'http.request.completed', 'HTTP request completed', {
          url: response.config.url,
          method: response.config.method?.toUpperCase() || 'POST',
          status: response.status,
          latency_ms: latencyMs,
        });

        return response;
      },
      (error) => {
        // Log error response
        const startTime = error.config?.metadata?.startTime || Date.now();
        const latencyMs = Date.now() - startTime;
        const status = error.response?.status || 0;

        logger.error(LOG_MODULE.HTTP, 'http.request.failed', 'HTTP request failed', {
          url: error.config?.url || 'unknown',
          error: status || 1,
          msg: error.message || 'HTTP request failed',
          method: error.config?.method?.toUpperCase() || 'POST',
          status: status,
          latency_ms: latencyMs,
        });

        if (error.response?.status === 401 && authService.isAuthenticated()) {
          // Only trigger auth failure flow when user is already logged in (has token)
          // Guest mode has no token, 401 is expected behavior, should not redirect to login
          logger.info(LOG_MODULE.AUTH, 'auth.session.expired', 'Session expired, clearing auth data');
          authService.logout();
          authService.notifyAuthFailed();
        }
        return Promise.reject(error);
      }
    );
  }

  // Unified RPC call method
  private async rpc<T = any>(action: string, params?: any): Promise<T> {
    const response = await this.api.post<ApiResponse<T>>(action, params || {});
    const body = response.data;
    if (body.code !== 0) {
      throw new ApiError(body.code, body.message);
    }
    return body.data as T;
  }

  // Auth endpoints
  async login(email: string, password: string) {
    return this.rpc('/auth/login', { email, password });
  }

  async register(email: string, password: string, name: string) {
    return this.rpc('/auth/register', { email, password, name });
  }

  async refreshToken(): Promise<{ token: string; refresh_interval_minutes: number; seqs?: import('@/core/commerce/types').SyncSeqs }> {
    return this.rpc('/auth/refresh');
  }

  // Host management endpoints
  async getHosts() {
    const data = await this.rpc<any[]>('/host/list');

    logger.debug(LOG_MODULE.HTTP, 'Raw server hosts response received', {
      count: data?.length || 0,
      module: LOG_MODULE.HTTP,
    });

    // Convert server data to frontend format
    // Note: Server doesn't return password and private_key for security reasons
    const hosts = (data || []).map((host: any) => ({
      id: String(host.id),
      name: host.name,
      hostname: host.hostname,
      username: host.username,
      authType: host.auth_type === 'key' ? 'ssh_key' : 'password',
      // Server doesn't return sensitive info, these fields will be undefined
      password: undefined, // Server doesn't return password
      sshKey: undefined,   // Server doesn't return private key
      port: host.port || 22,
      os: 'linux' as const, // Default linux, backend needs to add os field
      tags: host.tags ? (typeof host.tags === 'string' ? JSON.parse(host.tags) : host.tags) : [],
      notes: host.description,
      groupId: host.group_id ? String(host.group_id) : undefined,
      proxyId: host.proxy_id ? String(host.proxy_id) : undefined,
      tunnels: (host.tunnels || []).map((t: any) => ({
        id: String(t.id),
        name: t.name,
        type: t.type,
        listenPort: t.listen_port,
        targetAddress: t.target_address,
        targetPort: t.target_port,
      })),
      connectionType: host.connection_type || 'direct',
      targetHost: host.target_host || undefined,
      targetUsername: host.target_username || undefined,
      targetPort: host.target_port || undefined,
      proxy: host.proxy, // Proxy association object returned by server
      terminal: host.terminal_config
        ? (typeof host.terminal_config === 'string' ? JSON.parse(host.terminal_config) : host.terminal_config)
        : undefined,
    }));

    logger.debug(LOG_MODULE.HTTP, 'Converted hosts from server', {
      count: hosts.length,
      module: LOG_MODULE.HTTP,
    });
    return hosts;
  }

  async createHost(host: any) {
    // Convert frontend data to backend format
    const payload = {
      name: host.name,
      hostname: host.hostname,
      port: host.port || 22,
      username: host.username,
      password: host.authType === 'password' ? host.password : undefined,
      private_key: host.authType === 'ssh_key' ? host.sshKey : undefined,
      auth_type: host.authType === 'ssh_key' ? 'key' : 'password',
      group_id: host.groupId ? parseInt(host.groupId) : undefined,
      tags: host.tags && host.tags.length > 0 ? JSON.stringify(host.tags) : undefined,
      description: host.notes,
      terminal_config: host.terminal ? JSON.stringify(host.terminal) : undefined,
      proxy_id: host.proxyId ? parseInt(host.proxyId) : undefined,
      connection_type: host.connectionType || 'direct',
      target_host: host.connectionType === 'jump' ? host.targetHost : '',
      target_username: host.connectionType === 'jump' ? host.targetUsername : '',
      target_port: host.connectionType === 'jump' ? (host.targetPort || 22) : 0,
      tunnels: (host.tunnels || []).map((t: any) => ({
        name: t.name,
        type: t.type,
        listen_port: t.listenPort,
        target_address: t.targetAddress,
        target_port: t.targetPort,
      })),
    };
    try {
      const created = await this.rpc('/host/create', payload);
      // Return converted data
      return {
        id: String(created.id),
        name: created.name,
        hostname: created.hostname,
        username: created.username,
        authType: created.auth_type === 'key' ? 'ssh_key' : 'password',
        password: created.password,
        sshKey: created.private_key,
        port: created.port || 22,
        os: 'linux' as const,
        tags: created.tags ? (typeof created.tags === 'string' ? JSON.parse(created.tags) : created.tags) : [],
        notes: created.description,
        groupId: created.group_id ? String(created.group_id) : undefined,
        proxyId: created.proxy_id ? String(created.proxy_id) : undefined,
        tunnels: (created.tunnels || []).map((t: any) => ({
          id: String(t.id),
          name: t.name,
          type: t.type,
          listenPort: t.listen_port,
          targetAddress: t.target_address,
          targetPort: t.target_port,
        })),
        connectionType: created.connection_type || 'direct',
        targetHost: created.target_host || undefined,
        targetUsername: created.target_username || undefined,
        targetPort: created.target_port || undefined,
        proxy: created.proxy,
        terminal: created.terminal_config
          ? (typeof created.terminal_config === 'string' ? JSON.parse(created.terminal_config) : created.terminal_config)
          : host.terminal,
      };
    } catch (error: any) {
      const serverMessage = error?.message || 'Server error';
      const code = error?.code;
      const err = new Error(`Create host failed${code ? ` (code ${code})` : ''}: ${serverMessage}`);
      (err as any).raw = error;
      throw err;
    }
  }

  async updateHost(id: string, host: any) {
    // Convert frontend data to backend format
    const payload = {
      id: parseInt(id),
      name: host.name,
      hostname: host.hostname,
      port: host.port || 22,
      username: host.username,
      password: host.authType === 'password' ? host.password : undefined,
      private_key: host.authType === 'ssh_key' ? host.sshKey : undefined,
      group_id: host.groupId ? parseInt(host.groupId) : undefined,
      tags: host.tags && host.tags.length > 0 ? JSON.stringify(host.tags) : undefined,
      description: host.notes,
      terminal_config: host.terminal ? JSON.stringify(host.terminal) : undefined,
      proxy_id: host.proxyId ? parseInt(host.proxyId) : undefined,
      connection_type: host.connectionType || 'direct',
      target_host: host.connectionType === 'jump' ? host.targetHost : '',
      target_username: host.connectionType === 'jump' ? host.targetUsername : '',
      target_port: host.connectionType === 'jump' ? (host.targetPort || 22) : 0,
      tunnels: (host.tunnels || []).map((t: any) => ({
        name: t.name,
        type: t.type,
        listen_port: t.listenPort,
        target_address: t.targetAddress,
        target_port: t.targetPort,
      })),
    };
    const updated = await this.rpc('/host/update', payload);

    logger.info(LOG_MODULE.HTTP, 'api.updateHost', 'Host updated successfully', {
      url: '/host/update',
      method: 'POST',
      host_id: id,
    });

    // Return converted data
    return {
      id: String(updated.id),
      name: updated.name,
      hostname: updated.hostname,
      username: updated.username,
      authType: updated.auth_type === 'key' ? 'ssh_key' : 'password',
      password: updated.password,
      sshKey: updated.private_key,
      port: updated.port || 22,
      os: 'linux' as const,
      tags: updated.tags ? (typeof updated.tags === 'string' ? JSON.parse(updated.tags) : updated.tags) : [],
      notes: updated.description,
      groupId: updated.group_id ? String(updated.group_id) : undefined,
      proxyId: updated.proxy_id ? String(updated.proxy_id) : undefined,
      tunnels: (updated.tunnels || []).map((t: any) => ({
        id: String(t.id),
        name: t.name,
        type: t.type,
        listenPort: t.listen_port,
        targetAddress: t.target_address,
        targetPort: t.target_port,
      })),
      connectionType: updated.connection_type || 'direct',
      targetHost: updated.target_host || undefined,
      targetUsername: updated.target_username || undefined,
      targetPort: updated.target_port || undefined,
      proxy: updated.proxy,
      terminal: updated.terminal_config
        ? (typeof updated.terminal_config === 'string' ? JSON.parse(updated.terminal_config) : updated.terminal_config)
        : host.terminal,
    };
  }

  async deleteHost(id: string) {
    return this.rpc('/host/delete', { id: parseInt(id) });
  }

  // SSH connection endpoints
  async connectSSH(hostId: string) {
    return this.rpc('/ssh/connect', { host_id: hostId });
  }

  async executeCommand(sessionId: string, command: string) {
    return this.rpc('/ssh/execute', { session_id: sessionId, command });
  }

  async disconnectSSH(sessionId: string) {
    return this.rpc('/ssh/disconnect', { session_id: sessionId });
  }

  // File transfer endpoints
  async uploadFile(hostId: string, file: File, remotePath: string) {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('remotePath', remotePath);

    const response = await this.api.post(`/files/upload/${hostId}`, formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
    return response.data;
  }

  async downloadFile(hostId: string, remotePath: string) {
    const response = await this.api.get(`/files/download/${hostId}`, {
      params: { path: remotePath },
      responseType: 'blob',
    });
    return response.data;
  }

  async listFiles(hostId: string, path: string) {
    const response = await this.api.get(`/files/list/${hostId}`, {
      params: { path },
    });
    return response.data;
  }

  async getHostCredentials(hostId: string) {
    return this.rpc('/host/get-credentials', { id: parseInt(hostId) });
  }

  // System metrics endpoints
  async getSystemMetrics(hostId: string) {
    const response = await this.api.get(`/metrics/${hostId}`);
    return response.data;
  }

  // AI command generation endpoints
  async generateCommand(prompt: string, context?: any, model?: string) {
    return this.rpc('/ai/generate', {
      prompt,
      context,
      model,
      os_type: 'linux',
      shell: 'bash'
    });
  }

  async explainCommand(command: string, model?: string) {
    return this.rpc('/ai/explain', {
      command,
      model,
      language: 'zh'
    });
  }

  async diagnoseError(error: string, command?: string, context?: any, model?: string) {
    return this.rpc('/ai/diagnose', {
      error,
      command,
      context,
      model
    });
  }

  async getAIModels() {
    return this.rpc('/ai/get-models');
  }

  async getAITools() {
    return this.rpc('/ai/get-tools');
  }

  // User management endpoints
  async getUserProfile() {
    return this.rpc('/user/get-profile');
  }

  async updateUserProfile(data: any) {
    return this.rpc('/user/update-profile', data);
  }

  async rechargeGems(amount: number) {
    return this.rpc('/users/recharge', { amount });
  }

  async upgradeTier(tier: string) {
    return this.rpc('/users/upgrade', { tier });
  }

  // Payment endpoints
  async getAvailablePaymentMethods() {
    return this.rpc('/payment/methods');
  }

  async createPaymentOrder(type: string, amount: number, paymentMethod: string, tierId?: string, machineId?: string, machineName?: string) {
    return this.rpc('/payment/create-order', {
      type,
      amount,
      payment_method: paymentMethod,
      ...(tierId ? { tier_id: tierId } : {}),
      ...(machineId ? { machine_id: machineId, machine_name: machineName || '' } : {}),
    });
  }

  async getPaymentOrder(orderNo: string) {
    return this.rpc('/payment/get-order', { order_no: orderNo });
  }

  async getUserPaymentOrders(page: number = 1, pageSize: number = 20) {
    return this.rpc('/payment/list-orders', { page, page_size: pageSize });
  }

  async cancelPaymentOrder(orderNo: string) {
    return this.rpc('/payment/cancel-order', { order_no: orderNo });
  }

  async mockPay(orderNo: string) {
    return this.rpc('/payment/mock-pay', { order_no: orderNo });
  }

  // ========== Group Management ==========
  async getGroups() {
    const data = await this.rpc<any[]>('/group/list');
    // Convert to frontend format: backend id(number) → frontend id(string)
    return (data || []).map((g: any) => ({
      id: String(g.id),
      name: g.name,
      color: g.color || '#6366f1',
    }));
  }

  async createGroup(group: any) {
    const payload = {
      name: group.name,
      color: group.color || '#6366f1',
      description: group.description || '',
      icon: group.icon || '',
    };
    const g = await this.rpc('/group/create', payload);
    return {
      id: String(g.id),
      name: g.name,
      color: g.color || '#6366f1',
    };
  }

  async updateGroup(id: string, group: any) {
    const payload = {
      id: parseInt(id),
      name: group.name,
      color: group.color || '#6366f1',
      description: group.description || '',
      icon: group.icon || '',
    };
    const g = await this.rpc('/group/update', payload);
    return {
      id: String(g.id),
      name: g.name,
      color: g.color || '#6366f1',
    };
  }

  async deleteGroup(id: string) {
    await this.rpc('/group/delete', { id: parseInt(id) });
  }

  // ========== Proxy Management ==========
  async getProxies() {
    const data = await this.rpc<any[]>('/proxy/list');
    // Convert to frontend format
    return (data || []).map((p: any) => ({
      id: String(p.id),
      name: p.name,
      type: p.type,
      hostname: p.hostname,
      port: p.port,
      username: p.username,
      password: p.password || '',
    }));
  }

  async getProxy(id: string) {
    const p = await this.rpc('/proxy/get', { id: parseInt(id) });
    return {
      id: String(p.id),
      name: p.name,
      type: p.type,
      hostname: p.hostname,
      port: p.port,
      username: p.username,
      password: p.password || '',
    };
  }

  async createProxy(proxy: any) {
    const payload = {
      name: proxy.name,
      type: proxy.type,
      hostname: proxy.hostname,
      port: proxy.port,
      username: proxy.username || '',
      password: proxy.password || '',
    };
    const p = await this.rpc('/proxy/create', payload);
    return {
      id: String(p.id),
      name: p.name,
      type: p.type,
      hostname: p.hostname,
      port: p.port,
      username: p.username,
      password: '',
    };
  }

  async updateProxy(id: string, proxy: any) {
    const payload = {
      id: parseInt(id),
      name: proxy.name,
      type: proxy.type,
      hostname: proxy.hostname,
      port: proxy.port,
      username: proxy.username || '',
      password: proxy.password || '',
    };
    const p = await this.rpc('/proxy/update', payload);
    return {
      id: String(p.id),
      name: p.name,
      type: p.type,
      hostname: p.hostname,
      port: p.port,
      username: p.username,
      password: '',
    };
  }

  async deleteProxy(id: string) {
    await this.rpc('/proxy/delete', { id: parseInt(id) });
  }

  // ========== Feedback ==========
  async submitFeedback(content: string) {
    return this.rpc('/feedback/create', { content });
  }

  // ========== FAQ ==========
  async getFAQs() {
    return this.rpc('/faq/list');
  }

  // ========== Version ==========
  async getLatestVersion() {
    return this.rpc('/version/latest');
  }

  // ========== Commerce ==========
  async getCommerceConfig() {
    return this.rpc('/commerce/config');
  }

  // ========== Ad ==========
  async getAdRules() {
    return this.rpc('/ads/rules');
  }

  async getAdContents(params: { tier: string; language: string; trigger: string }) {
    return this.rpc('/ads/get-contents', params);
  }

  async fetchPlatformAds(platform: string, params: Record<string, any>) {
    return this.rpc('/ads/fetch-platform', { platform, ...params });
  }

  /** Script mode ad fetch: returns HTML snippet + page URL (desktop app prefers pageUrl) */
  async fetchScriptAds(platform: string, params: Record<string, any>): Promise<{ html: string; pageUrl?: string; width?: number; height?: number }> {
    return this.rpc(`/ads/script/${platform}`, params);
  }

  /** Get full ad page URL (for iframe src) */
  getAdPageFullUrl(pageUrl: string): string {
    return this.baseURL.replace(/\/api\/v1$/, '') + pageUrl;
  }

  async reportAdImpression(adId: string, platform: string) {
    await this.rpc('/ads/impression', { ad_id: adId, platform, timestamp: Math.floor(Date.now() / 1000) });
  }

  async reportAdClick(adId: string, platform: string) {
    await this.rpc('/ads/click', { ad_id: adId, platform, timestamp: Math.floor(Date.now() / 1000) });
  }

  // ========== Plugin Store ==========
  async getPluginStoreList(params: { page?: number; page_size?: number; search?: string; category?: string; sort?: string } = {}) {
    return this.rpc<{ items: any[]; total: number; page: number; page_size: number }>('/plugin/store/list', {
      page: params.page || 1,
      page_size: params.page_size || 20,
      ...params,
    });
  }

  async getPluginStoreDetail(pluginId: string) {
    return this.rpc('/plugin/store/detail', { plugin_id: pluginId });
  }

  async installServerPlugin(pluginId: string) {
    return this.rpc('/plugin/install', { plugin_id: pluginId });
  }

  async uninstallServerPlugin(pluginId: string) {
    return this.rpc('/plugin/uninstall', { plugin_id: pluginId });
  }

  async enableServerPlugin(pluginId: string) {
    return this.rpc('/plugin/enable', { plugin_id: pluginId });
  }

  async disableServerPlugin(pluginId: string) {
    return this.rpc('/plugin/disable', { plugin_id: pluginId });
  }

  async starServerPlugin(pluginId: string) {
    return this.rpc<{ starred: boolean }>('/plugin/star', { plugin_id: pluginId });
  }

  async getUserPluginList() {
    return this.rpc<any[]>('/plugin/user/list');
  }

  // ========== License ==========
  async licenseGetFeatures(machineId: string) {
    return this.rpc('/license/features', { machine_id: machineId });
  }

  async licenseActivate(machineId: string, machineName: string) {
    return this.rpc('/license/activate', { machine_id: machineId, machine_name: machineName });
  }

  async licenseActivateKey(licenseKey: string, machineId: string, machineName: string) {
    return this.rpc('/license/activate-key', { license_key: licenseKey, machine_id: machineId, machine_name: machineName });
  }

  async licenseDeactivate(machineId: string) {
    return this.rpc('/license/deactivate', { machine_id: machineId });
  }

  async licenseGetMachines() {
    return this.rpc('/license/machines', {});
  }

  async licenseVerify(machineId: string) {
    return this.rpc('/license/verify', { machine_id: machineId });
  }

}

export { ApiError };
export const apiService = new ApiService();
