/**
 * Client version information
 *
 * Single source of truth for version: "version" field in package.json
 * Injected at build time by vite.config.ts via define as __APP_VERSION__
 */

declare const __APP_VERSION__: string;

/** Version string, e.g. "0.1.1" */
const appVersion = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '0.0.0';

/** Parse version number segments */
function parseVersion(v: string): { major: number; minor: number; build: number } {
  const parts = v.replace(/^v/, '').split('.').map(Number);
  return {
    major: parts[0] || 0,
    minor: parts[1] || 0,
    build: parts[2] || 0,
  };
}

export const VERSION = parseVersion(appVersion);

/** Display version string, e.g. v0.1.1 */
export const VERSION_STRING = `v${appVersion}`;

/** Version comparison number, higher means newer */
export const VERSION_NUMBER = VERSION.major * 1000000 + VERSION.minor * 1000 + VERSION.build;

/** Convert version string to number for comparison */
export function versionToNumber(v: string): number {
  const parts = v.replace(/^v/, '').split('.').map(Number);
  return (parts[0] || 0) * 1000000 + (parts[1] || 0) * 1000 + (parts[2] || 0);
}
