/**
 * 命令完成检测器（纯净方案）
 *
 * 不追加任何标记到命令，完全依赖 shell 的 bracket paste mode 信号：
 * - [?2004l] — 命令开始执行（paste mode off）
 * - [?2004h] — 命令完成，shell 回到 prompt（paste mode on）
 *
 * 退出码不再精确获取，AI 从输出内容自行判断成功/失败。
 * Ctrl+C 中断通过 ^C + [?2004h 检测。
 */

/** 检测命令是否执行完成：[?2004h] 出现（shell 回到 prompt） */
export function isCommandComplete(output: string): boolean {
  return output.includes('[?2004h');
}

/** 退出码：纯净方案默认 0，由调用方根据场景覆盖（如 Ctrl+C → 130） */
export function extractExitCode(_output: string): number {
  return 0;
}

/** 清理输出中的 shell 控制序列 */
export function cleanOutputMarkers(output: string): string {
  return output
    // bracket paste mode 序列
    .replace(/\x1b\[\?2004[hl]/g, '')
    // 非转义形式（部分终端）
    .replace(/\[\?2004[hl]/g, '')
    // OSC 133 序列（兼容残留）
    .replace(/\x1b\]133;[A-Z];?\d*\x07/g, '')
    // 旧标记格式（兼容残留）
    .replace(/<<<EXIT_CODE:\d+>>>/g, '')
    .replace(/<<<CMD_END>>>/g, '')
    .trim();
}

/** 构建命令 — 纯净方案：不追加任何标记 */
export function buildCommandWithMarkers(command: string, shell?: string): string {
  if (shell === 'powershell' || shell === 'pwsh') {
    // PowerShell 不支持 bracket paste mode，保留旧标记方案
    return `${command}; $ec = if($LASTEXITCODE -ne $null){ $LASTEXITCODE } else { if($?){0}else{1} }; echo "<<<EXIT_CODE:$ec>>>"; echo "<<<CMD_END>>>"\r\n`;
  }
  // Unix (bash/zsh)：直接发送原始命令，不追加任何内容
  return `${command}\n`;
}

// ==================== 旧 API 兼容 ====================

/** @deprecated */
export function hasExitCodeMarker(output: string): boolean {
  return false;
}

/** @deprecated */
export function hasCmdEndMarker(output: string): boolean {
  return isCommandComplete(output);
}
