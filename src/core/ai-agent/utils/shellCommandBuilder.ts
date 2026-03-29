/**
 * Shell Command Builder
 *
 * Responsible for building various types of shell commands, including:
 * - sudo commands with password
 * - Command detection utilities
 *
 * Extracted from src/components/ai-ops/utils/shellCommandBuilder.ts
 */

/**
 * Build sudo command with password
 *
 * @param command - Original command
 * @param password - sudo password
 * @returns Processed command string
 */
export function buildCommandWithPassword(command: string, password: string): string {
  // Remove existing sudo and its options
  let commandWithoutSudo = command.replace(/\bsudo\s+(?:-[a-zA-Z]+\s+)*/g, '');

  // Handle ~ path issues in sudo environment
  commandWithoutSudo = commandWithoutSudo
    .replace(/~\//g, '$HOME/')
    .replace(/(\s|^)~(\s|$|;|&&|\|\|)/g, '$1$HOME$2');

  // Escape special characters in command and password
  const escapedCommand = commandWithoutSudo.replace(/'/g, "'\\''");
  const escapedPassword = password.replace(/\\/g, '\\\\').replace(/'/g, "'\\''");

  // Use heredoc (<<<) to pass password
  // Inside bash -c, export PAGER/SYSTEMD_PAGER/GIT_PAGER=cat to prevent systemctl/journalctl/git
  // from starting less pager in sudo environment (sudo's env_reset discards variables passed via -E,
  // causing less to enter fullscreen alternate screen mode and hang)
  return `sudo -E -S bash -c 'export PAGER=cat SYSTEMD_PAGER=cat GIT_PAGER=cat; ${escapedCommand}' <<< '${escapedPassword}'`;
}

/**
 * Detect if command contains sudo
 *
 * @param command - Command string
 * @returns Whether command contains sudo
 */
export function isSudoCommand(command: string): boolean {
  return /\bsudo\s+/.test(command);
}

/**
 * Detect if shell command quotes are balanced
 *
 * AI models often make quote mistakes (e.g., echo 'today's value'),
 * causing bash to see unclosed quote and display > continuation prompt, command never completes.
 * Markers appended by buildCommandWithMarkers would also be swallowed into unclosed quotes,
 * causing command marker detection to fail.
 *
 * @param command - Original command (before markers appended)
 * @returns true if quotes are balanced, false if quotes are unclosed
 */
export function hasBalancedQuotes(command: string): boolean {
  let inSingle = false;
  let inDouble = false;

  for (let i = 0; i < command.length; i++) {
    const ch = command[i];

    // Inside single quotes: only ' can close, no escape mechanism
    if (inSingle) {
      if (ch === "'") inSingle = false;
      continue;
    }

    // Inside double quotes: \ can escape " \ $ `
    if (inDouble) {
      if (ch === '\\' && i + 1 < command.length) {
        const next = command[i + 1];
        if (next === '"' || next === '\\' || next === '$' || next === '`') {
          i++;
          continue;
        }
      }
      if (ch === '"') inDouble = false;
      continue;
    }

    // Outside quotes: \ escapes next character (including \')
    if (ch === '\\' && i + 1 < command.length) {
      i++;
      continue;
    }
    if (ch === "'") inSingle = true;
    else if (ch === '"') inDouble = true;
  }

  return !inSingle && !inDouble;
}

/**
 * Convert heredoc commands to single-line printf equivalent.
 *
 * heredoc commands (<<EOF ... EOF) are incompatible with buildCommandWithMarkers and buildCommandWithPassword:
 * - buildCommandWithMarkers appends `; echo "<<<EXIT_CODE:...">` to end of command,
 *   causing EOF terminator to no longer be on its own line, heredoc never closes
 * - buildCommandWithPassword wraps command in `bash -c '...'`,
 *   single quote escaping breaks heredoc internal quote structure
 *
 * Conversion example:
 *   cat > /tmp/file <<'EOF'        →  printf '%s\n' '[server]' 'host=127.0.0.1' > /tmp/file
 *   [server]
 *   host=127.0.0.1
 *   EOF
 *
 * @param command - Original command
 * @returns Converted single-line command, or null (not heredoc)
 */
export function rewriteHeredoc(command: string): string | null {
  // Match: cmd <<[-]?['"]?DELIM['"]?\ncontent\nDELIM
  const match = command.match(/^(.*?)<<-?\s*['"]?(\w+)['"]?\s*\n([\s\S]*?)\n\2\s*$/);
  if (!match) return null;

  const [, cmdPart, , content] = match;

  // Split content into lines, each line as separate printf argument (avoid escape issues)
  const lines = content.split('\n');
  const args = lines.map(line => {
    const escaped = line.replace(/'/g, "'\\''");
    return `'${escaped}'`;
  }).join(' ');

  // printf '%s\n' applies format repeatedly for each argument, outputting line by line
  return `printf '%s\\n' ${args} | ${cmdPart.trim()}`;
}
