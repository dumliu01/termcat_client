/**
 * License Service
 *
 * Responsibilities:
 * - Check license status (cache + online verification)
 * - Device activation / deactivation
 * - Feature access control
 * - Machine ID management via IPC with fallback
 */

import { LicenseCache, LicenseFeaturesResponse, LicenseActivateResponse, MachineInfo } from './types';
import { apiService } from '@/base/http/api';
import { logger, LOG_MODULE } from '@/base/logger/logger';

const log = logger.withFields({ module: LOG_MODULE.APP });
const STORAGE_KEY = 'termcat_license_cache';

type LicenseEvent = 'new-device-detected' | 'license-changed';
type LicenseEventListener = (cache: LicenseCache) => void;

class LicenseService {
  private cache: LicenseCache | null = null;
  private changeListeners: Array<() => void> = [];
  private eventListeners: Map<LicenseEvent, LicenseEventListener[]> = new Map();

  constructor() {
    this.loadFromCache();
  }

  // ---- Cache Management ----

  /** Load cached license from localStorage */
  private loadFromCache(): void {
    try {
      const cached = localStorage.getItem(STORAGE_KEY);
      if (cached) {
        this.cache = JSON.parse(cached);
        log.debug('license.cache.loaded', 'Loaded from cache', { features: this.cache?.features });
      } else {
        log.debug('license.cache.empty', 'No cache found');
      }
    } catch {
      // Parse failed, ignore
    }
  }

