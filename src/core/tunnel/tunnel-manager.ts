import { Client } from 'ssh2';
import * as net from 'net';
import { EventEmitter } from 'events';
import { logger, LOG_MODULE } from '../../base/logger/logger';

export interface TunnelConfig {
  id: string;
  name: string;
  type: 'L' | 'R' | 'D'; // Local, Remote, Dynamic (SOCKS5)
  listenPort: number;
  targetAddress: string;
  targetPort: number;
}

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

interface ActiveTunnel {
  config: TunnelConfig;
  server: net.Server | null;
  status: TunnelStatus;
  connections: Set<net.Socket>;
}

export class TunnelService {
  private tunnels: Map<string, ActiveTunnel> = new Map();
  private eventEmitter = new EventEmitter();

  /**
   * Start local port forwarding (Local Forwarding)
   * Local listen → via SSH → remote target
   */
  async startLocalForward(
    sshClient: Client,
    connectionId: string,
    config: TunnelConfig
  ): Promise<TunnelStatus> {
    const tunnelKey = `${connectionId}:${config.id}`;

    // Check if already exists
    if (this.tunnels.has(tunnelKey)) {
      const existing = this.tunnels.get(tunnelKey)!;
      if (existing.status.status === 'running') {
        return existing.status;
      }
    }

    const status: TunnelStatus = {
      id: config.id,
      name: config.name,
      type: 'L',
      listenPort: config.listenPort,
      targetAddress: config.targetAddress,
      targetPort: config.targetPort,
      status: 'starting',
      connectionCount: 0,
    };

    const activeTunnel: ActiveTunnel = {
      config,
      server: null,
      status,
      connections: new Set(),
    };

    this.tunnels.set(tunnelKey, activeTunnel);

    return new Promise((resolve, reject) => {
      const server = net.createServer((localSocket) => {
        logger.info(LOG_MODULE.SSH, 'tunnel.local.connection', 'New local tunnel connection', {
          tunnel_id: config.id,
          tunnel_name: config.name,
          listen_port: config.listenPort,
          target: `${config.targetAddress}:${config.targetPort}`,
        });

        activeTunnel.connections.add(localSocket);
        activeTunnel.status.connectionCount = activeTunnel.connections.size;
        this.emitStatusUpdate(connectionId, activeTunnel.status);

        // Establish connection to remote target via SSH
        sshClient.forwardOut(
          '127.0.0.1',
          config.listenPort,
          config.targetAddress,
          config.targetPort,
          (err, remoteStream) => {
            if (err) {
              logger.error(LOG_MODULE.SSH, 'tunnel.local.forward_error', 'Forward error', {
                tunnel_id: config.id,
                error: 1,
                msg: err.message,
              });
              localSocket.end();
              return;
            }

            // Bidirectional pipe
            localSocket.pipe(remoteStream);
            remoteStream.pipe(localSocket);

            localSocket.on('error', (err) => {
              logger.debug(LOG_MODULE.SSH, 'tunnel.local.socket_error', 'Local socket error', {
                tunnel_id: config.id,
                msg: err.message,
              });
              remoteStream.end();
            });

            remoteStream.on('error', (err: Error) => {
              logger.debug(LOG_MODULE.SSH, 'tunnel.local.stream_error', 'Remote stream error', {
                tunnel_id: config.id,
                msg: err.message,
              });
              localSocket.end();
            });

            localSocket.on('close', () => {
              activeTunnel.connections.delete(localSocket);
              activeTunnel.status.connectionCount = activeTunnel.connections.size;
              this.emitStatusUpdate(connectionId, activeTunnel.status);
              remoteStream.end();
            });

            remoteStream.on('close', () => {
              localSocket.end();
            });
          }
        );
      });

      server.on('error', (err: NodeJS.ErrnoException) => {
        logger.error(LOG_MODULE.SSH, 'tunnel.local.server_error', 'Local tunnel server error', {
          tunnel_id: config.id,
          listen_port: config.listenPort,
          error: 1,
          msg: err.message,
        });

        activeTunnel.status.status = 'error';
        activeTunnel.status.error = err.code === 'EADDRINUSE'
          ? `Port ${config.listenPort} is already in use`
          : err.message;
        this.emitStatusUpdate(connectionId, activeTunnel.status);
        reject(new Error(activeTunnel.status.error));
      });

      server.listen(config.listenPort, '127.0.0.1', () => {
        logger.info(LOG_MODULE.SSH, 'tunnel.local.started', 'Local tunnel started', {
          tunnel_id: config.id,
          tunnel_name: config.name,
          listen_port: config.listenPort,
          target: `${config.targetAddress}:${config.targetPort}`,
        });

        activeTunnel.server = server;
        activeTunnel.status.status = 'running';
        this.emitStatusUpdate(connectionId, activeTunnel.status);
        resolve(activeTunnel.status);
      });
    });
  }

