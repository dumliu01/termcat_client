/**
 * 分页器检测器
 *
 * 检测 Shell 输出中的分页器（pager）提示符
 * 分页器会导致命令卡住等待用户按键，在自动化环境中必须立即退出
 * 常见的分页器：less, more, systemctl --pager, journalctl
 *
 * 从 src/components/ai-ops/utils/pagerDetector.ts 提取
 */

/** 分页器检测模式 */
const PAGER_PATTERNS = [
  // less 分页器
  /lines\s+\d+-\d+\/\d+\s*\(END\)/i,  // "lines 1-15/15 (END)"
  /lines\s+\d+-\d+\/\d+/i,             // "lines 1-15/50"
  /^\s*:\s*$/m,                        // less 命令提示符（整行只有单个冒号）

  // more 分页器
  /--More--\s*\(\d+%\)/i,              // "--More-- (50%)"
  /--More--/i,                         // "--More--"

  // systemctl/journalctl pager
  /^\s*\(END\)\s*$/im,                 // 单独的 "(END)" 在一行中
];

/**
 * 检测输出中是否包含分页器提示符
 *
 * @param output - Shell 输出
 * @returns 是否检测到分页器
 */
export function detectPager(output: string): boolean {
  // 提取最后几行进行检测，避免误判
  const lastLines = output.split(/\r?\n/).slice(-3).join('\n');

  for (const pattern of PAGER_PATTERNS) {
    if (pattern.test(lastLines)) {
      return true;
    }
  }

  return false;
}

/**
 * 获取退出分页器的命令
 *
 * @returns 退出命令（通常是 'q'）
 */
export function getPagerQuitCommand(): string {
  return 'q';
}
