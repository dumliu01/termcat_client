/**
 * Host connection factory
 */

import type { IHostConnection } from './IHostConnection';
import { SSHHostConnection } from './SSHHostConnection';
import { LocalHostConnection } from './LocalHostConnection';
import { Host } from '@/utils/types';

export class HostConnectionFactory {
  static create(host: Host): IHostConnection {
    if (host.connectionType === 'local') {
      return new LocalHostConnection(host);
    }
    return new SSHHostConnection(host);
  }
}
