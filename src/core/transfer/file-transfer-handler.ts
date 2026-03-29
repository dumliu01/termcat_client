import * as fs from 'fs';
import * as path from 'path';
import { SFTPWrapper } from 'ssh2';
import { sshService } from '../ssh/ssh-manager';
import { logger, LOG_MODULE } from '../../base/logger/logger';

export interface TransferProgress {
  transferId: string;
  progress: number;
  speed: number;
  transferred: number;
  total: number;
}

export interface TransferComplete {
  transferId: string;
  success: boolean;
  error?: string;
}

export interface TransferError {
  transferId: string;
  error: string;
}

interface TransferTask {
  id: string;
  type: 'upload' | 'download';
  localPath: string;
  remotePath: string;
  startTime: number;
  transferred: number;
  total: number;
}

export class FileTransferService {
  private activeTransfers: Map<string, TransferTask> = new Map();

  /**
   * Generate unique transfer ID
   */
  private generateTransferId(): string {
    return `transfer-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Calculate transfer speed (bytes/second)
   */
  private calculateSpeed(transferred: number, startTime: number): number {
    const elapsedSeconds = (Date.now() - startTime) / 1000;
    return elapsedSeconds > 0 ? Math.round(transferred / elapsedSeconds) : 0;
  }

  /**
   * Format file size
   */
  private formatSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  }

  /**
   * Recursively create remote directory
   */
  private async mkdirRecursive(sftp: SFTPWrapper, remotePath: string): Promise<void> {
    return new Promise((resolve, reject) => {
      sftp.mkdir(remotePath, (err) => {
      if (err) {
          // If directory already exists, ignore error
          if ((err as any).code === 4) { // SSH_FX_FAILURE - usually means directory already exists
            resolve();
          } else {
            // Try creating parent directory
            const parentDir = path.dirname(remotePath);
            if (parentDir !== '/' && parentDir !== '.') {
              this.mkdirRecursive(sftp, parentDir)
                .then(() => {
                  sftp.mkdir(remotePath, (mkdirErr) => {
                    if (mkdirErr && (mkdirErr as any).code !== 4) {
                      reject(mkdirErr);
                    } else {
                      resolve();
                    }
                  });
                })
                .catch(reject);
            } else {
              reject(err);
            }
          }
        } else {
          resolve();
        }
      });
    });
  }

  private async ensureRemoteDirectoryExists(sftp: SFTPWrapper, remoteDir: string): Promise<void> {
    try {
      // Check if directory exists
      await new Promise<void>((resolve, reject) => {
        sftp.stat(remoteDir, (err, stats) => {
          if (err) {
            if ((err as any).code === 2) { // SSH_FX_NO_SUCH_FILE - directory doesn't exist
              // Create directory
              this.mkdirRecursive(sftp, remoteDir).then(resolve).catch(reject);
            } else {
              reject(err);
            }
          } else {
            // Directory exists, check if it's actually a directory
            if (stats.isDirectory()) {
              resolve();
            } else {
              reject(new Error(`Path exists but is not a directory: ${remoteDir}`));
            }
          }
        });
      });
    } catch (error) {
      logger.error(LOG_MODULE.FILE, 'file.transfer.dir_create_failed', 'Failed to ensure remote directory exists', {
        module: LOG_MODULE.FILE,
        remote_dir: remoteDir,
        error: 2001,
        msg: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  /**
   * Recursively create local directory
   */
  private mkdirLocalRecursive(localPath: string): void {
    if (!fs.existsSync(localPath)) {
      const parentDir = path.dirname(localPath);
      if (parentDir !== localPath) {
        this.mkdirLocalRecursive(parentDir);
      }
      fs.mkdirSync(localPath);
    }
  }

  /**
   * Upload single file
   */
  async uploadFile(
    connectionId: string,
    localPath: string,
    remotePath: string,
    webContents: any,
    parentTransferId?: string
  ): Promise<string> {
    const transferId = this.generateTransferId();
    const startTime = Date.now();

    try {
      logger.info(LOG_MODULE.FILE, 'file.transfer.upload.starting', 'Starting file upload', {
        module: LOG_MODULE.FILE,
        local_path: localPath,
        remote_path: remotePath,
      });

      // Get SFTP client
      const sftp = await sshService.getSFTPClient(connectionId);

      // Ensure remote directory exists
      const remoteDir = path.dirname(remotePath);
      await this.ensureRemoteDirectoryExists(sftp, remoteDir);

      // Get file size
      const fileStats = fs.statSync(localPath);
      const fileSize = fileStats.size;

      // Send transfer-start event to immediately display transfer task in UI
      try {
        webContents.send('transfer-start', {
          transferId,
          name: path.basename(localPath),
          size: fileSize,
          total: fileSize,
          transferred: 0,
          type: 'upload',
          startTime
        });
      } catch (e) {
        // ignore
      }

      // Create transfer task
      this.activeTransfers.set(transferId, {
        id: transferId,
        type: 'upload',
        localPath,
        remotePath,
        startTime,
        transferred: 0,
        total: fileSize
      });

      // Create read/write streams
      const readStream = fs.createReadStream(localPath);
      const writeStream = sftp.createWriteStream(remotePath);

      let transferred = 0;
      let lastProgressTime = Date.now();

      // Monitor data transfer
      readStream.on('data', (chunk: any) => {
        const delta = (chunk && chunk.length) ? chunk.length : 0;
        transferred += delta;

        // If parent transfer exists (directory), accumulate parent's transferred bytes
        if (parentTransferId && this.activeTransfers.has(parentTransferId)) {
          const parentTask = this.activeTransfers.get(parentTransferId)!;
          parentTask.transferred = (parentTask.transferred || 0) + delta;
          // Send parent transfer progress
          const parentProgress = parentTask.total > 0 ? Math.round((parentTask.transferred / parentTask.total) * 100) : 0;
          const parentSpeed = this.calculateSpeed(parentTask.transferred, parentTask.startTime);
          webContents.send('transfer-progress', {
            transferId: parentTransferId,
            progress: parentProgress,
            speed: parentSpeed,
            startTime: parentTask.startTime,
            transferred: parentTask.transferred,
            total: parentTask.total
          } as TransferProgress);
        }

        // Send child task progress update every 100ms (avoid too frequent)
        const now = Date.now();
        if (now - lastProgressTime > 100) {
          const progress = Math.round((transferred / fileSize) * 100);
          const speed = this.calculateSpeed(transferred, startTime);

          webContents.send('transfer-progress', {
            transferId,
            progress,
            speed,
            startTime,
            transferred,
            total: fileSize
          } as TransferProgress);

          lastProgressTime = now;
        }
      });

      return new Promise((resolve, reject) => {
        readStream.pipe(writeStream)
          .on('close', () => {
            logger.info(LOG_MODULE.FILE, 'file.transfer.upload.completed', 'Upload completed', {
              module: LOG_MODULE.FILE,
              transfer_id: transferId,
            });

            // Send final progress (100%)
            webContents.send('transfer-progress', {
              transferId,
              progress: 100,
              speed: this.calculateSpeed(fileSize, startTime),
              startTime,
              transferred: fileSize,
              total: fileSize
            } as TransferProgress);

            // Send completion notification
            webContents.send('transfer-complete', {
              transferId,
              success: true,
              // final stats for UI
              transferred: fileSize,
              total: fileSize,
              speed: this.calculateSpeed(fileSize, startTime),
              startTime
            } as any);

            // If parent transfer exists, ensure parent transfer has accumulated and send update
            if (parentTransferId && this.activeTransfers.has(parentTransferId)) {
              const parentTask = this.activeTransfers.get(parentTransferId)!;
              parentTask.transferred = (parentTask.transferred || 0) + fileSize;
              const parentProgress = parentTask.total > 0 ? Math.round((parentTask.transferred / parentTask.total) * 100) : 0;
              webContents.send('transfer-progress', {
                transferId: parentTransferId,
                progress: parentProgress,
                speed: this.calculateSpeed(parentTask.transferred, parentTask.startTime),
                startTime: parentTask.startTime,
                transferred: parentTask.transferred,
                total: parentTask.total
              } as TransferProgress);
            }

            this.activeTransfers.delete(transferId);
            resolve(transferId);
          })
          .on('error', (err: Error) => {
            logger.error(LOG_MODULE.FILE, 'file.transfer.upload.error', 'Upload error', {
              module: LOG_MODULE.FILE,
              transfer_id: transferId,
              error: 2003,
              msg: err.message,
            });

            webContents.send('transfer-error', {
              transferId,
              error: err.message
            } as TransferError);

            webContents.send('transfer-complete', {
              transferId,
              success: false,
              error: err.message
            } as TransferComplete);

            this.activeTransfers.delete(transferId);
            reject(err);
          });
      });
    } catch (error: any) {
      logger.error(LOG_MODULE.FILE, 'file.transfer.upload.start_failed', 'Failed to start upload', {
        module: LOG_MODULE.FILE,
        error: 2003,
        msg: error.message,
      });

      // Provide more user-friendly error messages
      let errorMessage = error.message;
      if (error.message.includes('Permission denied') || error.message.includes('EACCES')) {
        errorMessage = 'Permission denied - check if you have write access to the target directory';
      } else if (error.message.includes('No such file or directory') || error.message.includes('ENOENT')) {
        errorMessage = 'Target directory does not exist';
      } else if (error.message.includes('ENOTDIR')) {
        errorMessage = 'Target path exists but is not a directory';
      }

      webContents.send('transfer-error', {
        transferId,
        error: errorMessage
      } as TransferError);

      this.activeTransfers.delete(transferId);
      throw new Error(errorMessage);
    }
  }

  /**
   * Download single file
   */
  async downloadFile(
    connectionId: string,
    remotePath: string,
    localPath: string,
    webContents: any
  ): Promise<string> {
    const transferId = this.generateTransferId();
    const startTime = Date.now();

    try {
      logger.info(LOG_MODULE.FILE, 'file.transfer.download.starting', 'Starting file download', {
        module: LOG_MODULE.FILE,
        remote_path: remotePath,
        local_path: localPath,
      });

      // Get SFTP client
      const sftp = await sshService.getSFTPClient(connectionId);

      // Get remote file size
      const stats = await new Promise<any>((resolve, reject) => {
        sftp.stat(remotePath, (err, stats) => {
          if (err) reject(err);
          else resolve(stats);
        });
      });

      const fileSize = stats.size;

      // Send transfer-start event to immediately display transfer task in UI
      try {
        webContents.send('transfer-start', {
          transferId,
          name: path.basename(remotePath),
          size: fileSize,
          total: fileSize,
          transferred: 0,
          type: 'download',
          startTime
        });
      } catch (e) {
        // ignore
      }

      // Create transfer task
      this.activeTransfers.set(transferId, {
        id: transferId,
        type: 'download',
        localPath,
        remotePath,
        startTime,
        transferred: 0,
        total: fileSize
      });

      // Ensure local directory exists
      const localDir = path.dirname(localPath);
      this.mkdirLocalRecursive(localDir);

      // Create read/write streams
      const readStream = sftp.createReadStream(remotePath);
      const writeStream = fs.createWriteStream(localPath);

      let transferred = 0;
      let lastProgressTime = Date.now();

      // Monitor data transfer
      readStream.on('data', (chunk: Buffer) => {
        transferred += chunk.length;

        // Send progress update every 100ms
        const now = Date.now();
        if (now - lastProgressTime > 100) {
          const progress = Math.round((transferred / fileSize) * 100);
          const speed = this.calculateSpeed(transferred, startTime);

          webContents.send('transfer-progress', {
            transferId,
            progress,
              speed,
              startTime,
              transferred,
              total: fileSize
          } as TransferProgress);

          lastProgressTime = now;
        }
      });

      return new Promise((resolve, reject) => {
        readStream.pipe(writeStream)
          .on('close', () => {
            logger.info(LOG_MODULE.FILE, 'file.transfer.download.completed', 'Download completed', {
              module: LOG_MODULE.FILE,
              transfer_id: transferId,
            });

            // Send final progress (100%)
            webContents.send('transfer-progress', {
              transferId,
              progress: 100,
              speed: this.calculateSpeed(fileSize, startTime),
              startTime,
              transferred: fileSize,
              total: fileSize
            } as TransferProgress);

            // Send completion notification
            webContents.send('transfer-complete', {
              transferId,
              success: true,
              transferred: fileSize,
              total: fileSize,
              speed: this.calculateSpeed(fileSize, startTime),
              startTime
            } as any);

            this.activeTransfers.delete(transferId);
            resolve(transferId);
          })
          .on('error', (err: Error) => {
            logger.error(LOG_MODULE.FILE, 'file.transfer.download.error', 'Download error', {
              module: LOG_MODULE.FILE,
              transfer_id: transferId,
              error: 2003,
              msg: err.message,
            });

            webContents.send('transfer-error', {
              transferId,
              error: err.message
            } as TransferError);

            webContents.send('transfer-complete', {
              transferId,
              success: false,
              error: err.message
            } as TransferComplete);

            this.activeTransfers.delete(transferId);
            reject(err);
          });
      });
    } catch (error: any) {
      logger.error(LOG_MODULE.FILE, 'file.transfer.download.start_failed', 'Failed to start download', {
        module: LOG_MODULE.FILE,
        error: 2003,
        msg: error.message,
      });

      webContents.send('transfer-error', {
        transferId,
        error: error.message
      } as TransferError);

      this.activeTransfers.delete(transferId);
      throw error;
    }
  }

  /**
   * Recursively upload directory
   */
  async uploadDirectory(
    connectionId: string,
    localPath: string,
    remotePath: string,
    webContents: any,
    existingTransferId?: string
  ): Promise<string> {
    const transferId = existingTransferId ?? this.generateTransferId();
    const startTime = Date.now();

    try {
      logger.info(LOG_MODULE.FILE, 'file.transfer.upload_dir.starting', 'Starting directory upload', {
        module: LOG_MODULE.FILE,
        local_path: localPath,
        remote_path: remotePath,
      });

      const sftp = await sshService.getSFTPClient(connectionId);

      // Calculate total directory size
      const totalSize = this.calculateDirectorySize(localPath);

      // If no existing transfer record, create transfer task
      if (!this.activeTransfers.has(transferId)) {
        this.activeTransfers.set(transferId, {
          id: transferId,
          type: 'upload',
          localPath,
          remotePath,
          startTime,
          transferred: 0,
          total: totalSize
        });
      }

      // Create remote directory
      await this.mkdirRecursive(sftp, remotePath);

      // Recursively traverse local directory and upload
      await this.uploadDirectoryRecursive(connectionId, localPath, remotePath, webContents, transferId, startTime, totalSize);

      logger.info(LOG_MODULE.FILE, 'file.transfer.upload_dir.completed', 'Directory upload completed', {
        module: LOG_MODULE.FILE,
        transfer_id: transferId,
      });

      // Send completion notification (include final speed/size for frontend display)
      webContents.send('transfer-complete', {
        transferId,
        success: true,
        transferred: totalSize,
        total: totalSize,
        speed: this.calculateSpeed(totalSize, startTime),
        startTime
      } as any);

      this.activeTransfers.delete(transferId);
      return transferId;
    } catch (error: any) {
      logger.error(LOG_MODULE.FILE, 'file.transfer.upload_dir.failed', 'Failed to upload directory', {
        module: LOG_MODULE.FILE,
        error: 2003,
        msg: error.message,
      });

      // Send error notification
      webContents.send('transfer-error', {
        transferId,
        error: error.message
      } as TransferError);

      webContents.send('transfer-complete', {
        transferId,
        success: false,
        error: error.message
      } as TransferComplete);

      this.activeTransfers.delete(transferId);

      // Provide more user-friendly error messages
      let errorMessage = error.message;
      if (error.message.includes('Permission denied') || error.message.includes('EACCES')) {
        errorMessage = 'Permission denied - check if you have write access to the target directory';
      } else if (error.message.includes('No such file or directory') || error.message.includes('ENOENT')) {
        errorMessage = 'Target directory does not exist';
      }

      throw new Error(`Directory upload failed: ${errorMessage}`);
    }
  }

  /**
   * Start directory upload and return transferId immediately (background execution)
   */
  startUploadDirectory(connectionId: string, localPath: string, remotePath: string, webContents: any): string {
    const transferId = this.generateTransferId();

    // Add to activeTransfers, total will be updated later in uploadDirectory
    this.activeTransfers.set(transferId, {
      id: transferId,
      type: 'upload',
      localPath,
      remotePath,
      startTime: Date.now(),
      transferred: 0,
      total: 0
    });

    // Send transfer-start event to immediately display transfer task in UI (directory upload)
    try {
      webContents.send('transfer-start', {
        transferId,
        name: path.basename(localPath),
        size: 0,
        total: 0,
        transferred: 0,
        type: 'upload',
        startTime: Date.now()
      });
    } catch (e) {
      // ignore
    }

    // Execute directory upload in background (don't block caller)
    this.uploadDirectory(connectionId, localPath, remotePath, webContents, transferId)
      .then(() => {
        // Completion event already sent by uploadDirectory
      })
      .catch((err) => {
        logger.error(LOG_MODULE.FILE, 'file.transfer.upload_dir.background_failed', 'Background directory upload failed', {
          module: LOG_MODULE.FILE,
          error: 2003,
          msg: err instanceof Error ? err.message : 'Unknown error',
        });
      });

    return transferId;
  }

  private calculateDirectorySize(dirPath: string): number {
    let totalSize = 0;
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);
      if (entry.isDirectory()) {
        totalSize += this.calculateDirectorySize(fullPath);
      } else {
        totalSize += fs.statSync(fullPath).size;
      }
    }

    return totalSize;
  }

  private async uploadDirectoryRecursive(
    connectionId: string,
    localPath: string,
    remotePath: string,
    webContents: any,
    transferId: string,
    startTime: number,
    totalSize: number
  ): Promise<void> {
    const sftp = await sshService.getSFTPClient(connectionId);
    const entries = fs.readdirSync(localPath, { withFileTypes: true });

    for (const entry of entries) {
      const localFilePath = path.join(localPath, entry.name);
      const remoteFilePath = `${remotePath}/${entry.name}`;

      if (entry.isDirectory()) {
        // Create remote subdirectory
        await this.mkdirRecursive(sftp, remoteFilePath);
        // Recursively upload subdirectory
        await this.uploadDirectoryRecursive(connectionId, localFilePath, remoteFilePath, webContents, transferId, startTime, totalSize);
      } else {
        // Upload file
        await this.uploadFile(connectionId, localFilePath, remoteFilePath, webContents, transferId);
      }
    }
  }

  /**
   * Recursively download directory
   */
  async downloadDirectory(
    connectionId: string,
    remotePath: string,
    localPath: string,
    webContents: any
  ): Promise<string> {
    const transferId = this.generateTransferId();

    try {
      logger.info(LOG_MODULE.FILE, 'file.transfer.download_dir.starting', 'Starting directory download', {
        module: LOG_MODULE.FILE,
        remote_path: remotePath,
        local_path: localPath,
      });

      const sftp = await sshService.getSFTPClient(connectionId);

      // Create local directory
      this.mkdirLocalRecursive(localPath);

      // Recursively traverse remote directory
      const entries = await new Promise<any[]>((resolve, reject) => {
        sftp.readdir(remotePath, (err, list) => {
          if (err) reject(err);
          else resolve(list);
        });
      });

      for (const entry of entries) {
        const remoteFilePath = `${remotePath}/${entry.filename}`;
        const localFilePath = path.join(localPath, entry.filename);

        if (entry.attrs.isDirectory()) {
          // Recursively download subdirectory
          await this.downloadDirectory(connectionId, remoteFilePath, localFilePath, webContents);
        } else {
          // Download file
          await this.downloadFile(connectionId, remoteFilePath, localFilePath, webContents);
        }
      }

      logger.info(LOG_MODULE.FILE, 'file.transfer.download_dir.completed', 'Directory download completed', {
        module: LOG_MODULE.FILE,
        transfer_id: transferId,
      });
      return transferId;
    } catch (error: any) {
      logger.error(LOG_MODULE.FILE, 'file.transfer.download_dir.failed', 'Failed to download directory', {
        module: LOG_MODULE.FILE,
        error: 2003,
        msg: error.message,
      });
      throw error;
    }
  }
}

export const fileTransferService = new FileTransferService();
