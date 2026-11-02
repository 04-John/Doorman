// Agent request signing, following RFC 9421 (HTTP Message Signatures) with
// Ed25519 keys and JWK-thumbprint key IDs, the same shape Web Bot Auth uses.
// Every signed request covers its method, host, path and a digest of its body,
// so a signature can't be lifted onto a different request.
import { createHash, randomUUID, sign, verify, type KeyObject } from "node:crypto";

export const SIGNATURE_TAG = "web-bot-auth";
const COVERED = ['"@method"', '"@authority"', '"@path"', '"content-digest"'];
const MAX_LIFETIME_SECONDS = 300;
const CLOCK_SKEW_SECONDS = 5;

export interface Ed25519Jwk {
  kty: "OKP";
  crv: "Ed25519";
  x: string;
}

// RFC 7638: SHA-256 over the required members in lexicographic order.
export function jwkThumbprint(jwk: Ed25519Jwk): string {
  const canonical = JSON.stringify({ crv: jwk.crv, kty: jwk.kty, x: jwk.x });
  return createHash("sha256").update(canonical).digest("base64url");
}

export function contentDigest(body: string): string {
  return `sha-256=:${createHash("sha256").update(body).digest("base64")}:`;
}

function signatureBase(p: { method: string; authority: string; path: string; digest: string; params: string }): string {
  return [
    `"@method": ${p.method.toUpperCase()}`,
    `"@authority": ${p.authority.toLowerCase()}`,
    `"@path": ${p.path}`,
    `"content-digest": ${p.digest}`,
    `"@signature-params": ${p.params}`,
  ].join("\n");
}

export interface SignInput {
  method: string;
  url: string;
  body: string;
  privateKey: KeyObject;
  keyId: string;
  now?: number;
  ttlSeconds?: number;
}

export function signRequest({ method, url, body, privateKey, keyId, now = Date.now(), ttlSeconds = 60 }: SignInput) {
  const { host, pathname } = new URL(url);
  const created = Math.floor(now / 1000);
  const params =
    `(${COVERED.join(" ")});created=${created};expires=${created + ttlSeconds}` +
    `;keyid="${keyId}";alg="ed25519";nonce="${randomUUID()}";tag="${SIGNATURE_TAG}"`;
  const digest = contentDigest(body);
  const base = signatureBase({ method, authority: host, path: pathname, digest, params });
  const signature = sign(null, Buffer.from(base), privateKey).toString("base64");
  return {
    "content-digest": digest,
    "signature-input": `sig1=${params}`,
    signature: `sig1=:${signature}:`,
  };
}

export interface NonceStore {
  // Returns false if the nonce was already used (a replay).
  claim(nonce: string, expiresAt: number): boolean;
}

// Nonces are remembered until their signature expires (5 minutes at most).
// Expired ones are cleared every few seconds rather than on every request, and
// past `max` the oldest go first: under a flood that only shortens how long an
// old nonce is remembered, it never lets the server run out of memory.
export function createNonceStore(max = 200_000): NonceStore {
  const seen = new Map<string, number>();
  let lastSweep = 0;
  return {
    claim(nonce, expiresAt) {
      const now = Date.now();
      if (now - lastSweep > 5_000) {
        lastSweep = now;
        for (const [n, exp] of seen) if (exp < now) seen.delete(n);
      }
      if (seen.has(nonce)) return false;
      seen.set(nonce, expiresAt);
      if (seen.size > max) seen.delete(seen.keys().next().value!);
      return true;
    },
  };
}

export type VerifyResult = { ok: true; keyId: string } | { ok: false; reason: string };

export interface VerifyInput {
  method: string;
  url: string;
  body: string;
  header: (name: string) => string | null | undefined;
  lookupKey: (keyId: string) => KeyObject | undefined;
  nonces: NonceStore;
  now?: number;
}

export function hasSignature(header: VerifyInput["header"]): boolean {
  return Boolean(header("signature") || header("signature-input"));
}

export function verifyRequest({ method, url, body, header, lookupKey, nonces, now = Date.now() }: VerifyInput): VerifyResult {
  const input = header("signature-input");
  const signature = header("signature");
  const digest = header("content-digest");
  if (!input || !signature || !digest) return { ok: false, reason: "missing_signature_headers" };

  const inputMatch = /^sig1=(\([^)]*\))((?:;[a-z]+=(?:"[^"]*"|\d+))*)$/.exec(input.trim());
  if (!inputMatch) return { ok: false, reason: "malformed_signature_input" };
  const [, components = "", paramText = ""] = inputMatch;
  if (components !== `(${COVERED.join(" ")})`) return { ok: false, reason: "wrong_covered_components" };

  const params = new Map<string, string>();
  for (const m of paramText.matchAll(/;([a-z]+)=(?:"([^"]*)"|(\d+))/g)) params.set(m[1]!, m[2] ?? m[3]!);

  const created = Number(params.get("created"));
  const expires = Number(params.get("expires"));
  const keyId = params.get("keyid");
  const nonce = params.get("nonce");
  const nowSeconds = Math.floor(now / 1000);
  if (params.get("alg") !== "ed25519") return { ok: false, reason: "unsupported_alg" };
  if (params.get("tag") !== SIGNATURE_TAG) return { ok: false, reason: "wrong_tag" };
  if (!keyId || !nonce || !created || !expires) return { ok: false, reason: "missing_signature_params" };
  if (created > nowSeconds + CLOCK_SKEW_SECONDS) return { ok: false, reason: "created_in_future" };
  if (expires <= nowSeconds) return { ok: false, reason: "signature_expired" };
  if (expires - created > MAX_LIFETIME_SECONDS) return { ok: false, reason: "lifetime_too_long" };

  if (digest !== contentDigest(body)) return { ok: false, reason: "body_digest_mismatch" };

  const key = lookupKey(keyId);
  if (!key) return { ok: false, reason: "unknown_key" };

  const sigMatch = /^sig1=:([A-Za-z0-9+/]+=*):$/.exec(signature.trim());
  if (!sigMatch) return { ok: false, reason: "malformed_signature" };

  const { host, pathname } = new URL(url);
  const base = signatureBase({ method, authority: host, path: pathname, digest, params: inputMatch[1] + paramText });
  if (!verify(null, Buffer.from(base), key, Buffer.from(sigMatch[1]!, "base64"))) {
    return { ok: false, reason: "bad_signature" };
  }

  // Only burn the nonce once everything else checks out.
  if (!nonces.claim(nonce, expires * 1000)) return { ok: false, reason: "replayed_nonce" };
  return { ok: true, keyId };
}
