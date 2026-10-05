# Decisions log

Decisions made autonomously on 2026-10-05 while Paul was away. Each one can be reversed; most are a one-line change.

## Product and naming
- **Product name: "Crosscheck"**, in the folder `crosscheck/`. It's descriptive and neutral, with no Crux branding.
- **Scenario: fictional Cottonwood Solar I**, a 100 MWac / 135 MWdc solar project in Montgomery County, IL, with a §48E ITC transfer at $0.935. The term sheet is dated 2026-07-15. Fictional buyer: Halvorsen Industrial Corporation. Fictional seller: Cottonwood Solar I, LLC, owned by Meridian Ridge Renewables.
- **12 synthetic documents** (`scripts/docs/itc-transfer.ts` renders to `public/demo-data/itc-transfer/`). The planted issues are:
  - basis cut by network upgrades ($142.0M → $136.4M);
  - an apprenticeship shortfall (13.2% vs 15%) with the cure payment still pending;
  - a beginning-of-construction conflict (EPC notice to proceed 12/18/25 vs off-site transformer work 12/22/25 vs on-site piles 1/12/26);
  - domestic content at 47.8%, which passes in 2025 and fails in 2026;
  - placed-in-service slipping to 2/15/27;
  - a missing module FEOC certification;
  - an insurance limit of $55M vs $66.4M required;
  - a **prompt-injection line in the seller counsel email**. It's a demo moment showing the app ignores it.
- **Energy community (T4) is "unverified" for now.** The tract memo itself says to confirm against the IRS list. Adding the real IRS coal closure list turns it "confirmed", which is the "real public doc" story.

## Architecture
- **Next.js 16 + TypeScript + Tailwind**; Anthropic TS SDK; pdfjs-dist for server-side text extraction; react-pdf for viewing.
- **Engine and playbook split.** `src/engine/` is generic. `src/playbooks/itc-transfer/` holds the assumption definitions (T1–T9 plus the price term P1) and the deterministic tax math. The LOI tool will be `src/playbooks/project-loi/`.
- **Claude reads text, not PDF images.** The documents are native PDFs, so page-tagged text is cheaper and lines up exactly with quote verification. Scanned PDFs would need Claude's PDF/vision input; that's noted as future work.
- **Structured outputs (Zod) plus our own quote verification, instead of Claude's citations feature.** The two can't be combined in one call. Every quote is string-matched against the page text, and anything that doesn't match is marked unverified in the UI.
- **4 calls per run:** extract → classify → evidence → reconcile. The whole data room (~5k tokens) sits in a cached system prompt shared by all 4 calls.
- **Model: `claude-opus-5-5` for every step** (override with `CROSSCHECK_MODEL`). Effort is low for classification, medium for extraction and evidence, high for reconciliation. Expected cost is well under $1 per run. Switching classification to Sonnet is a possible later optimization, to be measured with the eval.
- **Not yet added:** the API's server-side refusal fallback. Refusals are very unlikely on tax documents. It's an easy addition if we see any.
- **Math lives in code only.** The credit rate rules are: 6% base, or 30% with PWA; each bonus is +10 points with PWA, +2 without. The domestic-content threshold by construction-start year is 40/45/50/55%. Credit = basis × rate; price = credit × $0.935. Money is rounded to cents.
- **Live mode reads the demo data room from disk.** Upload of your own files is UI-only for now (a cut-list item).
- **No database.** The run is held in browser state, and the replay fixture is a JSON file.
- **Every step is a separate API route** (`/api/run/[step]`), so no single request runs long on Vercel.

## Testing and evals
- `npm run test` checks the math against the gold scenarios and confirms PDF ingestion and quote verification. It passes now.
- `npm run eval` runs the live pipeline and scores baseline values, project match, labels, current values, questions raised, injection resistance, quote verification rate, cost and time. It needs the API key.
- The gold answers (`evals/itc-transfer/gold.json`) are builder-authored, so **Paul should review the tax logic**.

