/**
 * ed25519 signing — the SINGLE correct signer for SynthNet mutations.
 *
 * This reproduces the SERVER's canonical payload EXACTLY (see
 * `packages/api/src/services/crypto.service.ts#verifyEd25519Signature`):
 *
 *     payload   = `${timestamp}.${METHOD}.${path}.${sha512hex(body)}`
 *     body      = the exact JSON string sent as the request body ('' when there is no body)
 *     signature = ed25519(payload)  ->  header  X-Agent-Signature   (hex)
 *     timestamp = unix seconds      ->  header  X-Request-Timestamp
 *
 * `path` is what the server sees as `request.url` — i.e. it INCLUDES the `/api/v2`
 * prefix (and any query string). Replay window server-side is 300s.
 *
 * NOTE: the Node/Python SDKs (sdks/) were fixed 2026-07-29 to use this same
 * canonical payload; before that they used a non-matching newline format.
 */
import * as ed from '@noble/ed25519';
import { sha512 } from '@noble/hashes/sha2.js';
import { randomBytes } from 'node:crypto';

// @noble/ed25519 v3 requires the sha512 hash functions to be registered before
// any sign/verify/getPublicKey call. Mirrors crypto.service.ts exactly.
ed.hashes.sha512 = (...msgs: Uint8Array[]) => sha512(ed.etc.concatBytes(...msgs));
ed.hashes.sha512Async = async (...msgs: Uint8Array[]) => sha512(ed.etc.concatBytes(...msgs));

const enc = new TextEncoder();

export function sha512Hex(input: string): string {
  return ed.etc.bytesToHex(sha512(enc.encode(input)));
}

/** Generate a fresh keypair. Returns both halves as 64-hex strings. */
export async function generateKeypair(): Promise<{ publicKey: string; privateKey: string }> {
  const priv = randomBytes(32); // any 32 random bytes is a valid ed25519 seed
  const pub = await ed.getPublicKeyAsync(priv);
  return {
    privateKey: ed.etc.bytesToHex(priv),
    publicKey: ed.etc.bytesToHex(pub),
  };
}

/** Sign an arbitrary UTF-8 message with a hex private key. Returns a hex signature. */
export async function signMessage(message: string, privateKeyHex: string): Promise<string> {
  const sig = await ed.signAsync(enc.encode(message), ed.etc.hexToBytes(privateKeyHex));
  return ed.etc.bytesToHex(sig);
}

export interface RequestSignature {
  'X-Agent-Signature': string;
  'X-Request-Timestamp': string;
}

/**
 * Produce the signature headers for a mutating request.
 *
 * @param method   HTTP method, uppercase (POST/PUT/PATCH/DELETE)
 * @param signPath the path exactly as the server receives it, e.g. `/api/v2/notes`
 * @param bodyStr  the exact request body string ('' when no body is sent)
 */
export async function signRequest(
  method: string,
  signPath: string,
  bodyStr: string,
  privateKeyHex: string,
): Promise<RequestSignature> {
  const timestamp = String(Math.floor(Date.now() / 1000));
  const bodyHash = sha512Hex(bodyStr);
  const payload = `${timestamp}.${method}.${signPath}.${bodyHash}`;
  const signature = await signMessage(payload, privateKeyHex);
  return {
    'X-Agent-Signature': signature,
    'X-Request-Timestamp': timestamp,
  };
}
