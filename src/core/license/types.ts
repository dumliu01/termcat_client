/**
 * License System Type Definitions
 */

/** Local license cache structure */
export interface LicenseCache {
  hasLicense: boolean;
  features: string[];          // ["local-xagent", "local-code"]
  activated: boolean;          // current device activated
  machinesUsed: number;
  machinesMax: number;
  licenseKeyMasked: string;    // "TCAT-AGNT-****-****-G7H8"
  verifiedAt: number;          // last verification timestamp (ms)
  cacheTtl: number;            // cache TTL in seconds, server-controlled, default 86400
  machineId: string;
}

/** Server response for /license/features */
export interface LicenseFeaturesResponse {
  has_license: boolean;
  features: string[];
  current_machine_activated: boolean;
  machines_used: number;
  machines_max: number;
  license_key_masked: string;
  cache_ttl: number;
}

/** Server response for /license/activate */
export interface LicenseActivateResponse {
  features: string[];
  machines_used: number;
  machines_max: number;
  cache_ttl: number;
  already_activated?: boolean;
}

/** Machine info from /license/machines */
export interface MachineInfo {
  machine_id: string;
  machine_name: string;
  activated_at: string;
  last_seen_at: string;
}
