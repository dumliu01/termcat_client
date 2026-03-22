/**
 * 终端渲染器
 *
 * 提供彩色输出、spinner、操作计划展示等终端 UI 能力。
 * 仅使用 ANSI 转义码，无额外依赖。
 */

// ANSI 颜色
const C = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
  gray: '\x1b[90m',
};

const RISK_COLORS: Record<string, string> = {
  low: C.green,
  medium: C.yellow,
  high: C.red,
};

const SPINNER_FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];

export class TerminalRenderer {
  private spinnerTimer: ReturnType<typeof setInterval> | null = null;
  private spinnerFrame = 0;
  private spinnerText = '';

  /** 打印带颜色的标题横幅 */
  printBanner(): void {
    console.log(`\n${C.cyan}${C.bold}TermCat AI Agent CLI${C.reset}`);
    console.log(`${C.gray}${'='.repeat(40)}${C.reset}\n`);
  }

  /** 打印服务器信息 */
  printServerInfo(apiServer: string, wsServer: string): void {
    console.log(`${C.gray}API Server: ${C.white}${apiServer}${C.reset}`);
    console.log(`${C.gray}WS Server:  ${C.white}${wsServer}${C.reset}\n`);
  }

  /** 打印成功消息 */
  printSuccess(msg: string): void {
    console.log(`${C.green}✓ ${msg}${C.reset}`);
  }

  /** 打印错误消息 */
  printError(msg: string): void {
    console.log(`${C.red}✗ ${msg}${C.reset}`);
  }

  /** 打印警告消息 */
  printWarning(msg: string): void {
    console.log(`${C.yellow}⚠ ${msg}${C.reset}`);
  }

  /** 打印信息消息 */
  printInfo(msg: string): void {
    console.log(`${C.blue}ℹ ${msg}${C.reset}`);
  }

  /** 打印模式和模型信息 */
  printModeInfo(mode: string, model: string): void {
    console.log(`${C.gray}Mode: ${C.cyan}${mode}${C.gray} | Model: ${C.cyan}${model}${C.reset}`);
  }

  /** 开始 spinner */
  startSpinner(text: string): void {
    this.stopSpinner();
    this.spinnerText = text;
    this.spinnerFrame = 0;
    this.spinnerTimer = setInterval(() => {
      const frame = SPINNER_FRAMES[this.spinnerFrame % SPINNER_FRAMES.length];
      process.stderr.write(`\r${C.cyan}${frame}${C.reset} ${this.spinnerText}`);
      this.spinnerFrame++;
    }, 80);
  }

  /** 停止 spinner */
  stopSpinner(): void {
    if (this.spinnerTimer) {
      clearInterval(this.spinnerTimer);
      this.spinnerTimer = null;
      process.stderr.write('\r\x1b[K'); // 清除行
    }
  }

  /** 输出流式文本块（不换行） */
  writeChunk(text: string): void {
    process.stdout.write(text);
  }

  /** 输出换行 */
  newLine(): void {
    console.log();
  }

  /** 打印操作计划 */
  printPlan(plan: Array<{ index: number; description: string; command?: string; risk?: string }>): void {
    console.log(`\n${C.bold}${C.blue}📋 Operation Plan:${C.reset}`);
    for (const step of plan) {
      const riskColor = RISK_COLORS[step.risk || 'medium'] || C.yellow;
      const riskTag = `${riskColor}[${step.risk || 'medium'}]${C.reset}`;
      const cmd = step.command ? ` ${C.dim}— ${step.command}${C.reset}` : '';
      console.log(`  ${C.bold}Step ${step.index + 1}:${C.reset} ${riskTag}  ${step.description}${cmd}`);
    }
    console.log();
  }

  /** 打印执行请求确认提示 */
  printExecutePrompt(stepIndex: number, command: string, risk: string): string {
    const riskColor = RISK_COLORS[risk] || C.yellow;
    return `${riskColor}[${risk}]${C.reset} Execute step ${stepIndex + 1}: ${C.bold}${command}${C.reset}? [Y/n] `;
  }

  /** 打印用户选择提示 */
  printChoicePrompt(question: string, options: Array<{ value: string; label: string; description?: string; recommended?: boolean }>): void {
    console.log(`\n${C.bold}${C.yellow}❓ ${question}${C.reset}`);
    for (let i = 0; i < options.length; i++) {
      const opt = options[i];
      const rec = opt.recommended ? ` ${C.green}(recommended)${C.reset}` : '';
      const desc = opt.description ? ` ${C.dim}— ${opt.description}${C.reset}` : '';
      console.log(`  ${C.bold}${i + 1}.${C.reset} ${opt.label}${rec}${desc}`);
    }
  }

  /** 打印步骤执行结果 */
  printStepResult(stepIndex: number, success: boolean, output?: string): void {
    if (success) {
      console.log(`${C.green}✓ Step ${stepIndex + 1} completed${C.reset}`);
    } else {
      console.log(`${C.red}✗ Step ${stepIndex + 1} failed${C.reset}`);
    }
    if (output) {
      console.log(`${C.dim}${output}${C.reset}`);
    }
  }

  /** 打印任务完成 */
  printTaskComplete(summary: string): void {
    if (summary) {
      console.log(`\n${C.green}${C.bold}✓ Task Complete${C.reset}`);
      console.log(`${C.dim}${summary}${C.reset}\n`);
    }
  }

  /** 打印 Token 使用量 */
  printTokenUsage(usage: { inputTokens: number; outputTokens: number; totalTokens: number; costGems: number }): void {
    console.log(
      `${C.gray}[Tokens: in=${usage.inputTokens} out=${usage.outputTokens} total=${usage.totalTokens}` +
      (usage.costGems ? ` cost=${usage.costGems} gems` : '') +
      `]${C.reset}`
    );
  }

  /** 打印帮助信息 */
  printHelp(): void {
    console.log(`\n${C.bold}Commands:${C.reset}`);
    console.log(`  ${C.cyan}/mode agent|normal${C.reset}  Switch AI mode`);
    console.log(`  ${C.cyan}/model <name>${C.reset}       Switch AI model`);
    console.log(`  ${C.cyan}/auto${C.reset}               Toggle auto-execute mode`);
    console.log(`  ${C.cyan}/status${C.reset}             Show current status`);
    console.log(`  ${C.cyan}/help${C.reset}               Show this help`);
    console.log(`  ${C.cyan}/quit${C.reset}               Exit CLI`);
    console.log();
  }
}
