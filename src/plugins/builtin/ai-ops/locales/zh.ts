export const zh = {
  // 面板标题
  panelTitle: 'AI运维',

  // 插件元数据
  displayName: 'AI 运维',
  description: 'AI 驱动的运维助手面板',

  // 连接状态
  connectionIdle: '闲置中',
  connectionConnecting: '连接中',
  connectionConnected: '已连接',
  connectionDisconnected: '已断开',
  disconnectSession: '断开',

  // 头部操作
  newConversation: '新建会话',
  chatHistory: '会话记录',
  hideAd: '关闭广告',
  showAd: '开启广告',

  // 游客提示
  guestAiDisabled: '登录后解锁 AI 运维功能',
  loginToUseAI: '登录后即可使用 AI 运维功能',

  // 积分不足
  insufficientGems: '积分不足',
  insufficientGemsMessage: '您的积分余额不足，请充值后继续使用。',
  insufficientGemsAgentMode: 'Agent 模式由于需要消耗更多推理资源，单次请求需 2 个积分。',
  recharge: '充值',

  // 输入区域
  modeAsk: 'Ask',
  modeAgent: 'Agent',
  modeCode: 'Code',
  modeXAgent: 'X-Agent',
  attachContext: 'Attach context and plan steps...',
  askOrAttach: 'Ask or attach logs for analysis...',
  stopTask: '终止任务',
  send: '发送',
  attachFiles: 'Attach files',
  noModelsAvailable: '暂无可用模型',
  sshAssociated: '关联SSH',
  sshIndependent: '独立SSH',
  sshAssociatedTooltip: 'AI 将在当前终端窗口中发送命令。共享会话上下文和环境变量。',
  sshIndependentTooltip: 'AI 将在后台静默建立新通道执行任务。不会干扰终端操作。',

  // Agent 模式建议
  opsTaskDetected: '检测到运维任务',
  agentSuggestionDesc: '切换到 Agent 模式可以获得更智能的运维支持，包括自动化执行、步骤规划和风险评估。',
  switchToAgent: '切换到 Agent 模式',

  // 交互确认对话框
  requiresConfirmation: '远程服务器需要确认',
  confirmYes: '确认 (y)',
  cancelNo: '取消 (n)',

  // 会话记录
  noConversations: '暂无会话记录',
  noConversationsDesc: '开始与 AI 对话后，记录将自动保存',
  deleteConversation: '删除会话',
  deleteConversationConfirm: '确定要删除该会话记录吗？',
  unnamedConversation: '未命名会话',
  justNow: '刚刚',
  minutesAgo: (n: number) => `${n}分钟前`,
  hoursAgo: (n: number) => `${n}小时前`,
  yesterday: '昨天',

  // 复制回复（AIOpsPanel onCopyReply）
  commandSuggestionLabel: '命令建议：',
  explanationLabel: '说明：',
  executionOutputLabel: '--- 执行输出 ---',

  // 拒绝执行
  userDenied: '用户拒绝执行',

  // adapter 默认
  executeCommand: '执行命令',

  // 设备激活弹窗
  devicesFull: '设备数量已满',
  newDeviceDetected: '检测到新设备',
  activatePrompt: '你已购买本地 Agent 能力包，是否在此设备上激活？',
  activatedDevices: '已激活设备',
  activateThisDevice: '激活此设备',
  skipActivation: '暂不激活',
  devicesActivatedOn: (max: number) => `已在 ${max} 台设备激活：`,
  unbindFirst: '需要先解绑一台设备才能激活此设备。',
  manageDevices: '管理设备',
  timeJustNow: '刚刚',
  timeMinutesAgo: (n: number) => `${n} 分钟前`,
  timeHoursAgo: (n: number) => `${n} 小时前`,
  timeDaysAgo: (n: number) => `${n} 天前`,
  timeMonthsAgo: (n: number) => `${n} 个月前`,
  timeYearsAgo: (n: number) => `${n} 年前`,

  // 购买弹窗
  purchaseTitle: '解锁本地 Agent 能力',
  tabPurchase: '购买',
  tabActivate: '激活',
  priceOneTime: '一次性买断，永久使用',
  unlockFeatures: '解锁 Local X-Agent + Claude Code',
  featureAgentLoop: '自主 Agent 循环 + 工具调用',
  featureSSH: 'SSH 远程命令执行',
  featurePersistent: '永久授权 + 持久会话',
  featureBYOK: '自备 API Key，无额外费用',
  buyNow: (price: number) => `立即购买 ¥${price}`,
  purchasedOnOther: '已在其他设备购买？',
  purchasedOnOtherDesc: '同一账户购买后，可在最多 3 台设备上激活使用。点击下方按钮即可激活当前设备，无需输入激活码。',
  activateSuccess: '激活成功！功能已解锁',
  activateDefaultError: '激活失败，请确认当前账户已购买',
  activated: '已激活',
  activateCurrentDevice: '激活当前设备',

  // 通用（插件自包含）
  cancel: '取消',
};
