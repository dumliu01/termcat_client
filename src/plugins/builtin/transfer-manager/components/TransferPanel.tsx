import React from 'react';
import { TransferItem } from '@/utils/types';
import { Upload, Download, Trash2, CheckCircle2, AlertCircle, Clock, Pause } from 'lucide-react';
import { useT } from '../i18n';

interface TransferPanelProps {
  transfers: TransferItem[];
  theme: string;
  onClearTransfers: () => void;
}

export const TransferPanel: React.FC<TransferPanelProps> = ({
  transfers,
  theme,
  onClearTransfers,
}) => {
  const t = useT();

  const subHeaderBg = theme === 'dark' ? 'rgba(255, 255, 255, 0.04)' : 'rgba(0, 0, 0, 0.02)';

  const formatSpeed = (bytesPerSecond: number): string => {
    if (bytesPerSecond < 1024) return `${bytesPerSecond} B/s`;
    if (bytesPerSecond < 1024 * 1024) return `${(bytesPerSecond / 1024).toFixed(2)} KB/s`;
    return `${(bytesPerSecond / (1024 * 1024)).toFixed(2)} MB/s`;
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return <CheckCircle2 className="w-4 h-4 text-emerald-500" />;
      case 'failed':
        return <AlertCircle className="w-4 h-4 text-rose-500" />;
      case 'paused':
        return <Pause className="w-4 h-4 text-amber-500" />;
      default:
        return <Clock className="w-4 h-4 text-indigo-500 animate-spin" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'running': return 'text-indigo-500';
      case 'completed': return 'text-emerald-500';
      case 'failed': return 'text-rose-500';
      case 'paused': return 'text-amber-500';
      default: return 'text-slate-500';
    }
  };

  // 计算实时上传/下载速度汇总
  const metrics = transfers.reduce(
    (acc, item) => {
      if (item.status !== 'running') return acc;
      const speedMatch = item.speed?.match(/([\d.]+)\s*(B|KB|MB)\/s/);
      if (!speedMatch) return acc;
      let bps = parseFloat(speedMatch[1]);
      if (speedMatch[2] === 'KB') bps *= 1024;
      else if (speedMatch[2] === 'MB') bps *= 1024 * 1024;
      if (item.type === 'upload') acc.upSpeed += bps;
      else acc.downSpeed += bps;
      return acc;
    },
    { upSpeed: 0, downSpeed: 0 }
  );

  return (
    <div className="flex flex-col h-full animate-in fade-in duration-200">
      <div className="px-4 py-2 border-b flex items-center justify-between" style={{ backgroundColor: subHeaderBg, borderColor: 'var(--border-color)' }}>
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2">
            <Upload className="w-3.5 h-3.5 text-indigo-500" />
            <span className="text-[10px] font-bold" style={{ color: 'var(--text-dim)' }}>
              {t.up}: {formatSpeed(metrics.upSpeed)}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Download className="w-3.5 h-3.5 text-emerald-500" />
            <span className="text-[10px] font-bold" style={{ color: 'var(--text-dim)' }}>
              {t.down}: {formatSpeed(metrics.downSpeed)}
            </span>
          </div>
        </div>
        {transfers.length > 0 && (
          <button
            onClick={onClearTransfers}
            className="p-1 hover:text-rose-500 transition rounded"
            title={t.clearAll}
          >
            <Trash2 className="w-3.5 h-3.5" style={{ color: 'var(--text-dim)' }} />
          </button>
        )}
      </div>

      <div className="flex-1 overflow-auto" style={{ borderColor: 'var(--border-color)' }}>
        {transfers.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full opacity-30">
            <Upload className="w-12 h-12 mb-4 text-slate-400" />
            <p className="text-sm font-medium" style={{ color: 'var(--text-dim)' }}>
              {t.noTransfers}
            </p>
          </div>
        ) : (
          transfers.map((item) => (
            <div
              key={item.id}
              className="p-4 hover:bg-primary/5 transition group border-b"
              style={{ borderColor: 'var(--border-color)' }}
            >
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <div className={`p-2 rounded-lg ${item.type === 'download' ? 'bg-emerald-500/10 text-emerald-500' : 'bg-indigo-500/10 text-indigo-500'}`}>
                    {item.type === 'download' ? <Download className="w-4 h-4" /> : <Upload className="w-4 h-4" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-[11px] font-bold truncate" style={{ color: 'var(--text-main)' }}>
                      {item.name}
                    </div>
                    <div className="text-[9px] flex items-center gap-2" style={{ color: 'var(--text-dim)' }}>
                      <span>{item.size}</span>
                      <span>•</span>
                      <span className="font-mono">{item.speed}</span>
                    </div>
                    <div className="text-[8px] truncate mt-1 opacity-60" style={{ color: 'var(--text-dim)' }}>
                      {item.type === 'upload' ? `${item.localPath} → ${item.remotePath}` : `${item.remotePath} → ${item.localPath}`}
                    </div>
                  </div>
                </div>
                <div className={`px-2 py-0.5 rounded-full text-[9px] font-bold uppercase flex items-center gap-1 ${getStatusColor(item.status)}`}>
                  {getStatusIcon(item.status)}
                  {t[item.status as keyof typeof t] || item.status}
                </div>
              </div>
              {item.status === 'running' && (
                <div className="h-1 bg-black/5 rounded-full overflow-hidden mt-2">
                  <div
                    className="h-full bg-primary transition-all duration-300"
                    style={{ width: `${item.progress}%` }}
                  />
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
};
