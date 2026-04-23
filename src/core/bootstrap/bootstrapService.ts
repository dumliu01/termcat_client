/**
 * BootstrapService — single-call replacement for the post-login API barrage.
 *
 * Replaces what used to be 4-6 separate calls (get-profile / license/features
 * / ai/get-models / commerce/config / get-profile-again-for-seqs) with one
 * /user/bootstrap request. Per-section payloads are omitted by the server
 * when the client's local cache is still fresh (see SOLUTION DOC).
 *
 * This service does NOT touch React state. Hosts / groups / proxies sync
 * stays in hostService.syncBySeqs(); user state stays in useUserAuth.
 * BootstrapService's job is the routing: parse the response, write each
 * section into the correct local cache, and return seqs + user for the
 * caller to act on.
 */

import { apiService } from '@/base/http/api';
import { authService } from '@/core/auth/authService';
import { licenseService } from '@/core/license/licenseService';
import { commerceService } from '@/core/commerce/commerceService';
import { aiModelsCache } from '@/core/ai/aiModelsCache';
import { logger, LOG_MODULE } from '@/base/logger/logger';
import type {
  BootstrapKnownVersions,
  BootstrapOptions,
  BootstrapResponse,
  BootstrapResult,
} from './types';

const log = logger.withFields({ module: LOG_MODULE.APP });

class BootstrapService {
  /**
   * Run a bootstrap round-trip and apply every payload section to its
   * corresponding local cache. Resolves with seqs + user so the caller can
   * trigger downstream sync (hostService.syncBySeqs) and React state setters.
   *
   * Throws on network failure or 401 — callers decide whether to retry,
   * fall back to local cache, or redirect to login.
   */
  async bootstrap(machineId: string, options?: BootstrapOptions): Promise<BootstrapResult> {
    const known = this.collectKnownVersions();
    const skipTokenRefresh = options?.skipTokenRefresh === true;

    // Snapshot the user id at request time so a logout / account switch
    // mid-flight doesn't pollute the new user's cache with old data.
    const requestUserId = authService.getUser()?.id;

    log.info('bootstrap.request', 'Sending bootstrap request', {
      machine_id_set: !!machineId,
      skip_token_refresh: skipTokenRefresh,
      has_known_ai_version: !!known.ai_models_version,
      has_known_commerce_seq: typeof known.commerce_seq === 'number',
      has_known_license_at: typeof known.license_cached_at === 'number',
    });

    const resp = await apiService.bootstrap({
      machine_id: machineId,
      skip_token_refresh: skipTokenRefresh || undefined,
      known_versions: known,
    });

    // Re-entry guard: if the user changed during the request, dropping the
    // response is safer than overwriting a different user's caches.
    const currentUserId = authService.getUser()?.id;
    if (requestUserId !== undefined && currentUserId !== requestUserId) {
      log.warn('bootstrap.discarded', 'Discarding response: user changed mid-request', {
        request_user: requestUserId,
        current_user: currentUserId,
      });
      return {
        user: resp.user,
        seqs: resp.seqs,
        fromCache: { license: true, aiModels: true, commerce: true },
      };
    }

    // Apply the refreshed token BEFORE any other side-effects so subsequent
    // in-flight requests (e.g. syncBySeqs) pick up the new credential.
    // Missing token is fine — the old one is still valid.
    if (resp.token) {
      authService.setToken(resp.token);
    }

    await this.applyToServices(resp);

    log.info('bootstrap.completed', 'Bootstrap response applied', {
      license_returned: resp.license !== undefined,
      ai_models_changed: resp.ai_models_version !== known.ai_models_version,
      commerce_returned: resp.commerce !== undefined,
      token_refreshed: !!resp.token,
      server_time: resp.server_time,
    });

    return {
      user: resp.user,
      seqs: resp.seqs,
      refreshIntervalMinutes: resp.refresh_interval_minutes,
      fromCache: {
        license: resp.license === undefined,
        aiModels: resp.ai_models_version === known.ai_models_version,
        commerce: resp.commerce === undefined,
      },
    };
  }

  /** Read the version triplet the client wants the server to compare against. */
  private collectKnownVersions(): BootstrapKnownVersions {
    const known: BootstrapKnownVersions = {};
    const aiVersion = aiModelsCache.getVersion();
    if (aiVersion) known.ai_models_version = aiVersion;

    const commerceConfig = commerceService.getConfig();
    if (commerceConfig && typeof commerceConfig.seq === 'number') {
      known.commerce_seq = commerceConfig.seq;
    }

    const licenseCache = licenseService.getCache();
    if (licenseCache && licenseCache.verifiedAt > 0) {
      known.license_cached_at = Math.floor(licenseCache.verifiedAt / 1000);
    }

    return known;
  }

  /**
   * Distribute response sections to caches. Each section is applied in
   * isolation; one failing section never blocks the others.
   */
  private async applyToServices(resp: BootstrapResponse): Promise<void> {
    if (resp.license) {
      try {
        await licenseService.applyFromServer(resp.license);
      } catch (err) {
        this.logSectionError('license', err);
      }
    }

    if (resp.commerce) {
      try {
        commerceService.applyFromServer(resp.commerce);
      } catch (err) {
        this.logSectionError('commerce', err);
      }
    }

    // AI models: bootstrap returns only a version. If the server's version
    // differs from what we have cached, fetch the full list now and store
    // it under the new version. If they match, the local cache is already
    // good — no work to do.
    try {
      await this.syncAIModels(resp.ai_models_version);
    } catch (err) {
      this.logSectionError('ai_models', err);
    }
  }

  private async syncAIModels(serverVersion: string): Promise<void> {
    if (!serverVersion) return;
    const cached = aiModelsCache.get();
    if (cached && cached.version === serverVersion) {
      return;
    }
    const response: any = await apiService.getAIModels();
    if (response?.data) {
      aiModelsCache.put(serverVersion, response.data);
      log.info('bootstrap.ai_models.refreshed', 'AI model list refreshed', {
        version: serverVersion,
        models: Array.isArray(response.data.models) ? response.data.models.length : 0,
      });
    }
  }

  private logSectionError(section: string, err: unknown): void {
    log.warn('bootstrap.apply_failed', `Failed to apply bootstrap section: ${section}`, {
      section,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

export const bootstrapService = new BootstrapService();
