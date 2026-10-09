# Crosscheck: notes for agents working in this repo

- **What it is.** A Next.js 16 / TypeScript app that checks a tax-credit term sheet against a seller's data room with Claude. Claude reads; code computes every credit figure. The engine (`src/engine/`) is generic; the deal type lives in a playbook (`src/playbooks/itc-transfer/`). `README.md` has the architecture, `DECISIONS.md` the reasons.
- **Free checks.** `npx tsc --noEmit -p .`, `npm run lint`, `npm test` (deterministic: tax math, engine units including evidence coverage, ingestion and quote verification, highlight matching, the credit range, the reliability page's data against the recorded runs). Run all three before and after any change. They make no API calls.
- **Paid checks.** `npm run eval` runs the live pipeline on the demo deal (about $1, 4–5 minutes) and scores it against `evals/itc-transfer/gold.json`. `npx tsx --env-file=.env.local scripts/eval.ts --room itc-transfer-clean` and `--room itc-transfer-perturbed` run the other rooms. `--rescore <results.json>` re-scores a saved run for free. Never change a prompt, an output schema or a playbook rule without re-running the eval on every room and recording the scores in `DECISIONS.md`. Never delete anything under `evals/*/results/`.
- **Scope.** Robustness and evidence over features. Do not add scope, refactors or dependencies beyond what a reviewed handoff asks for; parked work is listed in `DECISIONS.md` under "Deliberately not done".
- **Replay fixture.** `src/fixtures/replay-itc-transfer.json` is a recorded live run. Regenerate it only with `npx tsx scripts/save-replay.ts` after an eval run, never by hand, then run `npm test`.
- **Data rooms.** Synthetic PDFs come from `scripts/docs/itc-transfer.ts` via `npx tsx scripts/generate-docs.ts --room <name>`. Do not regenerate `itc-transfer` casually: the replay fixture and the drag-in demo detection depend on those files' hashes.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
