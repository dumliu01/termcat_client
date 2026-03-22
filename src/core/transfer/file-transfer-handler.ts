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
   * 生成唯一的传输ID
   */
  private generateTransferId(): string {
    return `transfer-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * 计算传输速度（字节/秒）
   */
  private calculateSpeed(transferred: number, startTime: number): number {
    const elapsedSeconds = (Date.now() - startTime) / 1000;
    return elapsedSeconds > 0 ? Math.round(transferred / elapsedSeconds) : 0;
  }

  /**
   * 格式化文件大小
   */
  private formatSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  }

  /**
   * 递归创建远程目录
   */
  private async mkdirRecursive(sftp: SFTPWrapper, remotePath: string): Promise<void> {
    return new Promise((resolve, reject) => {
      sftp.mkdir(remotePath, (err) => {
      if (err) {
          // 如果目录已存在，忽略错误
          if ((err as any).code === 4) { // SSH_FX_FAILURE - 通常表示目录已存在
            resolve();
          } else {
            // 尝试创建父目录
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
      // 检查目录是否存在
      await new Promise<void>((resolve, reject) => {
        sftp.stat(remoteDir, (err, stats) => {
          if (err) {
            if ((err as any).code === 2) { // SSH_FX_NO_SUCH_FILE - 目录不存在
              // 创建目录
              this.mkdirRecursive(sftp, remoteDir).then(resolve).catch(reject);
            } else {
              reject(err);
            }
          } else {
            // 目录存在，检查是否真的是目录
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
   * 递归创建本地目录
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
   * 上传单个文件
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

      // 获取SFTP客户端
      const sftp = await sshService.getSFTPClient(connectionId);

      // 确保远程目录存在
      const remoteDir = path.dirname(remotePath);
      await this.ensureRemoteDirectoryExists(sftp, remoteDir);

      // 获取文件大小
      const fileStats = fs.statSync(localPath);
      const fileSize = fileStats.size;

      // 发送 transfer-start 事件，让 UI 立即显示传输任务
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

      // 创建传输任务
      this.activeTransfers.set(transferId, {
        id: transferId,
        type: 'upload',
        localPath,
        remotePath,
        startTime,
        transferred: 0,
        total: fileSize
      });

      // 创建读写流
      const readStream = fs.createReadStream(localPath);
      const writeStream = sftp.createWriteStream(remotePath);

      let transferred = 0;
      let lastProgressTime = Date.now();

      // 监听数据传输
      readStream.on('data', (chunk: any) => {
        const delta = (chunk && chunk.length) ? chunk.length : 0;
        transferred += delta;

        // 如果存在父传输（目录），累加父传输已传输字节
        if (parentTransferId && this.activeTransfers.has(parentTransferId)) {
          const parentTask = this.activeTransfers.get(parentTransferId)!;
          parentTask.transferred = (parentTask.transferred || 0) + delta;
          // 发送父传输进度
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

        // 每100ms发送一次子任务进度更新（避免过于频繁）
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

            // 发送最终进度（100%）
            webContents.send('transfer-progress', {
              transferId,
              progress: 100,
              speed: this.calculateSpeed(fileSize, startTime),
              startTime,
              transferred: fileSize,
              total: fileSize
            } as TransferProgress);

            // 发送完成通知
            webContents.send('transfer-complete', {
              transferId,
              success: true,
              // final stats for UI
              transferred: fileSize,
              total: fileSize,
              speed: this.calculateSpeed(fileSize, startTime),
              startTime
            } as any);

            // 如果有父传输，确保父传输已累加完成并发送更新
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

      // 提供更友好的错误信息
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
   * 下载单个文件
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

      // 获取SFTP客户端
      const sftp = await sshService.getSFTPClient(connectionId);

      // 获取远程文件大小
      const stats = await new Promise<any>((resolve, reject) => {
        sftp.stat(remotePath, (err, stats) => {
          if (err) reject(err);
          else resolve(stats);
        });
      });

      const fileSize = stats.size;

      // 发送 transfer-start 事件，让 UI 立即显示传输任务
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

      // 创建传输任务
      this.activeTransfers.set(transferId, {
        id: transferId,
        type: 'download',
        localPath,
        remotePath,
        startTime,
        transferred: 0,
        total: fileSize
      });

      // 确保本地目录存在
      const localDir = path.dirname(localPath);
      this.mkdirLocalRecursive(localDir);

      // 创建读写流
      const readStream = sftp.createReadStream(remotePath);
      const writeStream = fs.createWriteStream(localPath);

      let transferred = 0;
      let lastProgressTime = Date.now();

      // 监听数据传输
      readStream.on('data', (chunk: Buffer) => {
        transferred += chunk.length;

        // 每100ms发送一次进度更新
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

            // 发送最终进度（100%）
            webContents.send('transfer-progress', {
              transferId,
              progress: 100,
              speed: this.calculateSpeed(fileSize, startTime),
              startTime,
              transferred: fileSize,
              total: fileSize
            } as TransferProgress);

            // 发送完成通知
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
   * 递归上传目录
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

      // 计算目录总大小
      const totalSize = this.calculateDirectorySize(localPath);

      // 如果没有现有传输记录，创建传输任务
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

      // 创建远程目录
      await this.mkdirRecursive(sftp, remotePath);

      // 递归遍历本地目录并上传
      await this.uploadDirectoryRecursive(connectionId, localPath, remotePath, webContents, transferId, startTime, totalSize);

      logger.info(LOG_MODULE.FILE, 'file.transfer.upload_dir.completed', 'Directory upload completed', {
        module: LOG_MODULE.FILE,
        transfer_id: transferId,
      });

      // 发送完成通知（包含最终速度/大小以便前端显示）
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

      // 发送错误通知
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

      // 提供更友好的错误信息
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
   * 启动目录上传并立即返回 transferId（后台执行）
   */
  startUploadDirectory(connectionId: string, localPath: string, remotePath: string, webContents: any): string {
    const transferId = this.generateTransferId();

    // 放入 activeTransfers，total 会稍后在 uploadDirectory 中更新
    this.activeTransfers.set(transferId, {
      id: transferId,
      type: 'upload',
      localPath,
      remotePath,
      startTime: Date.now(),
      transferred: 0,
      total: 0
    });

    // 发送 transfer-start 事件，让 UI 立即显示传输任务（目录上传）
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

    // 后台执行目录上传（不阻塞调用者）
    this.uploadDirectory(connectionId, localPath, remotePath, webContents, transferId)
      .then(() => {
        // 已由 uploadDirectory 发送完成事件
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
        // 创建远程子目录
        await this.mkdirRecursive(sftp, remoteFilePath);
        // 递归上传子目录
        await this.uploadDirectoryRecursive(connectionId, localFilePath, remoteFilePath, webContents, transferId, startTime, totalSize);
      } else {
        // 上传文件
        await this.uploadFile(connectionId, localFilePath, remoteFilePath, webContents, transferId);
      }
    }
  }

  /**
   * 递归下载目录
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

      // 创建本地目录
      this.mkdirLocalRecursive(localPath);

      // 递归遍历远程目录
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
          // 递归下载子目录
          await this.downloadDirectory(connectionId, remoteFilePath, localFilePath, webContents);
        } else {
          // 下载文件
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
