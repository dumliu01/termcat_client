/**
 * 终端后端工厂
 *
 * 根据 Session 的 connectionType 创建对应的 Backend 实例。
 */

import { ITerminalBackend } from './ITerminalBackend';
import { SSHTerminalBackend } from './SSHTerminalBackend';
import { LocalTerminalBackend } from './LocalTerminalBackend';
import { Session } from '@/utils/types';

export class TerminalBackendFactory {
  static create(session: Session, connectionId?: string): ITerminalBackend {
    if (session.host?.connectionType === 'local') {
      return new LocalTerminalBackend({
        shell: session.host.localConfig?.shell,
        cwd: session.host.localConfig?.cwd || session.initialDirectory,
        env: session.host.localConfig?.env,
      });
    }

    if (!connectionId) {
      throw new Error('connectionId is required for SSH terminal backend');
    }
    return new SSHTerminalBackend(
      connectionId,
      session.host?.terminal?.encoding,
    );
  }
}
