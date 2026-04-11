import type { zh } from './zh';

export const es: typeof zh = {
  // Título del panel
  panelTitle: 'IA-OPS',

  // Metadatos del plugin
  displayName: 'IA Ops',
  description: 'Panel de asistente de operaciones impulsado por IA',

  // Estado de conexión
  connectionIdle: 'Inactivo',
  connectionConnecting: 'Conectando',
  connectionConnected: 'Conectado',
  connectionDisconnected: 'Desconectado',
  disconnectSession: 'Desconectar',

  // Acciones del encabezado
  newConversation: 'Nuevo Chat',
  chatHistory: 'Historial de Chat',
  hideAd: 'Ocultar Anuncio',
  showAd: 'Mostrar Anuncio',

  // Aviso de invitado
  guestAiDisabled: 'Inicia sesión para desbloquear AI Ops',
  loginToUseAI: 'Inicia sesión para usar AI Ops',

  // Gemas insuficientes
  insufficientGems: 'Gemas Insuficientes',
  insufficientGemsMessage: 'Tu saldo de gemas es insuficiente, por favor recarga para continuar.',
  insufficientGemsAgentMode: 'El modo Agente requiere 2 gemas por solicitud debido a las capacidades avanzadas de IA.',
  recharge: 'Recargar',

  // Área de entrada
  modeAsk: 'Ask',
  modeAgent: 'Agente',
  modeCode: 'Code',
  modeXAgent: 'X-Agent',
  attachContext: 'Adjuntar contexto y pasos del plan...',
  askOrAttach: 'Preguntar o adjuntar registros para análisis...',
  stopTask: 'Detener Tarea',
  send: 'Enviar',
  attachFiles: 'Adjuntar archivos',
  noModelsAvailable: 'No hay modelos disponibles',
  sshAssociated: 'SSH Vinculado',
  sshIndependent: 'SSH Independiente',
  sshAssociatedTooltip: 'AI enviará comandos en la ventana de terminal actual. Comparte el contexto de sesión y las variables de entorno.',
  sshIndependentTooltip: 'AI creará un canal en segundo plano para ejecutar tareas. No interferirá con sus operaciones de terminal.',

  // Sugerencia de modo Agent
  opsTaskDetected: 'Tarea de Operaciones Detectada',
  agentSuggestionDesc: 'Cambia al modo Agente para un soporte de operaciones más inteligente con automatización, planificación de pasos y evaluación de riesgos.',
  switchToAgent: 'Cambiar a Modo Agente',

  // Diálogo de interacción
  requiresConfirmation: 'El Servidor Remoto Requiere Confirmación',
  confirmYes: 'Sí (s)',
  cancelNo: 'No (n)',

  // Lista de conversaciones
  noConversations: 'Aún no hay conversaciones',
  noConversationsDesc: 'Comienza a chatear con la IA y los registros se guardarán automáticamente',
  deleteConversation: 'Eliminar conversación',
  deleteConversationConfirm: '¿Estás seguro de que deseas eliminar esta conversación?',
  unnamedConversation: 'Conversación sin nombre',
  justNow: 'Ahora mismo',
  minutesAgo: (n: number) => `hace ${n}min`,
  hoursAgo: (n: number) => `hace ${n}h`,
  yesterday: 'Ayer',

  // Copiar respuesta
  commandSuggestionLabel: 'Sugerencia de Comando:',
  explanationLabel: 'Nota:',
  executionOutputLabel: '--- Salida de Ejecución ---',

  // Denegar ejecución
  userDenied: 'El usuario denegó',

  // Valor predeterminado del adaptador
  executeCommand: 'Ejecutar comando',

  // Diálogo de activación de dispositivo
  devicesFull: 'Límite de Dispositivos Alcanzado',
  newDeviceDetected: 'Nuevo Dispositivo Detectado',
  activatePrompt: 'Ha comprado el paquete de Agent local. ¿Activar en este dispositivo?',
  activatedDevices: 'Dispositivos Activados',
  activateThisDevice: 'Activar',
  skipActivation: 'Ahora No',
  devicesActivatedOn: (max: number) => `Activado en ${max} dispositivos:`,
  unbindFirst: 'Debe desvincular un dispositivo antes de activar este.',
  manageDevices: 'Gestionar Dispositivos',
  timeJustNow: 'ahora',
  timeMinutesAgo: (n: number) => `hace ${n}min`,
  timeHoursAgo: (n: number) => `hace ${n}h`,
  timeDaysAgo: (n: number) => `hace ${n}d`,
  timeMonthsAgo: (n: number) => `hace ${n} meses`,
  timeYearsAgo: (n: number) => `hace ${n} años`,

  // Diálogo de compra
  purchaseTitle: 'Desbloquear Agent Local',
  tabPurchase: 'Comprar',
  tabActivate: 'Activar',
  priceOneTime: 'Compra única, acceso permanente',
  unlockFeatures: 'Desbloquear Local X-Agent + Claude Code',
  featureAgentLoop: 'Ciclo autónomo de Agent + llamadas de herramientas',
  featureSSH: 'Ejecución remota de comandos SSH',
  featurePersistent: 'Licencia permanente + sesiones persistentes',
  featureBYOK: 'Use su propia API Key, sin costo adicional',
  buyNow: (price: number) => `Comprar ¥${price}`,
  purchasedOnOther: '¿Comprado en otro dispositivo?',
  purchasedOnOtherDesc: 'Después de comprar, puede activar en hasta 3 dispositivos. Haga clic abajo para activar — no necesita código de activación.',
  activateSuccess: '¡Activado! Funciones desbloqueadas',
  activateDefaultError: 'Activación fallida. Confirme que su cuenta ha comprado este producto.',
  activated: 'Activado',
  activateCurrentDevice: 'Activar Este Dispositivo',

  // Común (plugin autocontenido)
  cancel: 'Cancelar',
};
