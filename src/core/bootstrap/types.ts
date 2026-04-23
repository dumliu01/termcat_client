/**
 * Bootstrap aggregator type definitions.
 *
 * The bootstrap endpoint replaces the cluster of calls historically fired
 * after login (get-profile / license/features / ai/get-models / commerce/config).
 * Optional fields in the response are omitted by the server when the client's
 * local cache is still valid — see SOLUTION DOC for the cache-validity rules.
 */

import type { SyncSeqs, CommerceConfig } from '@/core/commerce/types';
import type { LicenseFeaturesResponse } from '@/core/license/types';

/** Versions / timestamps the client already holds locally. */
export interface BootstrapKnownVersions {
  ai_models_version?: string;
  commerce_seq?: number;
  /** Unix seconds when the local license cache was last refreshed. */
  license_cached_at?: number;
}

export interface BootstrapRequest {
  machine_id: string;
  /** Set true when the caller just obtained a fresh token (login / OAuth
   *  callback) to avoid the server minting a redundant new token. */
  skip_token_refresh?: boolean;
  known_versions?: BootstrapKnownVersions;
}

/** Options accepted by BootstrapService.bootstrap(). */
export interface BootstrapOptions {
  /** See BootstrapRequest.skip_token_refresh. */
  skipTokenRefresh?: boolean;
}

export interface BootstrapResponse {
  user: Record<string, any>;
  seqs: SyncSeqs;
  /** Present when client has no fresh license cache (>24h or never set). */
  license?: LicenseFeaturesResponse;
  /** Always present — small string the client compares against its cache. */
  ai_models_version: string;
  /** Present when server's commerce seq differs from the value client sent. */
  commerce?: CommerceConfig;
  /** Server-side wallclock for client clock skew correction. */
  server_time: number;
  /** Fresh JWT — bootstrap doubles as startup-time token refresh.
   *  Absent only if the server failed to mint a new token (old token stays valid). */
  token?: string;
  /** Server-configured auto-refresh interval in minutes, paired with token. */
  refresh_interval_minutes?: number;
}

/** What BootstrapService.bootstrap() resolves to. */
export interface BootstrapResult {
  user: Record<string, any>;
  seqs: SyncSeqs;
  /** Refresh interval the caller should pass to authService.startAutoRefresh. */
  refreshIntervalMinutes?: number;
  fromCache: {
    license: boolean;
    aiModels: boolean;
    commerce: boolean;
  };
}
