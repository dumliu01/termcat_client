import React, { useState } from 'react';
import { Copy } from 'lucide-react';

export const CopyButton: React.FC<{ text: string; className?: string }> = ({ text, className }) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <button
      onClick={handleCopy}
      className={className || "px-3 bg-white/5 hover:bg-white/10 text-[var(--text-dim)] rounded-xl transition-all"}
      title="Copy to clipboard"
    >
      {copied ? (
        <span className="text-emerald-500 text-[10px] font-bold">Copied!</span>
      ) : (
        <Copy className="w-3.5 h-3.5" />
      )}
    </button>
  );
};
