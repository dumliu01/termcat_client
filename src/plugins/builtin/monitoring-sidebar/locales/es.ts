import type { zh } from './zh';

export const es: typeof zh = {
  // Metadatos del plugin
  displayName: 'Monitor del Sistema',
  description: 'Monitoreo en tiempo real de CPU, memoria, red, disco y procesos del host remoto',

  // Título del panel y barra de herramientas
  panelTitle: 'Monitor del Sistema',
  toggleTooltip: 'Alternar Panel de Monitoreo',

  // Encabezado
  onlineMonitor: 'Monitor en Línea',

  // Métricas del sistema
  uptimeShort: 'ACTIVO',
  loadShort: 'CARGA',
  cores: 'Núcleos',
  memShort: 'MEM',
  swapShort: 'SWAP',

  // Procesos
  command: 'COMANDO',

  // Red
  local: 'LOCAL',

  // Disco
  path: 'RUTA',
  freeTotal: 'LIBRE/TOTAL',
};
