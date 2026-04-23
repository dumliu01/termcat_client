import React, { useMemo } from 'react';
import type { TemplateProps, MsgViewerData } from '../types';
import { MsgViewer } from '../../../shared-components/msg-viewer';
import type { MsgViewerActions } from '../../../shared-components/msg-viewer/types';

/**
 * msg-viewer template — forwards `MsgBlock[]` to the shared MsgViewer component.
 *
 * Read-only oriented: most MsgViewerActions are stubbed; only command execution and
 * copy-reply are forwarded through `onEvent` so plugins can observe user intent.
 */
export const MsgViewerTemplate: React.FC<TemplateProps<MsgViewerData>> = ({ data, onEvent }) => {
  const actions = useMemo<MsgViewerActions>(
    () => ({
      onExecuteCommand: (command) => onEvent?.('msg-viewer:execute-command', { command }),
      onCopyReply: (startIndex, endIndex) => onEvent?.('msg-viewer:copy-reply', { startIndex, endIndex }),
    }),
    [onEvent],
  );

  return (
    <div className="flex flex-col flex-1 min-h-0 h-full">
      <MsgViewer
        blocks={data.blocks}
        actions={actions}
        language={data.language ?? 'zh'}
        autoScroll={data.autoScroll}
        isLoading={data.isLoading}
        loadingMessage={data.loadingMessage}
        emptyTitle={data.emptyTitle}
        emptySubtitle={data.emptySubtitle}
        scrollToBlockId={data.scrollToBlockId}
        scrollNonce={data.scrollNonce}
      />
    </div>
  );
};
