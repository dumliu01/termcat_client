/**
 * Builtin Plugin Event Constants
 *
 * Separate file to avoid importing the entire plugin module just for event constants.
 */

/** AI Ops plugin events */
export const AI_OPS_EVENTS = {
  /** AI panel requests command execution (payload: string — command text) */
  EXECUTE_COMMAND: 'ai-ops:execute-command',
  /** Gem balance updated (payload: number — new balance) */
  GEMS_UPDATED: 'ai-ops:gems-updated',
  /** Request to open membership center / points purchase page */
  OPEN_MEMBERSHIP: 'ai-ops:open-membership',
  /** License changed (payload: updated license info) */
  LICENSE_CHANGED: 'license:changed',
  /** Request to open payment modal (payload: { type, amount, tierId? }) */
  OPEN_PAYMENT: 'ai-ops:open-payment',
} as const;

/** Command library plugin events */
export const COMMAND_LIBRARY_EVENTS = {
  /** User selected a command (payload: string — command text) */
  COMMAND_SELECTED: 'command-library:command-selected',
} as const;

/** Transfer manager plugin events */
export const TRANSFER_EVENTS = {
  /** New transfer task added */
  ITEM_ADDED: 'transfer-manager:item-added',
} as const;

/** File browser plugin events */
export const FILE_BROWSER_EVENTS = {
  /** Start file transfer */
  TRANSFER_START: 'file-browser:transfer-start',
} as const;
