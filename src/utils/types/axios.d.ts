/**
 * Axios类型扩展
 * Axios Type Extensions
 */

import 'axios';

declare module 'axios' {
  export interface AxiosRequestConfig {
    metadata?: {
      startTime?: number;
    };
  }
}
