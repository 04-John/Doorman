import assert from "node:assert/strict";
import { test } from "node:test";
import { finishCheckout, type StoreCaller, type TranscriptEntry } from "./ava-ai.js";

type Answer = { ok: boolean; data: Record<string, unknown> };

// A stand-in for a demo agent: answers each store call from a script and remembers it.
function fakeAgent(answers: Record<string, Answer>) {
  const calls: { tool: string; args: Record<string, unknown> }[] = [];
  const agent: StoreCaller = {
    call: async (tool, args = {}) => {
      calls.push({ tool, args });
      return answers[tool] ?? { ok: false, data: { error: "unexpected call" } };
    },
  };
  return { agent, calls };
}

const cartMade = (cartId: string): TranscriptEntry => ({
  at: "2026-11-03T11:04:27Z",
  from: "store",
  tool: "add_to_cart",
  ok: true,
  text: JSON.stringify({ request: { productId: "hoodie", quantity: 1 }, response: { cartId } }),
});

test("finishes the checkout of the cart the AI already made", async () => {
  const transcript: TranscriptEntry[] = [{ at: "2026-11-03T11:02:30Z", from: "customer", text: "Get me a hoodie" }, cartMade("cart-1")];
  const { agent, calls } = fakeAgent({ checkout: { ok: true, data: { orderId: "order-1", approvalUrl: "https://shop.example/approve/abc" } } });

  assert.equal(await finishCheckout(agent, "Juniper", transcript, "hoodie"), true);
  assert.deepEqual(calls, [{ tool: "checkout", args: { cartId: "cart-1" } }]);
  assert.equal(transcript.at(-2)?.orderId, "order-1");
  assert.equal(transcript.at(-1)?.from, "assistant");
  assert.match(transcript.at(-1)!.text, /finished the checkout for Juniper\.\) Approve it here: https:\/\/shop\.example\/approve\/abc$/);
});

test("makes a cart first when the AI never got that far", async () => {
  const transcript: TranscriptEntry[] = [];
  const { agent, calls } = fakeAgent({
    add_to_cart: { ok: true, data: { cartId: "cart-2" } },
    checkout: { ok: true, data: { approvalUrl: "https://shop.example/approve/def" } },
  });

  assert.equal(await finishCheckout(agent, "Ava", transcript, "hoodie"), true);
  assert.deepEqual(calls, [
    { tool: "add_to_cart", args: { productId: "hoodie", quantity: 1, size: "M" } },
    { tool: "checkout", args: { cartId: "cart-2" } },
  ]);
  // The customer's request goes first, so the conversation still reads in order.
  assert.deepEqual(
    transcript.map((e) => e.from),
    ["customer", "store", "store", "assistant"],
  );
});

test("a refused cart means no checkout, and the conversation says so", async () => {
  const transcript: TranscriptEntry[] = [];
  const { agent, calls } = fakeAgent({ add_to_cart: { ok: false, data: { reason: "The drop isn't open" } } });

  assert.equal(await finishCheckout(agent, "Milo", transcript, "hoodie"), false);
  assert.deepEqual(
    calls.map((c) => c.tool),
    ["add_to_cart"],
  );
  assert.match(transcript.at(-1)!.text, /store turned down the demo's checkout/);
});