  /**
   * Start remote port forwarding (Remote Forwarding)
   * Remote server listen → via SSH → local target
   */
  async startRemoteForward(
    sshClient: Client,
    connectionId: string,
    config: TunnelConfig
  ): Promise<TunnelStatus> {
    const tunnelKey = `${connectionId}:${config.id}`;

    if (this.tunnels.has(tunnelKey)) {
      const existing = this.tunnels.get(tunnelKey)!;
      if (existing.status.status === 'running') {
        return existing.status;
      }
    }

    const status: TunnelStatus = {
      id: config.id,
      name: config.name,
      type: 'R',
      listenPort: config.listenPort,
      targetAddress: config.targetAddress,
      targetPort: config.targetPort,
      status: 'starting',
      connectionCount: 0,
    };

    const activeTunnel: ActiveTunnel = {
      config,
      server: null,
      status,
      connections: new Set(),
    };

    this.tunnels.set(tunnelKey, activeTunnel);

    return new Promise((resolve, reject) => {
      // Request remote server to listen on port
      sshClient.forwardIn('0.0.0.0', config.listenPort, (err) => {
        if (err) {
          logger.error(LOG_MODULE.SSH, 'tunnel.remote.forward_error', 'Remote forward error', {
            tunnel_id: config.id,
            listen_port: config.listenPort,
            error: 1,
            msg: err.message,
          });

          activeTunnel.status.status = 'error';
          activeTunnel.status.error = err.message;
          this.emitStatusUpdate(connectionId, activeTunnel.status);
          reject(new Error(err.message));
          return;
        }

        logger.info(LOG_MODULE.SSH, 'tunnel.remote.started', 'Remote tunnel started', {
          tunnel_id: config.id,
          tunnel_name: config.name,
          remote_listen_port: config.listenPort,
          local_target: `${config.targetAddress}:${config.targetPort}`,
        });

        activeTunnel.status.status = 'running';
        this.emitStatusUpdate(connectionId, activeTunnel.status);
        resolve(activeTunnel.status);
      });

      // Listen for connections on remote port
      sshClient.on('tcp connection', (info, accept, _reject) => {
        if (info.destPort !== config.listenPort) {
          return;
        }

        logger.info(LOG_MODULE.SSH, 'tunnel.remote.connection', 'Remote tunnel connection', {
          tunnel_id: config.id,
          source: `${info.srcIP}:${info.srcPort}`,
          dest_port: info.destPort,
        });

        const remoteStream = accept();
        activeTunnel.status.connectionCount++;
        this.emitStatusUpdate(connectionId, activeTunnel.status);

        // Connect to local target
        const localSocket = net.createConnection(
          config.targetPort,
          config.targetAddress,
          () => {
            // Bidirectional pipe
            remoteStream.pipe(localSocket);
            localSocket.pipe(remoteStream);
          }
        );

        localSocket.on('error', (err) => {
          logger.debug(LOG_MODULE.SSH, 'tunnel.remote.local_error', 'Local connection error', {
            tunnel_id: config.id,
            msg: err.message,
          });
          remoteStream.end();
        });

        remoteStream.on('error', (err: Error) => {
          logger.debug(LOG_MODULE.SSH, 'tunnel.remote.stream_error', 'Remote stream error', {
            tunnel_id: config.id,
            msg: err.message,
          });
          localSocket.end();
        });

        localSocket.on('close', () => {
          activeTunnel.status.connectionCount = Math.max(0, activeTunnel.status.connectionCount - 1);
          this.emitStatusUpdate(connectionId, activeTunnel.status);
          remoteStream.end();
        });

        remoteStream.on('close', () => {
          localSocket.end();
        });
      });
    });
  }

