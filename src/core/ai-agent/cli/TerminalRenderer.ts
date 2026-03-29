/**
 * Terminal Renderer
 *
 * Provides terminal UI capabilities: colored output, spinner, operation plan display, etc.
 * Uses only ANSI escape codes, no additional dependencies.
 */

// ANSI colors
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

  /** Print banner with colors */
  printBanner(): void {
    console.log(`\n${C.cyan}${C.bold}TermCat AI Agent CLI${C.reset}`);
    console.log(`${C.gray}${'='.repeat(40)}${C.reset}\n`);
  }

  /** Print server information */
  printServerInfo(apiServer: string, wsServer: string): void {
    console.log(`${C.gray}API Server: ${C.white}${apiServer}${C.reset}`);
    console.log(`${C.gray}WS Server:  ${C.white}${wsServer}${C.reset}\n`);
  }

  /** Print success message */
  printSuccess(msg: string): void {
    console.log(`${C.green}✓ ${msg}${C.reset}`);
  }

  /** Print error message */
  printError(msg: string): void {
    console.log(`${C.red}✗ ${msg}${C.reset}`);
  }

  /** Print warning message */
  printWarning(msg: string): void {
    console.log(`${C.yellow}⚠ ${msg}${C.reset}`);
  }

  /** Print info message */
  printInfo(msg: string): void {
    console.log(`${C.blue}ℹ ${msg}${C.reset}`);
  }

  /** Print mode and model info */
  printModeInfo(mode: string, model: string): void {
    console.log(`${C.gray}Mode: ${C.cyan}${mode}${C.gray} | Model: ${C.cyan}${model}${C.reset}`);
  }

  /** Start spinner */
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

  /** Stop spinner */
  stopSpinner(): void {
    if (this.spinnerTimer) {
      clearInterval(this.spinnerTimer);
      this.spinnerTimer = null;
      process.stderr.write('\r\x1b[K'); // Clear line
    }
  }

  /** Output streaming text chunk (no newline) */
  writeChunk(text: string): void {
    process.stdout.write(text);
  }

  /** Output newline */
  newLine(): void {
    console.log();
  }

  /** Print operation plan */
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

  /** Print execution request confirmation prompt */
  printExecutePrompt(stepIndex: number, command: string, risk: string): string {
    const riskColor = RISK_COLORS[risk] || C.yellow;
    return `${riskColor}[${risk}]${C.reset} Execute step ${stepIndex + 1}: ${C.bold}${command}${C.reset}? [Y/n] `;
  }

  /** Print user choice prompt */
  printChoicePrompt(question: string, options: Array<{ value: string; label: string; description?: string; recommended?: boolean }>): void {
    console.log(`\n${C.bold}${C.yellow}❓ ${question}${C.reset}`);
    for (let i = 0; i < options.length; i++) {
      const opt = options[i];
      const rec = opt.recommended ? ` ${C.green}(recommended)${C.reset}` : '';
      const desc = opt.description ? ` ${C.dim}— ${opt.description}${C.reset}` : '';
      console.log(`  ${C.bold}${i + 1}.${C.reset} ${opt.label}${rec}${desc}`);
    }
  }

  /** Print step execution result */
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

  /** Print task complete */
  printTaskComplete(summary: string): void {
    if (summary) {
      console.log(`\n${C.green}${C.bold}✓ Task Complete${C.reset}`);
      console.log(`${C.dim}${summary}${C.reset}\n`);
    }
  }

  /** Print token usage */
  printTokenUsage(usage: { inputTokens: number; outputTokens: number; totalTokens: number; costGems: number }): void {
    console.log(
      `${C.gray}[Tokens: in=${usage.inputTokens} out=${usage.outputTokens} total=${usage.totalTokens}` +
      (usage.costGems ? ` cost=${usage.costGems} gems` : '') +
      `]${C.reset}`
    );
  }

  /** Print help information */
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
