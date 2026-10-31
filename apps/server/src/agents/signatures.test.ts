import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import { test } from "node:test";
import {
  createNonceStore,
  jwkThumbprint,
  signRequest,
  verifyRequest,
  type Ed25519Jwk,
  type NonceStore,
} from "./signatures.js";

const url = "http://localhost:8787/mcp";
const body = '{"jsonrpc":"2.0","id":1,"method":"tools/list"}';

function agent() {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  const keyId = jwkThumbprint(publicKey.export({ format: "jwk" }) as Ed25519Jwk);
  return { publicKey, privateKey, keyId };
}

function check(headers: Record<string, string>, opts: { a: ReturnType<typeof agent>; body?: string; now?: number; nonces?: NonceStore }) {
  return verifyRequest({
    method: "POST",
    url,
    body: opts.body ?? body,
    header: (name) => headers[name],
    lookupKey: (id) => (id === opts.a.keyId ? opts.a.publicKey : undefined),
    nonces: opts.nonces ?? createNonceStore(),
    now: opts.now,
  });
}

test("a correctly signed request verifies", () => {
  const a = agent();
  const headers = signRequest({ method: "POST", url, body, privateKey: a.privateKey, keyId: a.keyId });
  assert.deepEqual(check(headers, { a }), { ok: true, keyId: a.keyId });
});

test("changing the body after signing is rejected", () => {
  const a = agent();
  const headers = signRequest({ method: "POST", url, body, privateKey: a.privateKey, keyId: a.keyId });
  assert.deepEqual(check(headers, { a, body: body.replace("tools/list", "tools/call") }), {
    ok: false,
    reason: "body_digest_mismatch",
  });
});

test("a signature from a different key is rejected", () => {
  const a = agent();
  const impostor = agent();
  const headers = signRequest({ method: "POST", url, body, privateKey: impostor.privateKey, keyId: a.keyId });
  assert.deepEqual(check(headers, { a }), { ok: false, reason: "bad_signature" });
});

test("an expired signature is rejected", () => {
  const a = agent();
  const headers = signRequest({ method: "POST", url, body, privateKey: a.privateKey, keyId: a.keyId, ttlSeconds: 60 });
  assert.deepEqual(check(headers, { a, now: Date.now() + 120_000 }), { ok: false, reason: "signature_expired" });
});

test("replaying the same signed request is rejected", () => {
  const a = agent();
  const nonces = createNonceStore();
  const headers = signRequest({ method: "POST", url, body, privateKey: a.privateKey, keyId: a.keyId });
  assert.equal(check(headers, { a, nonces }).ok, true);
  assert.deepEqual(check(headers, { a, nonces }), { ok: false, reason: "replayed_nonce" });
});

test("an unregistered key is rejected", () => {
  const a = agent();
  const stranger = agent();
  const headers = signRequest({ method: "POST", url, body, privateKey: stranger.privateKey, keyId: stranger.keyId });
  assert.deepEqual(check(headers, { a }), { ok: false, reason: "unknown_key" });
});