  /**
   * Start dynamic port forwarding (SOCKS5 proxy)
   */
  async startDynamicForward(
    sshClient: Client,
    connectionId: string,
    config: TunnelConfig
  ): Promise<TunnelStatus> {
    const tunnelKey = `${connectionId}:${config.id}`;

    if (this.tunnels.has(tunnelKey)) {
      const existing = this.tunnels.get(tunnelKey)!;
      if (existing.status.status === 'running') {
        return existing.status;
      }
    }

    const status: TunnelStatus = {
      id: config.id,
      name: config.name,
      type: 'D',
      listenPort: config.listenPort,
      targetAddress: '',
      targetPort: 0,
      status: 'starting',
      connectionCount: 0,
    };

    const activeTunnel: ActiveTunnel = {
      config,
      server: null,
      status,
      connections: new Set(),
    };

    this.tunnels.set(tunnelKey, activeTunnel);

    return new Promise((resolve, reject) => {
      const server = net.createServer((clientSocket) => {
        activeTunnel.connections.add(clientSocket);
        activeTunnel.status.connectionCount = activeTunnel.connections.size;
        this.emitStatusUpdate(connectionId, activeTunnel.status);

        this.handleSocks5Connection(sshClient, clientSocket, config.id, () => {
          activeTunnel.connections.delete(clientSocket);
          activeTunnel.status.connectionCount = activeTunnel.connections.size;
          this.emitStatusUpdate(connectionId, activeTunnel.status);
        });
      });

      server.on('error', (err: NodeJS.ErrnoException) => {
        logger.error(LOG_MODULE.SSH, 'tunnel.dynamic.server_error', 'SOCKS5 server error', {
          tunnel_id: config.id,
          listen_port: config.listenPort,
          error: 1,
          msg: err.message,
        });

        activeTunnel.status.status = 'error';
        activeTunnel.status.error = err.code === 'EADDRINUSE'
          ? `Port ${config.listenPort} is already in use`
          : err.message;
        this.emitStatusUpdate(connectionId, activeTunnel.status);
        reject(new Error(activeTunnel.status.error));
      });

      server.listen(config.listenPort, '127.0.0.1', () => {
        logger.info(LOG_MODULE.SSH, 'tunnel.dynamic.started', 'SOCKS5 proxy started', {
          tunnel_id: config.id,
          tunnel_name: config.name,
          listen_port: config.listenPort,
        });

        activeTunnel.server = server;
        activeTunnel.status.status = 'running';
        this.emitStatusUpdate(connectionId, activeTunnel.status);
        resolve(activeTunnel.status);
      });
    });
  }

  /**
   * Handle SOCKS5 connection
   */
  private handleSocks5Connection(
    sshClient: Client,
    clientSocket: net.Socket,
    tunnelId: string,
    onClose: () => void
  ): void {
    let state: 'greeting' | 'request' | 'connected' = 'greeting';

    clientSocket.once('data', (data) => {
      if (state !== 'greeting') return;

      // SOCKS5 handshake: version check
      if (data[0] !== 0x05) {
        logger.warn(LOG_MODULE.SSH, 'tunnel.socks5.invalid_version', 'Invalid SOCKS version', {
          tunnel_id: tunnelId,
          version: data[0],
        });
        clientSocket.end();
        onClose();
        return;
      }

      // Response: no authentication required
      clientSocket.write(Buffer.from([0x05, 0x00]));
      state = 'request';

      clientSocket.once('data', (requestData) => {
        if (state !== 'request') return;

        // Parse SOCKS5 request
        const cmd = requestData[1];
        const addrType = requestData[3];

        if (cmd !== 0x01) {
          // Only support CONNECT command
          logger.warn(LOG_MODULE.SSH, 'tunnel.socks5.unsupported_cmd', 'Unsupported SOCKS command', {
            tunnel_id: tunnelId,
            cmd,
          });
          clientSocket.write(Buffer.from([0x05, 0x07, 0x00, 0x01, 0, 0, 0, 0, 0, 0]));
          clientSocket.end();
          onClose();
          return;
        }

        let targetHost: string;
        let targetPort: number;
        let offset: number;

        try {
          if (addrType === 0x01) {
            // IPv4
            targetHost = `${requestData[4]}.${requestData[5]}.${requestData[6]}.${requestData[7]}`;
            offset = 8;
          } else if (addrType === 0x03) {
            // Domain name
            const domainLen = requestData[4];
            targetHost = requestData.slice(5, 5 + domainLen).toString();
            offset = 5 + domainLen;
          } else if (addrType === 0x04) {
            // IPv6
            const ipv6Parts = [];
            for (let i = 0; i < 8; i++) {
              ipv6Parts.push(requestData.readUInt16BE(4 + i * 2).toString(16));
            }
            targetHost = ipv6Parts.join(':');
            offset = 20;
          } else {
            throw new Error(`Unsupported address type: ${addrType}`);
          }

          targetPort = requestData.readUInt16BE(offset);
        } catch (err) {
          logger.error(LOG_MODULE.SSH, 'tunnel.socks5.parse_error', 'Failed to parse SOCKS request', {
            tunnel_id: tunnelId,
            error: 1,
            msg: (err as Error).message,
          });
          clientSocket.write(Buffer.from([0x05, 0x01, 0x00, 0x01, 0, 0, 0, 0, 0, 0]));
          clientSocket.end();
          onClose();
          return;
        }

        logger.debug(LOG_MODULE.SSH, 'tunnel.socks5.connect', 'SOCKS5 connect request', {
          tunnel_id: tunnelId,
          target: `${targetHost}:${targetPort}`,
        });

        // Forward connection via SSH
        sshClient.forwardOut(
          '127.0.0.1',
          0,
          targetHost,
          targetPort,
          (err, remoteStream) => {
            if (err) {
              logger.error(LOG_MODULE.SSH, 'tunnel.socks5.forward_error', 'SOCKS5 forward error', {
                tunnel_id: tunnelId,
                target: `${targetHost}:${targetPort}`,
                error: 1,
                msg: err.message,
              });
              // Return connection failure
              clientSocket.write(Buffer.from([0x05, 0x05, 0x00, 0x01, 0, 0, 0, 0, 0, 0]));
              clientSocket.end();
              onClose();
              return;
            }

            // Return success
            clientSocket.write(Buffer.from([0x05, 0x00, 0x00, 0x01, 0, 0, 0, 0, 0, 0]));
            state = 'connected';

            // Bidirectional pipe
            clientSocket.pipe(remoteStream);
            remoteStream.pipe(clientSocket);

            clientSocket.on('error', () => {
              remoteStream.end();
            });

            remoteStream.on('error', () => {
              clientSocket.end();
            });

            clientSocket.on('close', () => {
              remoteStream.end();
              onClose();
            });

            remoteStream.on('close', () => {
              clientSocket.end();
            });
          }
        );
      });
    });

    clientSocket.on('error', (err) => {
      logger.debug(LOG_MODULE.SSH, 'tunnel.socks5.client_error', 'SOCKS5 client error', {
        tunnel_id: tunnelId,
        msg: err.message,
      });
      onClose();
    });
  }

