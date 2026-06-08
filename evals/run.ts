import { config } from "dotenv";
config({ path: ".env.local" });
import Anthropic from "@anthropic-ai/sdk";
import * as fs from "fs";
import * as path from "path";

// ─────────────────────────────────────────────────────────────────────────────
// evals/run.ts — run the tutor against each scenario, judge with Claude, score.
//
//   Prereqs:
//     • dev server running:  npm run dev   (so /api/tutor is live)
//     • ANTHROPIC_API_KEY in the environment (the judge call uses it)
//   Run:
//     npx tsx evals/run.ts          (or: npx ts-node evals/run.ts)
//
//   Optional env:
//     TUTOR_URL    base URL of the app (default http://localhost:3000)
//     JUDGE_MODEL  model for the judge (default claude-sonnet-4-6)
// ─────────────────────────────────────────────────────────────────────────────

const TUTOR_URL = process.env.TUTOR_URL ?? "http://localhost:3000";
const JUDGE_MODEL = process.env.JUDGE_MODEL ?? "claude-sonnet-4-6";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

interface Rubric {
  criteria: string[];
  expectsTool?: boolean;
  notes?: string;
}
interface Scenario {
  id: string;
  title: string;
  simState: unknown;
  userMessage: string;
  rubric: Rubric;
}

// ── Call the tutor endpoint, collect text + any tool calls ────────────────────
async function callTutor(scenario: Scenario): Promise<string> {
  const res = await fetch(`${TUTOR_URL}/api/tutor`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      message: scenario.userMessage,
      simState: scenario.simState,
      history: [],
    }),
  });
  if (!res.ok || !res.body) {
    throw new Error(`tutor responded ${res.status}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  let text = "";
  const toolCalls: string[] = [];

  const handle = (ev: any) => {
    if (ev.type === "text") text += ev.value;
    else if (ev.type === "tool_use") {
      toolCalls.push(
        `[used tool '${ev.name}' with input ${JSON.stringify(ev.input)}]`
      );
    } else if (ev.type === "error") {
      throw new Error(ev.message || "stream error");
    }
  };

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    let nl: number;
    while ((nl = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, nl).trim();
      buf = buf.slice(nl + 1);
      if (line) handle(JSON.parse(line));
    }
  }
  if (buf.trim()) handle(JSON.parse(buf.trim()));

  // The judge sees the text plus an explicit note of any tool calls, so
  // rubric items about tool use can be scored.
  return [text.trim(), ...toolCalls].filter(Boolean).join("\n\n");
}

// ── Judge a response against its rubric (forced structured tool output) ───────
const JUDGE_TOOL = {
  name: "submit_score",
  description: "Submit the score for the tutor's response.",
  input_schema: {
    type: "object" as const,
    properties: {
      score: {
        type: "integer",
        description:
          "Overall 1-5. 5 = meets every criterion well; 3 = partially; 1 = fails the rubric.",
      },
      criteria: {
        type: "array",
        description: "Per-criterion judgement.",
        items: {
          type: "object",
          properties: {
            criterion: { type: "string" },
            met: { type: "boolean" },
          },
          required: ["criterion", "met"],
        },
      },
      justification: {
        type: "string",
        description: "One or two sentences explaining the score.",
      },
    },
    required: ["score", "criteria", "justification"],
  },
};

interface JudgeResult {
  score: number;
  criteria: { criterion: string; met: boolean }[];
  justification: string;
}

async function judge(scenario: Scenario, response: string): Promise<JudgeResult> {
  const rubricText = scenario.rubric.criteria.map((c, i) => `${i + 1}. ${c}`).join("\n");

  const msg = await client.messages.create({
    model: JUDGE_MODEL,
    max_tokens: 700,
    system:
      "You are a strict, fair grader for an intuition-first Socratic controls-systems tutor. " +
      "Judge ONLY against the rubric. Be critical: a confident but wrong claim (e.g. calling an " +
      "unstable system stable) is a serious failure. Reward intuition-first explanations that " +
      "reference the student's actual numbers; penalise generic formula dumps. Use the submit_score tool.",
    tools: [JUDGE_TOOL],
    tool_choice: { type: "tool", name: "submit_score" },
    messages: [
      {
        role: "user",
        content:
          `STUDENT QUESTION:\n${scenario.userMessage}\n\n` +
          `RUBRIC (criteria the response should meet):\n${rubricText}\n` +
          (scenario.rubric.notes ? `\nGRADER NOTES: ${scenario.rubric.notes}\n` : "") +
          (scenario.rubric.expectsTool
            ? `\nThis scenario expects the tutor to call the apply_gains tool.\n`
            : "") +
          `\nTUTOR RESPONSE:\n${response}`,
      },
    ],
  });

  const toolUse = msg.content.find((b) => b.type === "tool_use");
  if (!toolUse || toolUse.type !== "tool_use") {
    throw new Error("judge did not return a score");
  }
  return toolUse.input as JudgeResult;
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error("Set ANTHROPIC_API_KEY before running.");
    process.exit(1);
  }

  const file = path.join(__dirname, "scenarios.json");
  const scenarios: Scenario[] = JSON.parse(fs.readFileSync(file, "utf-8"));

  const rows: {
    id: string;
    title: string;
    score: number;
    met: string;
    justification: string;
  }[] = [];

  for (const sc of scenarios) {
    process.stdout.write(`Running ${sc.id} (${sc.title})… `);
    try {
      const response = await callTutor(sc);
      const result = await judge(sc, response);
      const metCount = result.criteria.filter((c) => c.met).length;
      rows.push({
        id: sc.id,
        title: sc.title,
        score: result.score,
        met: `${metCount}/${result.criteria.length}`,
        justification: result.justification,
      });
      console.log(`score ${result.score}/5`);
    } catch (err) {
      rows.push({
        id: sc.id,
        title: sc.title,
        score: 0,
        met: "—",
        justification: err instanceof Error ? err.message : "error",
      });
      console.log("ERROR");
    }
  }

  // Results table
  console.log("\n══════════════════════ RESULTS ══════════════════════");
  console.table(
    rows.map((r) => ({ id: r.id, title: r.title, score: r.score, criteria: r.met }))
  );

  const scored = rows.filter((r) => r.score > 0);
  const avg = scored.reduce((s, r) => s + r.score, 0) / (scored.length || 1);
  console.log(`\nAverage score: ${avg.toFixed(2)} / 5  (${scored.length}/${rows.length} ran)`);

  console.log("\n── Justifications ──");
  for (const r of rows) {
    console.log(`${r.id} [${r.score}/5] ${r.justification}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
