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
  modeCodex: 'Codex',
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

  // Común (plugin autocontenido)
  cancel: 'Cancelar',
};
