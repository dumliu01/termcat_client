/**
 * Local terminal configuration persistence.
 *
 * The local terminal is a synthetic host (not stored via hostService), so its
 * shell/cwd preferences are persisted independently in localStorage and loaded
 * at launch time by useTabManager.handleLocalConnect().
 */

import { logger, LOG_MODULE } from '@/base/logger/logger';

const log = logger.withFields({ module: LOG_MODULE.TERMINAL });

const STORAGE_KEY = 'termcat.localTerminalConfig';

export interface LocalTerminalSavedConfig {
  /** Shell executable path. Empty/undefined => use system default shell. */
  shellPath?: string;
  /** Shell launch args (e.g. Git Bash needs ['--login', '-i']). */
  shellArgs?: string[];
  /** Display name of the selected shell, for UI restore. */
  shellName?: string;
  /** Start directory. Empty/undefined => user home. */
  cwd?: string;
}

/** Load persisted local terminal config. Returns an empty object on miss/parse error. */
export function loadLocalTerminalConfig(): LocalTerminalSavedConfig {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object') return parsed as LocalTerminalSavedConfig;
    return {};
  } catch (err) {
    log.warn('local_terminal_config.load_failed', 'Failed to load local terminal config', { error: String(err) });
    return {};
  }
}

/** Persist local terminal config. Called once on modal save (not a high-frequency write). */
export function saveLocalTerminalConfig(config: LocalTerminalSavedConfig): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
    log.info('local_terminal_config.saved', 'Local terminal config saved', {
      shell_name: config.shellName,
      has_cwd: !!config.cwd,
    });
  } catch (err) {
    log.error('local_terminal_config.save_failed', 'Failed to save local terminal config', { error: String(err) });
  }
}
