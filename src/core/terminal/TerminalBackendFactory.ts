/**
 * Terminal backend factory
 *
 * Creates corresponding Backend instance based on Session's connectionType.
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
