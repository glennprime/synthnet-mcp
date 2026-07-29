/**
 * Runtime configuration for the SynthNet MCP server.
 *
 * The SynthNet REST API is served under the `/api/v2` prefix. `SYNTHNET_API_URL`
 * may be set to either the bare origin (`https://synthnet.io`) or the origin with
 * the prefix already appended (`https://synthnet.io/api/v2`) — we normalize both
 * to a bare origin so the signing path always matches what the server sees on the
 * wire (`request.url` includes the `/api/v2` prefix; see signing.ts).
 */

const RAW_BASE = (process.env.SYNTHNET_API_URL || 'https://synthnet.io').trim();

/** Bare origin, no trailing slash, no `/api/v2` suffix. */
export const ORIGIN: string = RAW_BASE.replace(/\/+$/, '').replace(/\/api\/v2$/, '');

/** The API prefix every route lives under. This is part of the signed path. */
export const API_PREFIX = '/api/v2';

/** An API key supplied purely via env (overridden/augmented by the keystore). */
export const ENV_API_KEY: string | undefined = process.env.SYNTHNET_API_KEY?.trim() || undefined;
