import Anthropic from "@anthropic-ai/sdk";

// ─────────────────────────────────────────────────────────────────────────────
// /api/explain — a focused, non-streaming explanation of one clicked pole/zero.
// POST { element: "pole" | "zero", value: { real, imag }, simState }
//   → { explanation: string }   (exactly two sentences, grounded in the system)
//
// Responses are cached in-memory keyed on (element, rounded value, simState hash)
// so re-clicking the same feature on the same system is a free cache hit.
// ─────────────────────────────────────────────────────────────────────────────

export const runtime = "nodejs";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// Module-level cache. Persists for the life of the server process (one instance).
const cache = new Map<string, string>();

// Small stable string hash (djb2) for the sim-state portion of the key.
function hash(str: string): string {
  let h = 5381;
  for (let i = 0; i < str.length; i++) h = (h * 33) ^ str.charCodeAt(i);
  return (h >>> 0).toString(36);
}

interface ExplainRequest {
  element: "pole" | "zero";
  value: { real: number; imag: number };
  simState: unknown;
}

export async function POST(req: Request) {
  let body: ExplainRequest;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { element, value, simState } = body;
  if (
    (element !== "pole" && element !== "zero") ||
    !value ||
    typeof value.real !== "number" ||
    typeof value.imag !== "number"
  ) {
    return Response.json({ error: "Bad request" }, { status: 400 });
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    return Response.json({ error: "Server missing ANTHROPIC_API_KEY" }, { status: 500 });
  }

  const key =
    `${element}|${value.real.toFixed(3)},${value.imag.toFixed(3)}|` +
    hash(JSON.stringify(simState));

  // Cache hit
  const cached = cache.get(key);
  if (cached) {
    return Response.json({ explanation: cached, cached: true });
  }

  const sj = value.imag >= 0 ? "+" : "-";
  const location = `${value.real.toFixed(3)} ${sj} ${Math.abs(value.imag).toFixed(3)}j`;

  try {
    const msg = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 160,
      system:
        "You explain a single pole or zero of a control system in EXACTLY two sentences. " +
        "Be intuitive and concrete about what it contributes to THIS system's behaviour — " +
        "speed, damping, oscillation, dominance, or stability — and tie it to the system's " +
        "actual response where relevant. No formulas, no preamble, no lists: just two sentences.",
      messages: [
        {
          role: "user",
          content:
            `The student clicked the ${element} at s = ${location} on the pole-zero map.\n\n` +
            `Current system state:\n${JSON.stringify(simState)}\n\n` +
            `In exactly two sentences, explain what THIS ${element} means for THIS system.`,
        },
      ],
    });

    const explanation = msg.content
      .filter((b) => b.type === "text")
      .map((b) => (b.type === "text" ? b.text : ""))
      .join(" ")
      .trim();

    cache.set(key, explanation);
    return Response.json({ explanation, cached: false });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Model error";
    return Response.json({ error: message }, { status: 500 });
  }
}
