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
  // Unix (bash/zsh): append explicit bracket paste mode signal as completion fallback.
  // Shells with bracket paste mode enabled already send [?2004h] on prompt — the
  // executor will match on whichever arrives first. On shells without bracket paste
  // mode (e.g., nested SSH via passthrough), the printf provides the signal.
  //
  // IMPORTANT: Use printf format substitution (%s) so the echo text does NOT contain
  // a literal '[?2004h' string. Otherwise isCommandComplete() matches the echo before
  // the command actually executes, causing premature completion with echo as "output".
  return `${command}; printf '\\033[?%sh' 2004\n`;
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
