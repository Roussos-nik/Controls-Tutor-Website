import Anthropic from "@anthropic-ai/sdk";

// ─────────────────────────────────────────────────────────────────────────────
// /api/tutor — Socratic controls tutor with tool use.
// POST { message, simState, history } → streams an NDJSON event stream:
//   {"type":"text","value":"..."}                         ← text delta
//   {"type":"tool_use","id":..,"name":"apply_gains","input":{...}}  ← tool call
//   {"type":"error","message":"..."}                      ← failure
//
// Each event is one JSON object per line (newline-delimited). The frontend
// parses these to interleave streamed text with an "Apply gains" card.
// ─────────────────────────────────────────────────────────────────────────────

export const runtime = "nodejs";
export const maxDuration = 60;

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

const PERSONA = `You are a Socratic tutor for classical control systems, embedded in an interactive simulator the student is looking at right now. The student sees: a step-response plot, a Bode plot (magnitude + phase), a pole-zero map, a root-locus plot, and a strip of metrics (phase margin, gain margin, bandwidth, overshoot, settling time, steady-state error).

Your teaching style:
- INTUITION FIRST. Lead with the physical/visual meaning, not the algebra. "Notice the poles near the imaginary axis — that's why the response rings" beats writing the characteristic equation.
- REFERENCE WHAT THEY SEE. You are given the exact current state of their simulator. Point to it: their actual overshoot, their actual pole locations, the curve in front of them. Make the lesson about THEIR system, not a generic textbook one.
- ASK, DON'T DUMP. Guide with questions that lead the student to the insight. Prefer one good question over a wall of explanation.
- NEVER just dump formulas. A formula is the last step, offered only after the intuition lands, and always tied back to what it means for their plots.
- BE CONCISE. Short, conversational turns.

PROPOSING GAIN CHANGES — use the apply_gains tool:
When you recommend CONCRETE numeric gain values (specific Kp, Ki, and/or Kd), call the apply_gains tool so the student can apply them with one click. Still explain the intuition in your text first; the tool is the actionable companion to your explanation, not a replacement for it. Only include the gains you actually want to change, and always give a short reasoning. Do not call the tool for vague advice ("try increasing Kp a bit") — only when you have specific numbers in mind.`;

// In exercise mode the tutor must NOT solve the problem for the student.
function exercisePersona(ex: NonNullable<TutorRequest["exercise"]>): string {
  return `You are running a guided control-systems EXERCISE. The student must reach the goal THEMSELVES — your job is to coach, never to solve.

THE CHALLENGE: "${ex.title}"
${ex.description}
SUCCESS CRITERIA:
${ex.criteria.map((c) => `  - ${c}`).join("\n")}

STRICT RULES FOR EXERCISE MODE:
- NEVER state specific gain values or hand over the solution. Not even as a hint, not even if asked directly, not even "around" a value. If the student begs for the answer, gently refuse and ask a guiding question instead.
- Give ONLY Socratic hints: questions and conceptual nudges that help the student reason about which knob to turn and why. Reference what they see (their current overshoot, poles, margins).
- Lead with intuition. Keep every turn short — one or two sentences and usually one question.
- ${ex.complete
    ? "The student has JUST MET all the success criteria — congratulate them warmly and briefly, and point out what they did well."
    : "The criteria are not yet met. Nudge them toward the next improvement without revealing the values."}
- Do not use any tools in exercise mode.`;
}

// Tool definition. `type: "object" as const` keeps the literal so the object
// structurally satisfies the SDK's tool type without naming it explicitly.
const APPLY_GAINS_TOOL = {
  name: "apply_gains",
  description:
    "Propose concrete PID gain values for the student to apply to their controller with one click. Use whenever you recommend specific numeric Kp, Ki, and/or Kd values. Include only the gains you want to change; omit any that should stay as they are. Always include a brief reasoning.",
  input_schema: {
    type: "object" as const,
    properties: {
      Kp: { type: "number", description: "Proposed proportional gain (omit to leave unchanged)" },
      Ki: { type: "number", description: "Proposed integral gain (omit to leave unchanged)" },
      Kd: { type: "number", description: "Proposed derivative gain (omit to leave unchanged)" },
      reasoning: {
        type: "string",
        description:
          "One or two sentences on why these values help, referencing what the student sees (their overshoot, poles, margins, etc.).",
      },
    },
    required: ["reasoning"],
  },
};

interface TutorRequest {
  message: string;
  simState: unknown;
  history?: { role: "user" | "assistant"; content: string }[];
  exercise?: {
    title: string;
    description: string;
    criteria: string[];
    complete: boolean;
  };
}

export async function POST(req: Request) {
  let body: TutorRequest;
  try {
    body = await req.json();
  } catch {
    return new Response("Invalid JSON body", { status: 400 });
  }

  const { message, simState, history = [], exercise } = body;

  if (!message || typeof message !== "string") {
    return new Response("Missing 'message'", { status: 400 });
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    return new Response("Server is missing ANTHROPIC_API_KEY", { status: 500 });
  }

  const inExercise = !!exercise;
  const personaText = inExercise ? exercisePersona(exercise!) : PERSONA;

  // System prompt: persona (static, cached) + sim state (cached when unchanged).
  const system: Anthropic.TextBlockParam[] = [
    { type: "text", text: personaText, cache_control: { type: "ephemeral" } },
    {
      type: "text",
      text:
        "Here is the EXACT current state of the student's simulator. " +
        "Ground your answer in these specific numbers and pole locations:\n\n" +
        JSON.stringify(simState, null, 2),
      cache_control: { type: "ephemeral" },
    },
  ];

  const messages: Anthropic.MessageParam[] = [
    ...history.map((h) => ({ role: h.role, content: h.content })),
    { role: "user" as const, content: message },
  ];

  const encoder = new TextEncoder();
  const emit = (
    controller: ReadableStreamDefaultController,
    obj: unknown
  ) => controller.enqueue(encoder.encode(JSON.stringify(obj) + "\n"));

  const stream = new ReadableStream({
    async start(controller) {
      try {
        const claudeStream = client.messages.stream({
          model: "claude-sonnet-4-6",
          max_tokens: 1024,
          system,
          messages,
          // No tools in exercise mode — the tutor must not hand over gains.
          ...(inExercise ? {} : { tools: [APPLY_GAINS_TOOL] }),
        });

        // Accumulate tool-call JSON per content-block index as it streams.
        const toolAcc: Record<number, { id: string; name: string; json: string }> = {};

        for await (const ev of claudeStream as any) {
          if (ev.type === "content_block_start" && ev.content_block?.type === "tool_use") {
            toolAcc[ev.index] = { id: ev.content_block.id, name: ev.content_block.name, json: "" };
          } else if (ev.type === "content_block_delta") {
            if (ev.delta?.type === "text_delta") {
              emit(controller, { type: "text", value: ev.delta.text });
            } else if (ev.delta?.type === "input_json_delta") {
              if (toolAcc[ev.index]) toolAcc[ev.index].json += ev.delta.partial_json;
            }
          } else if (ev.type === "content_block_stop") {
            const t = toolAcc[ev.index];
            if (t) {
              let input: unknown = {};
              try { input = JSON.parse(t.json || "{}"); } catch { /* ignore */ }
              emit(controller, { type: "tool_use", id: t.id, name: t.name, input });
              delete toolAcc[ev.index];
            }
          }
        }
        controller.close();
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Unknown error from model";
        emit(controller, { type: "error", message: msg });
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
