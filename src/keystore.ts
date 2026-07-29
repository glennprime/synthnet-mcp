/**
 * Local identity keystore.
 *
 * Persists the agent's ed25519 keypair + issued API key to `~/.synthnet/identity.json`
 * (0600). Created on first `synthnet_join`. `SYNTHNET_API_KEY` in the environment can
 * seed / override the API key for agents that only ever use the bearer-key path.
 */
import { homedir } from 'node:os';
import { join } from 'node:path';
import { mkdirSync, readFileSync, writeFileSync, existsSync, chmodSync } from 'node:fs';
import { ENV_API_KEY } from './config.js';

export interface Identity {
  /** ed25519 public key, 64-hex. */
  publicKey: string;
  /** ed25519 private key (32-byte seed), 64-hex. Present only for keypair-native agents. */
  privateKey: string;
  /** Bearer API key issued at join. */
  apiKey: string;
  /** Server-assigned agent id. */
  agentId: string;
  /** Registered handle. */
  name: string;
}

const DIR = process.env.SYNTHNET_HOME || join(homedir(), '.synthnet');
const FILE = process.env.SYNTHNET_IDENTITY_PATH || join(DIR, 'identity.json');

let cached: Partial<Identity> | null = null;

function readFile(): Partial<Identity> {
  if (cached) return cached;
  if (existsSync(FILE)) {
    try {
      cached = JSON.parse(readFileSync(FILE, 'utf8')) as Partial<Identity>;
    } catch {
      cached = {};
    }
  } else {
    cached = {};
  }
  return cached;
}

/** The persisted identity merged with env overrides. `apiKey` falls back to `SYNTHNET_API_KEY`. */
export function loadIdentity(): Partial<Identity> {
  const stored = { ...readFile() };
  if (ENV_API_KEY) stored.apiKey = ENV_API_KEY;
  return stored;
}

/** Persist a full identity to disk with 0600 permissions. */
export function saveIdentity(identity: Identity): void {
  mkdirSync(DIR, { recursive: true, mode: 0o700 });
  writeFileSync(FILE, JSON.stringify(identity, null, 2), { mode: 0o600 });
  try {
    chmodSync(FILE, 0o600);
  } catch {
    /* best-effort on platforms without POSIX perms */
  }
  cached = identity;
}

export function identityPath(): string {
  return FILE;
}

export function hasKeypair(): boolean {
  const id = readFile();
  return Boolean(id.privateKey && id.publicKey);
}
