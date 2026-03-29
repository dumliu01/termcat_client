/**
 * Command Completion Detector (Clean Solution)
 *
 * Does not append any markers to commands, relies entirely on shell's bracket paste mode signals:
 * - [?2004l] — Command starts executing (paste mode off)
 * - [?2004h] — Command completed, shell returned to prompt (paste mode on)
 *
 * Exit code is no longer precisely obtained, AI judges success/failure from output content.
 * Ctrl+C interruption detected via ^C + [?2004h.
 */

/** Detect if command execution is complete: [?2004h] appears (shell returned to prompt) */
export function isCommandComplete(output: string): boolean {
  return output.includes('[?2004h');
}

/** Exit code: clean solution defaults to 0, caller can override based on scenario (e.g., Ctrl+C → 130) */
export function extractExitCode(_output: string): number {
  return 0;
}

/** Clean shell control sequences from output */
export function cleanOutputMarkers(output: string): string {
  return output
    // bracket paste mode sequences
    .replace(/\x1b\[\?2004[hl]/g, '')
    // Unescaped form (some terminals)
    .replace(/\[\?2004[hl]/g, '')
    // OSC 133 sequences (backward compatibility)
    .replace(/\x1b\]133;[A-Z];?\d*\x07/g, '')
    // Old marker format (backward compatibility)
    .replace(/<<<EXIT_CODE:\d+>>>/g, '')
    .replace(/<<<CMD_END>>>/g, '')
    .trim();
}

/** Build command — clean solution: don't append any markers */
export function buildCommandWithMarkers(command: string, shell?: string): string {
  if (shell === 'powershell' || shell === 'pwsh') {
    // PowerShell doesn't support bracket paste mode, keep old marker solution
    return `${command}; $ec = if($LASTEXITCODE -ne $null){ $LASTEXITCODE } else { if($?){0}else{1} }; echo "<<<EXIT_CODE:$ec>>>"; echo "<<<CMD_END>>>"\r\n`;
  }
  // Unix (bash/zsh): send original command directly, don't append anything
  return `${command}\n`;
}

// ==================== Legacy API Compatibility ====================

/** @deprecated */
export function hasExitCodeMarker(output: string): boolean {
  return false;
}

/** @deprecated */
export function hasCmdEndMarker(output: string): boolean {
  return isCommandComplete(output);
}
