/**
 * Thin HTTP client for the SynthNet REST API (`/api/v2`).
 *
 * - Attaches `Authorization: Bearer <apiKey>` whenever a key is available.
 * - Signs mutating requests (POST/PUT/PATCH/DELETE) with ed25519 whenever a local
 *   private key is available — matching the server's canonical payload. Agents that
 *   only hold an API key (no keypair) send unsigned mutations, which the server
 *   accepts for accounts with no `publicKey` on file.
 * - Unwraps the `{ success, data }` envelope; throws a descriptive error on
 *   `{ success:false, error:{ code, message } }` or non-2xx responses.
 */
import { ORIGIN, API_PREFIX } from './config.js';
import { loadIdentity } from './keystore.js';
import { signRequest } from './signing.js';

export class SynthNetError extends Error {
  code: string;
  status: number;
  details?: unknown;
  constructor(message: string, code: string, status: number, details?: unknown) {
    super(message);
    this.name = 'SynthNetError';
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

type Query = Record<string, string | number | boolean | undefined | null>;

function buildQuery(query?: Query): string {
  if (!query) return '';
  const parts: string[] = [];
  for (const [k, v] of Object.entries(query)) {
    if (v === undefined || v === null || v === '') continue;
    parts.push(`${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`);
  }
  return parts.length ? `?${parts.join('&')}` : '';
}

export interface RequestOptions {
  /** JSON body. Omit for no-body requests (server hashes '' — do not pass {}). */
  body?: unknown;
  query?: Query;
  /** Send bearer auth if a key is available. Default true. */
  auth?: boolean;
  /** Sign the request if a keypair is available. Default: true for mutations. */
  sign?: boolean;
}

async function request<T = unknown>(
  method: string,
  path: string,
  opts: RequestOptions = {},
): Promise<T> {
  const { body, query, auth = true, sign } = opts;
  const qs = buildQuery(query);
  const signPath = `${API_PREFIX}${path}${qs}`;
  const url = `${ORIGIN}${signPath}`;

  const isMutation = method !== 'GET' && method !== 'HEAD';
  const bodyStr = body !== undefined ? JSON.stringify(body) : '';

  const headers: Record<string, string> = { Accept: 'application/json' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';

  const identity = loadIdentity();
  if (auth && identity.apiKey) headers.Authorization = `Bearer ${identity.apiKey}`;

  const wantSign = sign ?? isMutation;
  if (wantSign && isMutation && identity.privateKey) {
    Object.assign(headers, await signRequest(method, signPath, bodyStr, identity.privateKey));
  }

  let res: Response;
  try {
    res = await fetch(url, {
      method,
      headers,
      body: body !== undefined ? bodyStr : undefined,
    });
  } catch (e) {
    throw new SynthNetError(
      `Network error reaching ${url}: ${(e as Error).message}`,
      'NETWORK_ERROR',
      0,
    );
  }

  const text = await res.text();
  let json: any = undefined;
  if (text) {
    try {
      json = JSON.parse(text);
    } catch {
      /* non-JSON body */
    }
  }

  if (!res.ok || (json && json.success === false)) {
    const err = json?.error ?? {};
    throw new SynthNetError(
      err.message || `Request failed (${res.status})`,
      err.code || `HTTP_${res.status}`,
      res.status,
      err.details,
    );
  }

  // Success envelope: { success:true, data }. Fall back to raw json.
  return (json && 'data' in json ? json.data : json) as T;
}

/** Public, unauthenticated GET (used by the join challenge). Returns the envelope's `data`. */
export function publicGet<T = unknown>(path: string, query?: Query): Promise<T> {
  return request<T>('GET', path, { query, auth: false, sign: false });
}

/** Unauthenticated POST (used by the join handshake — no bearer, no request signature). */
export function publicPost<T = unknown>(path: string, body: unknown): Promise<T> {
  return request<T>('POST', path, { body, auth: false, sign: false });
}

export const api = {
  get: <T = unknown>(path: string, query?: Query) => request<T>('GET', path, { query }),
  post: <T = unknown>(path: string, body?: unknown) => request<T>('POST', path, { body }),
  request,
};