  /**
   * Stop single tunnel
   */
  async stopTunnel(
    sshClient: Client,
    connectionId: string,
    tunnelId: string
  ): Promise<void> {
    const tunnelKey = `${connectionId}:${tunnelId}`;
    const activeTunnel = this.tunnels.get(tunnelKey);

    if (!activeTunnel) {
      return;
    }

    logger.info(LOG_MODULE.SSH, 'tunnel.stopping', 'Stopping tunnel', {
      tunnel_id: tunnelId,
      tunnel_name: activeTunnel.config.name,
      type: activeTunnel.config.type,
    });

    // Close all connections
    for (const socket of activeTunnel.connections) {
      socket.destroy();
    }
    activeTunnel.connections.clear();

    // Close server (local and dynamic forwarding)
    if (activeTunnel.server) {
      activeTunnel.server.close();
    }

    // Cancel remote forwarding
    if (activeTunnel.config.type === 'R') {
      await new Promise<void>((resolve) => {
        sshClient.unforwardIn('0.0.0.0', activeTunnel.config.listenPort, (err) => {
          if (err) {
            logger.warn(LOG_MODULE.SSH, 'tunnel.remote.unforward_error', 'Unforward error', {
              tunnel_id: tunnelId,
              msg: err.message,
            });
          }
          resolve();
        });
      });
    }

    activeTunnel.status.status = 'stopped';
    activeTunnel.status.connectionCount = 0;
    this.emitStatusUpdate(connectionId, activeTunnel.status);
    this.tunnels.delete(tunnelKey);

    logger.info(LOG_MODULE.SSH, 'tunnel.stopped', 'Tunnel stopped', {
      tunnel_id: tunnelId,
      tunnel_name: activeTunnel.config.name,
    });
  }

  /**
   * Stop all tunnels for a connection
   */
  async stopAllTunnels(sshClient: Client, connectionId: string): Promise<void> {
    const tunnelsToStop: string[] = [];

    for (const [key, tunnel] of this.tunnels) {
      if (key.startsWith(`${connectionId}:`)) {
        tunnelsToStop.push(tunnel.config.id);
      }
    }

    for (const tunnelId of tunnelsToStop) {
      await this.stopTunnel(sshClient, connectionId, tunnelId);
    }
  }

  /**
   * Get all tunnel statuses for a connection
   */
  getTunnelStatuses(connectionId: string): TunnelStatus[] {
    const statuses: TunnelStatus[] = [];

    for (const [key, tunnel] of this.tunnels) {
      if (key.startsWith(`${connectionId}:`)) {
        statuses.push({ ...tunnel.status });
      }
    }

    return statuses;
  }

  /**
   * Emit status update event
   */
  private emitStatusUpdate(connectionId: string, status: TunnelStatus): void {
    this.eventEmitter.emit('status-update', connectionId, status);
  }

  /**
   * Listen for status updates
   */
  onStatusUpdate(
    callback: (connectionId: string, status: TunnelStatus) => void
  ): () => void {
    this.eventEmitter.on('status-update', callback);
    return () => this.eventEmitter.off('status-update', callback);
  }
}

// Export singleton
export const tunnelService = new TunnelService();
