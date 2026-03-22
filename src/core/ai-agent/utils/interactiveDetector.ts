/**
 * 交互式提示检测器
 *
 * 检测 Shell 输出中的交互式提示（如 y/n 确认）
 * 设计原则：不针对特定命令，而是检测通用的交互模式
 *
 * 从 src/components/ai-ops/utils/interactiveDetector.ts 提取
 */

interface PromptPattern {
  pattern: RegExp;
  name: string;
}

/** 通用交互提示模式（按优先级排序，越具体的越靠前） */
const PROMPT_PATTERNS: PromptPattern[] = [
  // 特定工具的标准提示
  { pattern: /Proceed\s*\(\[?[yY]\]?\/\[?[nN]\]?\)\??\s*$/im, name: 'conda proceed' },
  { pattern: /Do you want to continue\?\s*\[?[yY]\/[nN]\]?\s*$/im, name: 'apt/yum continue' },
  { pattern: /Do you wish to continue\?\s*\(?[yY]\/\[?[nN]\]?\)?\s*\??\s*$/im, name: 'conda wish to continue' },
  { pattern: /Is this ok\s*\[?[yY]\/[nN]\]?\s*:?\s*$/im, name: 'yum confirm' },

  // 删除/移除类确认
  { pattern: /Really\s+(delete|remove|uninstall).*\?\s*$/im, name: 'destructive confirm' },
  { pattern: /Remove.*\?\s*\[?[yY]\/[nN]\]?\s*$/im, name: 'remove confirm' },
  { pattern: /Delete.*\?\s*\[?[yY]\/[nN]\]?\s*$/im, name: 'delete confirm' },
  { pattern: /Uninstall.*\?\s*\[?[yY]\/[nN]\]?\s*$/im, name: 'uninstall confirm' },

  // 覆盖/替换类确认
  { pattern: /Overwrite.*\?\s*\[?[yY]\/[nN]\]?\s*$/im, name: 'overwrite confirm' },
  { pattern: /Replace.*\?\s*\[?[yY]\/[nN]\]?\s*$/im, name: 'replace confirm' },

  // 通用确认模式
  { pattern: /Are you sure.*\?\s*$/im, name: 'confirmation' },
  { pattern: /Continue\?\s*\[?[yY]\/[nN]\]?\s*$/im, name: 'generic continue' },
  { pattern: /\(y\/\[n\]\)\?\s*$/im, name: 'y/[n] choice (parentheses)' },
  { pattern: /\(\[y\]\/n\)\?\s*$/im, name: '[y]/n choice (parentheses)' },
  { pattern: /\[?[yY]es\/[nN]o\]?\s*\??\s*:?\s*$/im, name: 'yes/no question' },
  { pattern: /\[?[yY]\/[nN]\]?\s*\??\s*:?\s*$/m, name: 'y/n choice' },

  // 通用输入提示（read -p 等）：包含输入相关关键词，以冒号结尾等待自由文本输入。
  // AI 模型有时生成 read -p 命令让用户手动输入值，在自动化执行中会挂死。
  // 检测到后由 VirtualOperator 的 LLM 基于命令上下文智能回复，而非等待超时。
  { pattern: /(?:enter|input|type|specify|provide|请输入|输入|请提供|请指定|请选择|选择).*[:：]\s*$/im, name: 'generic input prompt' },

  // 按键继续类
  { pattern: /Press\s+.*\s+to\s+continue/im, name: 'press to continue' },
  { pattern: /Press\s+any\s+key/im, name: 'press any key' },
];

/**
 * 检测输出中是否包含交互式提示
 *
 * @param output - Shell 输出
 * @returns 提示内容（包含上下文），如果没有检测到则返回 null
 */
export function detectInteractivePrompt(output: string): string | null {
  const lines = output.split('\n');
  const lastLines = lines.slice(-10).join('\n');

  for (const { pattern, name } of PROMPT_PATTERNS) {
    if (pattern.test(lastLines)) {
      // 从后往前查找匹配的行
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
        // 提取提示行及其前后 3 行作为上下文
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
 * 检测用户是否在终端直接输入了（而不是在 AI 运维界面交互）
 *
 * @param newData - 新接收的数据
 * @param outputBuffer - 输出缓冲区
 * @returns 是否检测到用户输入
 */
export function detectUserTerminalInput(newData: string, outputBuffer: string): boolean {
  // 1. 检测到回车/换行（用户按了 Enter）
  if (newData.includes('\r') || newData.includes('\n')) {
    const withoutAnsiCodes = newData.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '');
    if (withoutAnsiCodes.trim().length > 2) {
      if (/done|Preparing|Verifying|Executing|Downloading/i.test(newData)) {
        return false;
      }
      return true;
    }
  }

  // 2. 检测到 y/n 等输入字符（在提示后面）
  const lastLines = outputBuffer.split('\n').slice(-3).join('\n');
  if (/\?\s*[yn]\s*$/i.test(lastLines)) {
    const hasFollowingContent = /\?\s*[yn]\s*\r?\n.+/i.test(lastLines);
    if (hasFollowingContent) {
      return true;
    }
  }

  // 3. 检测到提示消失、命令继续执行
  const hasMarkers = newData.includes('<<<EXIT_CODE') || newData.includes('<<<CMD_END>>>');
  if (!hasMarkers && newData.length > 50) {
    if (/Downloading|Preparing|Verifying|Executing|done/i.test(newData)) {
      return false;
    }
  }

  return false;
}