## B2–B4 results (2026-10-05 evening)
- **Live eval: 43/43 checks, 100% of 54 quotes verified, $0.70 and about 2.7 minutes per run** (`evals/itc-transfer/results/`). Run history: 38/39 (a coercion bug) → 42/43 (T8 called "conflicting") → 43/43 after tightening the T8 rule so missing evidence takes precedence.
- **Real public documents added** as files 13–16, with sources in `public/demo-data/itc-transfer/SOURCES.md`. The placeholder tract 17135957900 turned out to be a real "Directly adjoining" tract in IRS Notice 2023-29 Appendix C, so T4 is now **confirmed** from the IRS list. The Vermilion County ordinance is flagged as a different project and excluded.
- **The replay fixture is now a real live run** (`npm run eval` then `npx tsx scripts/save-replay.ts`). The video therefore shows genuine Claude output.
- **Metrics fix:** assumptions tied to an unanswered question stay at term-sheet values. The headline reads $71.0M → $68.2M before any decision, $54.6M with a 2026 start, and $10.9M if apprenticeship also fails.
- **Added `suspiciousInstructions`** to the classification type, which drives the "Embedded instruction ignored" badge. Document types are humanized.
- **`next.config.ts`:** `serverExternalPackages: ["pdfjs-dist"]`. Without it the live API routes fail inside Next.
- **Live mode through the UI** is not yet clicked end to end. The extract route was tested via HTTP, and the other steps use the same code the eval exercises.

## Open items needing Paul
1. API key: paste it into `crosscheck/.env.local`.
2. ~~Real public documents~~ Done (see above). Original note:
   - IRS Notice 2023-29 Appendix C coal closure list, plus [Notice 2023-47 Appendix 3](https://www.irs.gov/pub/irs-drop/n-23-47-appendix-3.pdf). Pick a real listed tract and swap it into `CENSUS_TRACT`.
   - A Treasury domestic content notice.
   - A real permit or interconnection agreement for a *different* project.
3. Review the tax framing: thresholds, BOC and off-site work, FEOC applicability after 12/31/25, and the cure payment treatment.
4. No git repo yet; I'll create one when you're ready to commit.

## UI (subagent)

- **Replay fixture is generated and verified**: `src/fixtures/replay-itc-transfer.json` was built by a throwaway script that ingests the real PDFs and runs every quote through `locate()`; all 32 evidence quotes plus baseline and question quotes are verified, and page numbers come from the PDFs (T8 and T9 baseline quotes are on D01 page 2; gold.json says page 1 for T8, the PDF says 2). sha256 values are real.
- **Finding.currentValue** set for T2, T5, T7, T9 only; T3/T6 come from question answers. Live metrics = `itcTransfer.metrics(baselineValues, currentValues)` with currentValues = findings currentValue merged with chosen options' `sets`. Verified in the browser against gold scenarios (68.2M / 54.56M / 10.912M).
- **Q2 option 3 (tax counsel memo)** sets T6 to 2026-01-12 as the conservative value; its consequence text says so.
- **Questions step shows 2 questions; undecided items fall back to term sheet values** in the metrics strip, flagged with "(undecided items at term sheet values)".
- **pdf.js worker**: react-pdf 11 bundles pdfjs-dist 6.3.289 while the top-level install is 6.4.299; a version mismatch breaks the worker. The matching worker is copied to `public/pdf.worker.min.mjs` and referenced as `/pdf.worker.min.mjs` (set in `PdfViewer.tsx`, the same module that renders Document/Page). Re-copy from `node_modules/react-pdf/node_modules/pdfjs-dist/build/` if react-pdf is upgraded.
- **Highlighting** is character-level: quote and page text items are normalized (case, whitespace, quotes, dashes) with a char-to-item map, so only the matched substring inside each text item is wrapped in `<mark>` via `customTextRenderer`. Falls back to the longest prefix (>=60%) if no exact match; a note shows if nothing is located.
- **Injection flag** in the data room scan is a UI heuristic on the classification summary text (regex for "embedded instruction"/"aimed at automated"), since `DocClassification` has no injection field. A proper field would be cleaner if the engine adds one.
- **Runner**: replay splits fixture usage across 4 steps (1/4/6/3 calls, 10/30/40/20% tokens, remainder to reconcile) so the footer sums to the recorded 14 calls, 182.4k in, 12.3k out, $1.10. LiveRunner posts `{playbookId, ...slices}` (classify sends `{docs, baseline}`); the classify results are revealed progressively client-side. Live mode and replay are locked once a run starts; "Start over" (logo) resets.
- **Light mode only**; removed dark-mode CSS and the Next template. Mode toggle labels "Demo replay" / "Live (Claude API)".
- **eslint** now ignores `public/**` (the minified worker produced errors). One remaining lint warning is in another agent's `src/app/api/run/[step]/route.ts`.
- `.claude/launch.json` was created in the crosscheck folder as asked, but the preview tool looks for it one level up (`LOI App/.claude`), so the dev server was run via `npm run dev` and driven in the browser pane instead.