  /** Save cache to localStorage */
  private saveToCache(cache: LicenseCache): void {
    this.cache = cache;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cache));
  }

  /** Check if cache has expired based on server-controlled TTL */
  private isCacheExpired(cache: LicenseCache): boolean {
    const ttlMs = (cache.cacheTtl || 86400) * 1000;
    return Date.now() - cache.verifiedAt > ttlMs;
  }

  /** Default cache: no license, all locked */
  private defaultCache(machineId: string): LicenseCache {
    return {
      hasLicense: false,
      features: [],
      activated: false,
      machinesUsed: 0,
      machinesMax: 0,
      licenseKeyMasked: '',
      verifiedAt: 0,
      cacheTtl: 86400,
      machineId,
    };
  }

  // ---- Machine ID ----

  /** Get device fingerprint via IPC with fallback */
  async getMachineId(): Promise<string> {
    // Try IPC first (Electron main process)
    try {
      const id = await (window as any).electronAPI?.license?.getMachineId();
      if (id) return id;
    } catch { /* fallback */ }

    // Fallback: use cached machine ID from localStorage
    let cached = localStorage.getItem('termcat_machine_id');
    if (cached) return cached;

    // Last resort: generate a random ID and cache it
    const arr = new Uint8Array(16);
    crypto.getRandomValues(arr);
    cached = Array.from(arr, b => b.toString(16).padStart(2, '0')).join('');
    localStorage.setItem('termcat_machine_id', cached);
    return cached;
  }

  // ---- License Check ----

  /**
   * Startup license check.
   * - Use cache if within cache_ttl
   * - Otherwise query server online
   * - If offline + cache expired, return defaultCache (features locked)
   * - If has_license && !activated, emit 'new-device-detected'
   */
  async checkLicense(forceRefresh = false): Promise<LicenseCache> {
    const machineId = await this.getMachineId();

    // If cache exists and not expired, return cached value
    if (!forceRefresh && this.cache && !this.isCacheExpired(this.cache)) {
      log.info('license.check.cached', 'Using cached license', {
        features: this.cache.features,
        activated: this.cache.activated,
      });
      return this.cache;
    }

    // Cache expired or missing, try online verification
    try {
      const resp = await apiService.licenseGetFeatures(machineId) as LicenseFeaturesResponse;
      const cache: LicenseCache = {
        hasLicense: resp.has_license,
        features: resp.features || [],
        activated: resp.current_machine_activated,
        machinesUsed: resp.machines_used,
        machinesMax: resp.machines_max,
        licenseKeyMasked: resp.license_key_masked || '',
        verifiedAt: Date.now(),
        cacheTtl: resp.cache_ttl || 86400,
        machineId,
      };

      this.saveToCache(cache);
      log.info('license.check.online', 'License verified online', {
        hasLicense: cache.hasLicense,
        activated: cache.activated,
        features: cache.features,
      });

      // Emit new-device-detected if user has license but this device is not activated
      if (cache.hasLicense && !cache.activated) {
        this.emitEvent('new-device-detected', cache);
      }

      this.notifyChange();
      return cache;
    } catch (error) {
      log.error('license.check.failed', 'Failed to verify license online', {
        error: 1,
        msg: (error as Error).message,
      });

      // Offline + cache expired = features locked
      const fallback = this.defaultCache(machineId);
      this.saveToCache(fallback);
      this.notifyChange();
      return fallback;
    }
  }

  // ---- Device Activation ----

  /** Activate current device */
  async activateDevice(): Promise<LicenseCache> {
    const machineId = await this.getMachineId();
    const machineName = await this.getDeviceName();

    const resp = await apiService.licenseActivate(machineId, machineName) as LicenseActivateResponse;
    const cache: LicenseCache = {
      hasLicense: true,
      features: resp.features || [],
      activated: true,
      machinesUsed: resp.machines_used,
      machinesMax: resp.machines_max,
      licenseKeyMasked: this.cache?.licenseKeyMasked || '',
      verifiedAt: Date.now(),
      cacheTtl: resp.cache_ttl || 86400,
      machineId,
    };

    this.saveToCache(cache);
    log.info('license.device.activated', 'Device activated', {
      machineId,
      machinesUsed: cache.machinesUsed,
      alreadyActivated: resp.already_activated,
    });

    this.notifyChange();
    this.emitEvent('license-changed', cache);
    return cache;
  }

  /** Deactivate a device by machine ID */
  async deactivateDevice(machineId: string): Promise<void> {
    await apiService.licenseDeactivate(machineId);

    log.info('license.device.deactivated', 'Device deactivated', { machineId });

    // Refresh license status after deactivation
    await this.checkLicense();
  }

  /** Activate license with a license key */
  async activateWithKey(key: string): Promise<LicenseCache> {
    const machineId = await this.getMachineId();
    const machineName = await this.getDeviceName();

    const resp = await apiService.licenseActivateKey(key, machineId, machineName) as LicenseActivateResponse;
    const cache: LicenseCache = {
      hasLicense: true,
      features: resp.features || [],
      activated: true,
      machinesUsed: resp.machines_used,
      machinesMax: resp.machines_max,
      licenseKeyMasked: this.maskKey(key),
      verifiedAt: Date.now(),
      cacheTtl: resp.cache_ttl || 86400,
      machineId,
    };

    this.saveToCache(cache);
    log.info('license.key.activated', 'License key activated', {
      machineId,
      features: cache.features,
    });

    this.notifyChange();
    this.emitEvent('license-changed', cache);
    return cache;
  }

  // ---- Machine Management ----

  /** Get list of activated devices */
  async getMachines(): Promise<MachineInfo[]> {
    return await apiService.licenseGetMachines() as MachineInfo[];
  }

  // ---- Feature Query ----

  /** Check if a feature is available (hasLicense && activated && feature included) */
  isFeatureUnlocked(feature: string): boolean {
    if (!this.cache) return false;
    return this.cache.hasLicense && this.cache.activated && this.cache.features.includes(feature);
  }

  /** Get current cache (may be null if not yet checked) */
  getCache(): LicenseCache | null {
    return this.cache;
  }

  // ---- Change Notification ----

  /** Register change listener, returns unsubscribe function */
  onChange(listener: () => void): () => void {
    this.changeListeners.push(listener);
    return () => {
      this.changeListeners = this.changeListeners.filter(l => l !== listener);
    };
  }

  private notifyChange(): void {
    this.changeListeners.forEach(l => {
      try { l(); } catch { /* ignore */ }
    });
  }

  // ---- Event System ----

  /** Register event listener */
  on(event: LicenseEvent, listener: LicenseEventListener): () => void {
    const listeners = this.eventListeners.get(event) || [];
    listeners.push(listener);
    this.eventListeners.set(event, listeners);
    return () => {
      const current = this.eventListeners.get(event) || [];
      this.eventListeners.set(event, current.filter(l => l !== listener));
    };
  }

  private emitEvent(event: LicenseEvent, cache: LicenseCache): void {
    const listeners = this.eventListeners.get(event) || [];
    listeners.forEach(l => {
      try { l(cache); } catch { /* ignore */ }
    });
  }

  // ---- Utilities ----

  /** Get device display name */
  async getDeviceName(): Promise<string> {
    try {
      const name = await (window as any).electronAPI?.license?.getMachineName();
      if (name) return name;
    } catch { /* fallback */ }
    return navigator.userAgent.substring(0, 64);
  }

  /** Mask a license key for display: "TCAT-AGNT-XXXX-XXXX-G7H8" → "TCAT-AGNT-****-****-G7H8" */
  private maskKey(key: string): string {
    const parts = key.split('-');
    if (parts.length < 4) return key;
    return parts.map((part, i) => {
      if (i > 1 && i < parts.length - 1) return '****';
      return part;
    }).join('-');
  }

  // ---- Cleanup ----

  /** Clear cache (called on logout) */
  clear(): void {
    this.cache = null;
    localStorage.removeItem(STORAGE_KEY);
    this.notifyChange();
  }
}

export const licenseService = new LicenseService();
