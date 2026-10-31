import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { env } from "../env.js";

const google = env.GEMINI_API_KEY ? createGoogleGenerativeAI({ apiKey: env.GEMINI_API_KEY }) : null;

export const aiEnabled = google !== null;

// "smart" writes explanations and rules; "fast" drives the demo agent, which
// makes several calls in a row and needs to keep up with the drop.
export function model(kind: "smart" | "fast" = "smart") {
  if (!google) throw new Error("GEMINI_API_KEY is not set");
  return google(kind === "fast" ? env.GEMINI_FAST_MODEL : env.GEMINI_MODEL);
}

// Short, factual tasks don't need long thinking; this keeps answers quick and
// inside the free tier.
export const quick = { google: { thinkingConfig: { thinkingLevel: "low" as const } } };
export const fastest = { google: { thinkingConfig: { thinkingLevel: "minimal" as const } } };
