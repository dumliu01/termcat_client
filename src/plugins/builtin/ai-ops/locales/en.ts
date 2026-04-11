import type { zh } from './zh';

export const en: typeof zh = {
  // Panel title
  panelTitle: 'AI-OPS',

  // Plugin metadata
  displayName: 'AI Ops',
  description: 'AI-powered operations assistant panel',

  // Connection status
  connectionIdle: 'Idle',
  connectionConnecting: 'Connecting',
  connectionConnected: 'Connected',
  connectionDisconnected: 'Disconnected',
  disconnectSession: 'Disconnect',

  // Header actions
  newConversation: 'New Chat',
  chatHistory: 'Chat History',
  hideAd: 'Hide Ad',
  showAd: 'Show Ad',

  // Guest prompt
  guestAiDisabled: 'Login to unlock AI Ops',
  loginToUseAI: 'Login to use AI Ops',

  // Insufficient gems
  insufficientGems: 'Insufficient Gems',
  insufficientGemsMessage: 'Your gem balance is insufficient, please recharge to continue.',
  insufficientGemsAgentMode: 'Agent mode requires 2 gems per request due to advanced AI capabilities.',
  recharge: 'Recharge',

  // Input area
  modeAsk: 'Ask',
  modeAgent: 'Agent',
  modeCode: 'Code',
  modeXAgent: 'X-Agent',
  attachContext: 'Attach context and plan steps...',
  askOrAttach: 'Ask or attach logs for analysis...',
  stopTask: 'Stop Task',
  send: 'Send',
  attachFiles: 'Attach files',
  noModelsAvailable: 'No models available',
  sshAssociated: 'Link SSH',
  sshIndependent: 'Solo SSH',
  sshAssociatedTooltip: 'AI sends commands in the current terminal window. Shares session context and environment variables.',
  sshIndependentTooltip: 'AI creates a background channel to execute tasks. Won\'t interfere with your terminal operations.',

  // Agent mode suggestion
  opsTaskDetected: 'Ops Task Detected',
  agentSuggestionDesc: 'Switch to Agent mode for smarter ops support with automation, step planning, and risk assessment.',
  switchToAgent: 'Switch to Agent Mode',

  // Interaction dialog
  requiresConfirmation: 'Remote Server Requires Confirmation',
  confirmYes: 'Yes (y)',
  cancelNo: 'No (n)',

  // Conversation list
  noConversations: 'No conversations yet',
  noConversationsDesc: 'Start chatting with AI and records will be saved automatically',
  deleteConversation: 'Delete conversation',
  deleteConversationConfirm: 'Are you sure you want to delete this conversation?',
  unnamedConversation: 'Unnamed conversation',
  justNow: 'Just now',
  minutesAgo: (n: number) => `${n}m ago`,
  hoursAgo: (n: number) => `${n}h ago`,
  yesterday: 'Yesterday',

  // Copy reply (AIOpsPanel onCopyReply)
  commandSuggestionLabel: 'Command Suggestion:',
  explanationLabel: 'Note:',
  executionOutputLabel: '--- Execution Output ---',

  // Deny execution
  userDenied: 'User denied',

  // Adapter default
  executeCommand: 'Execute command',

  // Device activation dialog
  devicesFull: 'Device Limit Reached',
  newDeviceDetected: 'New Device Detected',
  activatePrompt: 'You have purchased the local Agent pack. Activate on this device?',
  activatedDevices: 'Activated Devices',
  activateThisDevice: 'Activate',
  skipActivation: 'Not Now',
  devicesActivatedOn: (max: number) => `Activated on ${max} devices:`,
  unbindFirst: 'You need to unbind a device before activating this one.',
  manageDevices: 'Manage Devices',
  timeJustNow: 'just now',
  timeMinutesAgo: (n: number) => `${n}m ago`,
  timeHoursAgo: (n: number) => `${n}h ago`,
  timeDaysAgo: (n: number) => `${n}d ago`,
  timeMonthsAgo: (n: number) => `${n}mo ago`,
  timeYearsAgo: (n: number) => `${n}y ago`,

  // Purchase dialog
  purchaseTitle: 'Unlock Local Agent',
  tabPurchase: 'Purchase',
  tabActivate: 'Activate',
  priceOneTime: 'One-time purchase, lifetime access',
  unlockFeatures: 'Unlock Local X-Agent + Claude Code',
  featureAgentLoop: 'Autonomous Agent loop + tool calls',
  featureSSH: 'SSH remote command execution',
  featurePersistent: 'Permanent license + persistent sessions',
  featureBYOK: 'Bring your own API Key, no extra cost',
  buyNow: (price: number) => `Buy Now ¥${price}`,
  purchasedOnOther: 'Purchased on another device?',
  purchasedOnOtherDesc: 'After purchasing on any device, you can activate on up to 3 devices. Click below to activate — no activation code needed.',
  activateSuccess: 'Activated! Features unlocked',
  activateDefaultError: 'Activation failed. Please confirm your account has purchased this product.',
  activated: 'Activated',
  activateCurrentDevice: 'Activate This Device',

  // Common (plugin self-contained)
  cancel: 'Cancel',
};
