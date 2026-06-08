# Control Systems Tutor

An interactive classical-control simulator with an AI tutor that coaches you on **your** system.

**Live demo:** (https://www.loom.com/share/8f1e04d9bb79493a8f847ced64ead5b9)

---

## The pitch

Most "AI tutors" are a generic chat window: they answer about control theory in the abstract, blind to what you're actually doing. This one is different. Every question you ask is **grounded in the live simulation state**, your exact poles, your phase margin, the curve currently on screen. Tune a gain and the tutor sees the new overshoot. Ask "why is it ringing?" and it points to your lightly-damped pole pair at −0.5 ± 3j, not a stock formula. It can even propose concrete gains and apply them with one click, then react to the result.

Build a plant, design a controller, watch the step response, Bode plot, pole-zero map, and root locus update in real time — then ask the tutor to help you do better.

## Screenshots - To Add
<img width="1917" height="864" alt="image" src="https://github.com/user-attachments/assets/56134666-47db-4e43-81a3-d025a441ef99" />


| Dashboard | Tutor (state-grounded) | Guided exercise |
|---|---|---|
| `docs/dashboard.gif` | `docs/tutor.gif` | `docs/exercise.gif` |

## Technical architecture

- **State-grounded prompting.** A `getSimStateForAI()` function serialises the live system into a compact (~300-token), self-describing snapshot; unit-suffixed fields, readable transfer-function strings, and a pre-computed pole/stability summary (ωn, ζ) so the model reasons about the real system rather than guessing.
- **Tool use.** The tutor can call an `apply_gains` tool that renders as an in-chat card; one click writes to the store, updates every plot, and auto-sends a follow-up so the tutor reacts to the change.
- **Eval-driven development.** A 10-scenario harness scores tutor responses 1–5 via an independent Claude judge against written rubrics, turning prompt changes into a measurable signal instead of vibes.
- **Cost discipline.** Prompt caching on the static persona + sim state; a small/fast model (Haiku) for lightweight pole explanations with two-layer (client + server) caching keyed on a state hash; streaming responses throughout.
- **Engine.** A from-scratch TypeScript controls library; transfer functions, RK4 simulation, frequency response, stability margins — with ~110 passing unit tests. No MATLAB, no control-systems npm package.

**Stack:** Next.js 14 · TypeScript · Zustand · Plotly · Anthropic API.

## Run locally

```bash
npm install
echo "ANTHROPIC_API_KEY=sk-ant-..." > .env.local
npm run dev          # http://localhost:3000
```

Evals (dev server running, key in shell):

```bash
npx tsx evals/run.ts
```
