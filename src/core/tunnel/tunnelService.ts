import { Tunnel } from '@/utils/types';
import { logger, LOG_MODULE } from '@/base/logger/logger';

const log = logger.withFields({ module: LOG_MODULE.SSH });

export interface TunnelStatus {
  id: string;
  name: string;
  type: 'L' | 'R' | 'D';
  listenPort: number;
  targetAddress: string;
  targetPort: number;
  status: 'starting' | 'running' | 'stopped' | 'error';
  error?: string;
  connectionCount: number;
}

export interface TunnelConfig {
  id: string;
  name: string;
  type: 'L' | 'R' | 'D';
  listenPort: number;
  targetAddress: string;
  targetPort: number;
}

class TunnelService {
  private statusListeners: Map<string, Set<(status: TunnelStatus) => void>> = new Map();
  private cleanupFn: (() => void) | null = null;

  constructor() {
    this.initializeListeners();
  }

  private initializeListeners(): void {
    if (!window.electron) {
      return;
    }

    this.cleanupFn = window.electron.onTunnelStatusUpdate((connectionId, status) => {
      log.debug('tunnel.status.update', 'Tunnel status update received', {
        connection_id: connectionId,
        tunnel_id: status.id,
        status: status.status,
        connection_count: status.connectionCount,
      });

      const listeners = this.statusListeners.get(connectionId);
      if (listeners) {
        listeners.forEach((callback) => callback(status));
      }
    });
  }

  /**
   * Convert Tunnel from Host config to TunnelConfig
   */
  tunnelToConfig(tunnel: Tunnel): TunnelConfig {
    return {
      id: tunnel.id,
      name: tunnel.name,
      type: tunnel.type,
      listenPort: tunnel.listenPort,
      targetAddress: tunnel.targetAddress,
      targetPort: tunnel.targetPort,
    };
  }

  /**
   * Start tunnel
   */
  async startTunnel(connectionId: string, config: TunnelConfig): Promise<TunnelStatus> {
    if (!window.electron) {
      throw new Error('Not in Electron environment');
    }

    log.info('tunnel.starting', 'Starting tunnel', {
      connection_id: connectionId,
      tunnel_id: config.id,
      tunnel_name: config.name,
      type: config.type,
      listen_port: config.listenPort,
      target: `${config.targetAddress}:${config.targetPort}`,
    });

    try {
      const status = await window.electron.tunnelStart(connectionId, config);
      log.info('tunnel.started', 'Tunnel started successfully', {
        connection_id: connectionId,
        tunnel_id: config.id,
        status: status.status,
      });
      return status;
    } catch (error) {
      log.error('tunnel.start.failed', 'Failed to start tunnel', {
        connection_id: connectionId,
        tunnel_id: config.id,
        error: 1,
        msg: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Start multiple tunnels
   */
  async startTunnels(connectionId: string, tunnels: Tunnel[]): Promise<TunnelStatus[]> {
    const results: TunnelStatus[] = [];

    for (const tunnel of tunnels) {
      try {
        const config = this.tunnelToConfig(tunnel);
        const status = await this.startTunnel(connectionId, config);
        results.push(status);
      } catch (error) {
        log.warn('tunnel.start.partial_failure', 'Failed to start one tunnel', {
          connection_id: connectionId,
          tunnel_id: tunnel.id,
          tunnel_name: tunnel.name,
          msg: error instanceof Error ? error.message : String(error),
        });
        // Continue starting other tunnels
        results.push({
          id: tunnel.id,
          name: tunnel.name,
          type: tunnel.type,
          listenPort: tunnel.listenPort,
          targetAddress: tunnel.targetAddress,
          targetPort: tunnel.targetPort,
          status: 'error',
          error: error instanceof Error ? error.message : String(error),
          connectionCount: 0,
        });
      }
    }

    return results;
  }

  /**
   * Stop tunnel
   */
  async stopTunnel(connectionId: string, tunnelId: string): Promise<void> {
    if (!window.electron) {
      throw new Error('Not in Electron environment');
    }

    log.info('tunnel.stopping', 'Stopping tunnel', {
      connection_id: connectionId,
      tunnel_id: tunnelId,
    });

    try {
      await window.electron.tunnelStop(connectionId, tunnelId);
      log.info('tunnel.stopped', 'Tunnel stopped successfully', {
        connection_id: connectionId,
        tunnel_id: tunnelId,
      });
    } catch (error) {
      log.error('tunnel.stop.failed', 'Failed to stop tunnel', {
        connection_id: connectionId,
        tunnel_id: tunnelId,
        error: 1,
        msg: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Stop all tunnels for a connection
   */
  async stopAllTunnels(connectionId: string): Promise<void> {
    if (!window.electron) {
      throw new Error('Not in Electron environment');
    }

    log.info('tunnel.stopping_all', 'Stopping all tunnels', {
      connection_id: connectionId,
    });

    try {
      await window.electron.tunnelStopAll(connectionId);
      log.info('tunnel.all_stopped', 'All tunnels stopped successfully', {
        connection_id: connectionId,
      });
    } catch (error) {
      log.error('tunnel.stop_all.failed', 'Failed to stop all tunnels', {
        connection_id: connectionId,
        error: 1,
        msg: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Get all tunnel statuses for a connection
   */
  async getTunnelStatuses(connectionId: string): Promise<TunnelStatus[]> {
    if (!window.electron) {
      return [];
    }

    try {
      return await window.electron.tunnelGetStatuses(connectionId);
    } catch (error) {
      log.error('tunnel.get_statuses.failed', 'Failed to get tunnel statuses', {
        connection_id: connectionId,
        error: 1,
        msg: error instanceof Error ? error.message : String(error),
      });
      return [];
    }
  }

  /**
   * Subscribe to tunnel status updates
   */
  subscribeToStatusUpdates(
    connectionId: string,
    callback: (status: TunnelStatus) => void
  ): () => void {
    if (!this.statusListeners.has(connectionId)) {
      this.statusListeners.set(connectionId, new Set());
    }

    this.statusListeners.get(connectionId)!.add(callback);

    return () => {
      const listeners = this.statusListeners.get(connectionId);
      if (listeners) {
        listeners.delete(callback);
        if (listeners.size === 0) {
          this.statusListeners.delete(connectionId);
        }
      }
    };
  }

  /**
   * Cleanup resources
   */
  cleanup(): void {
    if (this.cleanupFn) {
      this.cleanupFn();
      this.cleanupFn = null;
    }
    this.statusListeners.clear();
  }
}

export const tunnelService = new TunnelService();
