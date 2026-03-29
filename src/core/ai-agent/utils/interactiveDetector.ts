/**
 * Interactive Prompt Detector
 *
 * Detects interactive prompts in shell output (e.g., y/n confirmation)
 * Design principle: not specific to any command, but detects common interactive patterns
 *
 * Extracted from src/components/ai-ops/utils/interactiveDetector.ts
 */

interface PromptPattern {
  pattern: RegExp;
  name: string;
}

/** Common interactive prompt patterns (ordered by priority, more specific ones first) */
const PROMPT_PATTERNS: PromptPattern[] = [
  // Standard prompts for specific tools
  { pattern: /Proceed\s*\(\[?[yY]\]?\/\[?[nN]\]?\)\??\s*$/im, name: 'conda proceed' },
  { pattern: /Do you want to continue\?\s*\[?[yY]\/[nN]\]?\s*$/im, name: 'apt/yum continue' },
  { pattern: /Do you wish to continue\?\s*\(?[yY]\/\[?[nN]\]?\)?\s*\??\s*$/im, name: 'conda wish to continue' },
  { pattern: /Is this ok\s*\[?[yY]\/[nN]\]?\s*:?\s*$/im, name: 'yum confirm' },

  // Delete/remove confirmation
  { pattern: /Really\s+(delete|remove|uninstall).*\?\s*$/im, name: 'destructive confirm' },
  { pattern: /Remove.*\?\s*\[?[yY]\/[nN]\]?\s*$/im, name: 'remove confirm' },
  { pattern: /Delete.*\?\s*\[?[yY]\/[nN]\]?\s*$/im, name: 'delete confirm' },
  { pattern: /Uninstall.*\?\s*\[?[yY]\/[nN]\]?\s*$/im, name: 'uninstall confirm' },

  // Overwrite/replace confirmation
  { pattern: /Overwrite.*\?\s*\[?[yY]\/[nN]\]?\s*$/im, name: 'overwrite confirm' },
  { pattern: /Replace.*\?\s*\[?[yY]\/[nN]\]?\s*$/im, name: 'replace confirm' },

  // Generic confirmation patterns
  { pattern: /Are you sure.*\?\s*$/im, name: 'confirmation' },
  { pattern: /Continue\?\s*\[?[yY]\/[nN]\]?\s*$/im, name: 'generic continue' },
  { pattern: /\(y\/\[n\]\)\?\s*$/im, name: 'y/[n] choice (parentheses)' },
  { pattern: /\(\[y\]\/n\)\?\s*$/im, name: '[y]/n choice (parentheses)' },
  { pattern: /\[?[yY]es\/[nN]o\]?\s*\??\s*:?\s*$/im, name: 'yes/no question' },
  { pattern: /\[?[yY]\/[nN]\]?\s*\??\s*:?\s*$/m, name: 'y/n choice' },

  // Generic input prompts (read -p, etc.): contains input-related keywords, ends with colon waiting for free text input.
  // AI models sometimes generate read -p commands for users to manually input values, which hangs in automated execution.
  // When detected, VirtualOperator's LLM intelligently responds based on command context instead of waiting for timeout.
  { pattern: /(?:enter|input|type|specify|provide|请输入|输入|请提供|请指定|请选择|选择).*[:：]\s*$/im, name: 'generic input prompt' },

  // Press key to continue
  { pattern: /Press\s+.*\s+to\s+continue/im, name: 'press to continue' },
  { pattern: /Press\s+any\s+key/im, name: 'press any key' },
];

/**
 * Detect if output contains interactive prompts
 *
 * @param output - Shell output
 * @returns Prompt content (with context), or null if no prompt detected
 */
export function detectInteractivePrompt(output: string): string | null {
  const lines = output.split('\n');
  const lastLines = lines.slice(-10).join('\n');

  for (const { pattern, name } of PROMPT_PATTERNS) {
    if (pattern.test(lastLines)) {
      // Search for matching line from back to front
      let matchIndex = -1;
      for (let i = lines.length - 1; i >= Math.max(0, lines.length - 15); i--) {
        const singleLine = lines[i];
        const multiLine = i < lines.length - 1 ? lines[i] + '\n' + lines[i + 1] : lines[i];
        const triLine = i < lines.length - 2 ? lines[i] + '\n' + lines[i + 1] + '\n' + lines[i + 2] : multiLine;

        if (pattern.test(singleLine) || pattern.test(multiLine) || pattern.test(triLine)) {
          matchIndex = i;
          break;
        }
      }

      if (matchIndex >= 0) {
        // Extract prompt line and 3 lines before/after as context
        const contextLines = lines.slice(
          Math.max(0, matchIndex - 3),
          Math.min(lines.length, matchIndex + 4)
        );
        return contextLines.join('\n').trim();
      }
    }
  }

  return null;
}

/**
 * Detect if user directly typed in terminal (rather than interacting via AI ops interface)
 *
 * @param newData - Newly received data
 * @param outputBuffer - Output buffer
 * @returns Whether user input was detected
 */
export function detectUserTerminalInput(newData: string, outputBuffer: string): boolean {
  // 1. Detect Enter/newline (user pressed Enter)
  if (newData.includes('\r') || newData.includes('\n')) {
    const withoutAnsiCodes = newData.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '');
    if (withoutAnsiCodes.trim().length > 2) {
      if (/done|Preparing|Verifying|Executing|Downloading/i.test(newData)) {
        return false;
      }
      return true;
    }
  }

  // 2. Detect y/n input characters (after prompt)
  const lastLines = outputBuffer.split('\n').slice(-3).join('\n');
  if (/\?\s*[yn]\s*$/i.test(lastLines)) {
    const hasFollowingContent = /\?\s*[yn]\s*\r?\n.+/i.test(lastLines);
    if (hasFollowingContent) {
      return true;
    }
  }

  // 3. Detect prompt disappeared, command continues executing
  const hasMarkers = newData.includes('<<<EXIT_CODE') || newData.includes('<<<CMD_END>>>');
  if (!hasMarkers && newData.length > 50) {
    if (/Downloading|Preparing|Verifying|Executing|done/i.test(newData)) {
      return false;
    }
  }

  return false;
}
