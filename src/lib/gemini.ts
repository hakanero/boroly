import { ApiError, GoogleGenAI } from "@google/genai";
import type { z } from "zod";
import { toGeminiSchema } from "./schemas";

let client: GoogleGenAI | null = null;

export const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-3.1-flash-lite";
/** Used when the main model is overloaded; also cheap. */
const FALLBACK_MODEL = process.env.GEMINI_FALLBACK_MODEL || "gemini-3.5-flash-lite";

function gemini() {
  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY is not set. Add it to .env.local.");
  client ??= new GoogleGenAI({ apiKey });
  return client;
}

/** One Gemini call constrained to a JSON schema, then validated with zod. Retries when Gemini is busy. */
export async function generateJson<T extends z.ZodType>(
  schema: T,
  system: string,
  prompt: string,
): Promise<z.infer<T>> {
  const attempts = [GEMINI_MODEL, GEMINI_MODEL, FALLBACK_MODEL, FALLBACK_MODEL];
  let lastErr: unknown;
  for (const [i, model] of attempts.entries()) {
    try {
      return await callOnce(model, schema, system, prompt);
    } catch (err) {
      lastErr = err;
      const busy = err instanceof ApiError && (err.status === 429 || err.status >= 500);
      if (!busy) throw err;
      console.warn(`[gemini] ${model} busy (${(err as ApiError).status}), retrying`);
      await new Promise((r) => setTimeout(r, 800 * (i + 1)));
    }
  }
  console.error("[gemini] giving up:", lastErr);
  throw new Error("The AI is overloaded right now. Give it a minute and try again.");
}

async function callOnce<T extends z.ZodType>(model: string, schema: T, system: string, prompt: string): Promise<z.infer<T>> {
  const res = await gemini().models.generateContent({
    model,
    contents: prompt,
    config: {
      systemInstruction: system,
      responseMimeType: "application/json",
      responseJsonSchema: toGeminiSchema(schema),
      temperature: 0.6,
    },
  });
  const u = res.usageMetadata;
  console.log(
    `[gemini] ${model} in=${u?.promptTokenCount ?? 0} out=${u?.candidatesTokenCount ?? 0} thinking=${u?.thoughtsTokenCount ?? 0}`,
  );
  const text = res.text;
  if (!text) throw new Error("Gemini returned an empty response.");
  const raw = JSON.parse(text);
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    console.warn("Gemini output failed validation, using raw output:", parsed.error.issues.slice(0, 3));
    return raw as z.infer<T>;
  }
  return parsed.data;
}
