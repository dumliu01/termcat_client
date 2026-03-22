/**
 * Shell 命令构建器
 *
 * 负责构建各种类型的 Shell 命令，包括：
 * - 带密码的 sudo 命令
 * - 命令检测工具
 *
 * 从 src/components/ai-ops/utils/shellCommandBuilder.ts 提取
 */

/**
 * 构建带密码的 sudo 命令
 *
 * @param command - 原始命令
 * @param password - sudo 密码
 * @returns 处理后的命令字符串
 */
export function buildCommandWithPassword(command: string, password: string): string {
  // 移除原有的 sudo 及其选项
  let commandWithoutSudo = command.replace(/\bsudo\s+(?:-[a-zA-Z]+\s+)*/g, '');

  // 处理 ~ 路径在 sudo 环境中的问题
  commandWithoutSudo = commandWithoutSudo
    .replace(/~\//g, '$HOME/')
    .replace(/(\s|^)~(\s|$|;|&&|\|\|)/g, '$1$HOME$2');

  // 转义命令和密码中的特殊字符
  const escapedCommand = commandWithoutSudo.replace(/'/g, "'\\''");
  const escapedPassword = password.replace(/\\/g, '\\\\').replace(/'/g, "'\\''");

  // 使用 heredoc (<<<) 传递密码
  // 在 bash -c 内部 export PAGER/SYSTEMD_PAGER/GIT_PAGER=cat，防止 systemctl/journalctl/git
  // 等命令在 sudo 环境下启动 less 分页器（sudo 的 env_reset 会丢弃 -E 传递的这些变量，
  // 导致 less 在 PTY 中进入全屏 alternate screen 模式挂死）
  return `sudo -E -S bash -c 'export PAGER=cat SYSTEMD_PAGER=cat GIT_PAGER=cat; ${escapedCommand}' <<< '${escapedPassword}'`;
}

/**
 * 检测命令是否包含 sudo
 *
 * @param command - 命令字符串
 * @returns 是否包含 sudo
 */
export function isSudoCommand(command: string): boolean {
  return /\bsudo\s+/.test(command);
}

/**
 * 检测 shell 命令的引号是否平衡
 *
 * AI 模型生成命令时常犯引号错误（如 echo 'today's value'），
 * 导致 bash 看到未关闭的引号而显示 > 续行提示符，命令永远不会完成。
 * 加上 buildCommandWithMarkers 追加的标记也会被吞进未关闭的引号，
 * 导致命令标记检测失效。
 *
 * @param command - 原始命令（markers 追加前）
 * @returns true 表示引号平衡，false 表示有未关闭的引号
 */
export function hasBalancedQuotes(command: string): boolean {
  let inSingle = false;
  let inDouble = false;

  for (let i = 0; i < command.length; i++) {
    const ch = command[i];

    // 单引号内：只有 ' 能关闭，无转义机制
    if (inSingle) {
      if (ch === "'") inSingle = false;
      continue;
    }

    // 双引号内：\ 可转义 " \ $ `
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

    // 引号外：\ 转义下一个字符（包括 \'）
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
 * 将 heredoc 命令转换为单行 printf 等价形式。
 *
 * heredoc 命令（<<EOF ... EOF）与 buildCommandWithMarkers 和 buildCommandWithPassword 不兼容：
 * - buildCommandWithMarkers 在命令末尾追加 `; echo "<<<EXIT_CODE:...">`，
 *   导致 EOF 终止符不再独占一行，heredoc 永远不关闭
 * - buildCommandWithPassword 将命令包在 `bash -c '...'` 中，
 *   单引号转义打断 heredoc 内部引号结构
 *
 * 转换示例：
 *   cat > /tmp/file <<'EOF'        →  printf '%s\n' '[server]' 'host=127.0.0.1' > /tmp/file
 *   [server]
 *   host=127.0.0.1
 *   EOF
 *
 * @param command - 原始命令
 * @returns 转换后的单行命令，或 null（非 heredoc）
 */
export function rewriteHeredoc(command: string): string | null {
  // 匹配: cmd <<[-]?['"]?DELIM['"]?\ncontent\nDELIM
  const match = command.match(/^(.*?)<<-?\s*['"]?(\w+)['"]?\s*\n([\s\S]*?)\n\2\s*$/);
  if (!match) return null;

  const [, cmdPart, , content] = match;

  // 将内容按行拆分，每行单独作为 printf 参数（避免转义问题）
  const lines = content.split('\n');
  const args = lines.map(line => {
    const escaped = line.replace(/'/g, "'\\''");
    return `'${escaped}'`;
  }).join(' ');

  // printf '%s\n' 会为每个参数循环应用格式，逐行输出
  return `printf '%s\\n' ${args} | ${cmdPart.trim()}`;
}
