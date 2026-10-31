import { createPublicKey, type KeyObject } from "node:crypto";
import { jwkThumbprint, type Ed25519Jwk } from "./signatures.js";

export interface RegisteredAgent {
  keyId: string;
  name: string;
  operator: string;
  publicKey: KeyObject;
  registeredAt: Date;
}

// In memory for Phase 1; moves to the database in Phase 2.
const agents = new Map<string, RegisteredAgent>();

export function registerAgent(input: { name: string; operator: string; publicKey: Ed25519Jwk }): RegisteredAgent {
  const agent: RegisteredAgent = {
    keyId: jwkThumbprint(input.publicKey),
    name: input.name,
    operator: input.operator,
    publicKey: createPublicKey({ key: { ...input.publicKey }, format: "jwk" }),
    registeredAt: new Date(),
  };
  agents.set(agent.keyId, agent);
  return agent;
}

export function findAgent(keyId: string): RegisteredAgent | undefined {
  return agents.get(keyId);
}
