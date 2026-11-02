// The customer's assistant as a real AI agent (Ava, unless they linked another):
// Gemini decides what to do, and every action goes through the store's MCP tools,
// so Doorman judges it like any other agent.
import { generateText, stepCountIs, tool } from "ai";
import { z } from "zod";
import { fastest, model } from "../ai/model.js";
import type { StoreAgent } from "./agent-client.js";

export interface TranscriptEntry {
  at: string;
  from: "customer" | "assistant" | "store";
  text: string;
  tool?: string;
  ok?: boolean;
  // Set on a successful checkout, so the dashboard can show when the customer pays.
  orderId?: string;
}

export interface Assistant {
  name: string;
  operator: string;
  // The customer's name from Log in with PayPal, if one is linked.
  customer: string | null;
}

function system({ name, operator, customer }: Assistant): string {
  const firstName = customer?.split(" ")[0] ?? "your user";
  return `You are ${name}, a shopping assistant made by ${operator}. You shop for your user, ${customer ?? "a customer"}, using a store's tools.
Respect the store: if a tool refuses and gives a reason, adjust (for example, buy fewer) or stop. Never retry the same refused action.
Checkout gives you an approvalUrl: ${firstName} must open it and approve the payment in PayPal; nothing is charged before that.
Finish with a short, friendly message to ${firstName} that includes the approvalUrl exactly as given.`;
}

export const SHOPPING_TASK =
  "Static Supply is dropping the Night Shift Hoodie today. Get me two in size M, one for me and one for my brother, as long as each is under $100. Send me the link to approve.";

// "failed_early" means the AI never reached the store, so a scripted run can stand in.
export type AssistantOutcome = "done" | "failed_early" | "failed_midway";

export async function runAssistant(agent: StoreAgent, who: Assistant, transcript: TranscriptEntry[]): Promise<AssistantOutcome> {
  const say = (entry: Omit<TranscriptEntry, "at">) => transcript.push({ at: new Date().toISOString(), ...entry });
  let storeCalls = 0;

  // Each tool forwards to the store over MCP and records what the store said.
  const storeTool = <S extends z.ZodType>(name: string, description: string, inputSchema: S) =>
    tool({
      description,
      inputSchema,
      execute: async (args: z.infer<S>) => {
        storeCalls++;
        const { ok, data } = await agent.call(name, args as Record<string, unknown>);
        const orderId = typeof data.orderId === "string" ? data.orderId : undefined;
        say({ from: "store", tool: name, ok, text: JSON.stringify({ request: args, response: data }), ...(orderId ? { orderId } : {}) });
        return data;
      },
    });

  say({ from: "customer", text: SHOPPING_TASK });
  try {
    const result = await generateText({
      model: model("fast"),
      system: system(who),
      prompt: SHOPPING_TASK,
      tools: {
        search_products: storeTool("search_products", "Search the store's products by name", z.object({ query: z.string().optional() })),
        add_to_cart: storeTool(
          "add_to_cart",
          "Put a product in a new cart; returns a cartId",
          z.object({ productId: z.string(), quantity: z.number().int().min(1).max(5), size: z.enum(["S", "M", "L", "XL"]).optional() }),
        ),
        checkout: storeTool("checkout", "Check out a cart; returns an approvalUrl for the customer", z.object({ cartId: z.string() })),
      },
      stopWhen: stepCountIs(10),
      providerOptions: fastest,
      abortSignal: AbortSignal.timeout(120_000),
    });
    say({ from: "assistant", text: result.text.trim() || `(${who.name} finished without a message.)` });
    return "done";
  } catch (err) {
    console.warn(`[sim] AI ${who.name} stopped early:`, err instanceof Error ? err.message : err);
    say({ from: "assistant", text: `(${who.name} stopped before finishing. The steps above still happened.)` });
    return storeCalls === 0 ? "failed_early" : "failed_midway";
  }
}
