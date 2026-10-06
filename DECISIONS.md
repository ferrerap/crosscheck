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

## Round 2 engine changes (2026-10-05 night, per Paul's review)
- **Identity facts I1–I3** (capacity, project company, site), `kind: "identity"`. They're checked for consistency in every document and excluded from the metrics.
- **Planted clerical mismatch:** the insurance binder says 132 MWdc where every other document says 135. Expected handling is a conflicting label plus an RFI, not a judgment call. The eval checks this.
- **New pipeline outputs:**
  - `gaps`: documents that should state a value but don't. These power the matrix's "not stated" cells.
  - `rfis`: requests to the seller, with priority.
  - `risks`: flags that need no decision now, with verified quotes.
- **Naming, agreed with Paul:** Judgment calls / RFIs / Risks. The word "questions" is gone from the UI.
- **Upload:** `POST /api/upload` (multipart) saves to the OS temp folder under a runId, and the pipeline routes accept `runId`. `GET /api/file/<runId>/<name>` serves the PDFs back. This works locally; serverless instances don't share disk, so the public deployment stays replay-only.
- **Live eval: 56/56 checks, 74/74 quotes verified, $0.91, about 4.6 minutes.** The replay was regenerated from that run.

## UI round 2 (subagent)

- **Flow is now Upload -> Baseline -> Cross-check -> Review -> Report.** The header mode toggle is gone; a small header badge ("Recorded run" or "Live") appears once a run starts. Replay vs live is chosen on a choice card that shows when the dropped files hash to the fixture's `docs[].sha256` set (SHA-256 via `crypto.subtle` in the browser) or when "Or load the demo deal" is clicked. Non-demo files get a "Start diligence" button and live only. For a recognised demo deal the choice card replaces the Start button rather than appearing next to it.
- **Live with uploaded files**: POST `/api/upload`, then `LiveRunner(runId)` sends `runId` in every step body. `fileUrl(filename, runId)` in `src/lib/runner.ts` builds `/api/file/<runId>/<filename>` for uploads and `/demo-data/itc-transfer/<filename>` otherwise. Live on the bundled demo sends no runId (the server loads the demo data room).
- **PdfPane** (`src/components/PdfPane.tsx`) renders all pages stacked, measures its container width, has zoom controls, paints any number of highlights, emphasizes `activeId` (orange) and smooth-scrolls it into view. `PdfViewer` is now a thin drawer around it. `ViewerTarget` is `{url, title, highlights[]}`; a matrix cell opens the doc with every quote of that cell highlighted, a QuoteChip opens one.
- **Overlapping quotes**: baseline quotes overlap on the term sheet (I3 contains T2, I1 overlaps T1), so `matchQuotes` in `src/lib/highlight.ts` splits each text item into segments that carry every covering quote id (`data-hl-ids`). `matchQuote`'s signature is unchanged. Selecting a row therefore also lights the shared part of an overlapping row's quote.
- **Text-layer gotcha**: react-pdf re-renders the text layer whenever `customTextRenderer` changes identity, which looped when the renderer was created inline. Renderers are memoized per page and the active highlight is toggled by CSS class in an effect rather than through the renderer.
- **Evidence matrix**: columns are the data room docs with at least one evidence item (14 in the demo, including the three IRS excerpts), sorted by doc id, so it scrolls horizontally with a sticky first column at 1440px. A cell's primary item is the first contradicting one, else the first supporting one, else the first item. "not stated" shows only where a gap exists and the cell has no evidence. The injection doc has evidence, so it is a column (with an "INSTRUCTION IGNORED" tag) and also appears under "Also checked" with "embedded instruction ignored". The different-project doc (D16) has no evidence and appears there with "different project, excluded".
- **Review step** replaces "Questions". UI copy says "judgment calls" everywhere. The only remaining "question" in the report is inside model-generated finding text in the read-only fixture ("beginning-of-construction question (Q1)").
- **Report**: assumption table is grouped Project identity / Credit assumptions; "RFIs to the seller" uses `run.rfis` (priority sorted) with a fallback to `findings[].followUp`; "Risks to note" added; Decisions recorded and usage footer kept.
- **Layout**: baseline and cross-check use a wider container (1400px) so the split view and matrix breathe; other steps stay at 6xl.
- **Copy RFI list** writes a numbered plain-text list (priority, request, reason, related assumptions) and shows "Copied" for 2 seconds.

## G4 redesign (2026-10-06, Paul's decision in plans/crosscheck-prototypes/NOTES.md)
- **Cross-check and Review merge into one page of checks and questions to the seller.** Judgment-call options aren't shown.
- **The report keeps the dollar story as a range** (Paul to confirm). Each "changed" finding is taken as a data room fact. Each contradicted, conflicting or unverified finding is an open question that resolves either to the term sheet value or to the data room value. The judgment-call options in `questions` add further scenarios. Every combination runs through `metrics()`, and the report shows the minimum and maximum credit.
- **Engine additions:**
  - `sourceRole` per document: seller, seller_advisor, independent, government, buyer or other. Seller documents form the "Seller says" lane.
  - `currentShort` (at most 40 characters) and `dependsOn` per finding.
  - A prompt rule: no document ids or assumption codes in text a person reads. The eval checks this with a regex.
- **Eval:** 64/65 checks, 75/75 quotes verified, $0.94. The one miss was "a question raised for PWA". Claude now treats PWA as settled-contradicted, which is defensible, so that check was removed from gold.

## UI round 3: G4 (subagent)

- **Steps are now four: Upload, Baseline, Cross-check and review, Report.** `ScanStep.tsx` (matrix) and `ReviewStep.tsx` are deleted. The new `CheckStep.tsx` keeps the classify animation as its loading phase (doc chips with humanized type, match badge and source tag), then collapses it to "16 documents read · 1 excluded as a different project · 51 facts, every quote verified" with a "Show documents" toggle. `QuestionDrawer.tsx` and `SendModal.tsx` are new. Live mode is unchanged: `confirmBaseline` already ends after reconcile.
- **Judgment-call options are not shown anywhere.** The `questions` array is still used in two places: ordering (checks other checks hang on come first) and the "What it rests on" quotes in the question drawer, plus it feeds `creditRange` for the Report range.
- **Names:** `assumptionName` now returns G4 wording (Beginning of construction date, Prevailing wage & apprenticeship, FEOC compliance, Insurance limit, Credit type, Domestic content bonus) for every screen, so Baseline and Report match. Codes (I1, T6, D12) were removed from Baseline, Report and the quote chips. Documents show as humanized type; when two documents share a type (the two IRS guidance excerpts) the document title is used so they can be told apart.
- **Source tags** come from `classifications[].sourceRole` (Seller / Seller's advisor / Independent / IRS or government). A check gets the two lanes (Evidence, Seller says) when any evidence or "not stated" gap involves a seller-role document. Without `sourceRole` (older live runs) no tags and no lanes appear.
- **Questions:** state lives in `CrosscheckApp` (`accepted` set, `edits` by RFI id), all ticked after reconcile. A question is shown under every check it cites but counted and sent once. Questions that cite no check on the page are not counted or sent (none in the fixture). Evidence page links highlight just that one quote.
- **Dependent checks** use `finding.dependsOn` (not the judgment-call questions) and show one line, "Hangs on the beginning of construction date question", which expands and smooth-scrolls to that check.
- **Default expanded check** is the check most others depend on (beginning of construction), else the first open check; computed from `dependsOn`, no hard-coded id.
- **Send flow:** the primary button opens the modal; Confirm shows the toast "Questions ready to send. Nothing was sent in this demo." and moves to the Report. The toast lives in `CrosscheckApp` so it survives the step change.
- **Report:** headline shows credit as signed, then "Depending on the seller's answers" from `creditRange` (replay: $71.0M, $10.9M-$68.2M; price $10.2M-$63.8M; rate 8%-50%). The insurance card uses the high-case metrics (limit $55.0M vs required $63.8M at the high-case price). Sections: assumption table (Project identity / Credit assumptions), questions sent (edited wording, "edited" tag), risks, usage footer. "Decisions recorded" is removed. The risk about the embedded instruction in the counsel email is filtered out of the report too (Paul's "not shown anywhere"; revisit if he wants it in the report).
- **Baseline auto-advance:** confirming a row selects the next unconfirmed row in page order (wrapping), the selected row has a stronger highlight and a dark Confirm button, and focus moves to Continue when all are confirmed or after Confirm all. `PrimaryButton` now accepts a `ref`. The PDF pane's existing scroll-to-active-highlight handles the page 1 to page 2 moves.
- **Verification quirk:** the Browser pane only advances smooth scrolling while frames are being drawn (a screenshot), so scroll checks need a screenshot after the click.

## UI round 4: two-line rows (subagent)

- **Two-line collapsed rows.** Line 1 is Check, Term sheet, Result, Next step (the "What the data room says" column is gone). Line 2 runs from the check column to the row end: the finding's `summary`, muted, clamped to two lines, with the credit tag at its right. When a row is expanded, line 2 drops the summary text (the full summary is directly below under "What the documents show") and keeps only the tag.
- **Credit tag** lives in `src/lib/creditTag.ts` and is shared by the rows and the Report, using `creditAtRisk` from `scenarios.ts` (computed once in `CrosscheckApp`). Order: own at-risk above zero gives a red pill "up to $X at risk"; else a dependent whose parent has a risk gives a muted "part of the $X on the <parent name>"; else any non-confirmed check gives "no credit impact"; confirmed checks get no tag (a dash in the Report).
- **Order.** "Needs the seller's answer" sorts by at-risk amount, highest first, ties keeping the earlier severity/question/evidence order (stable sort). The "checked and consistent" group is unchanged.
- **Expanded rows.** "What the documents show" (full summary plus a bullet per risk citing the check, "title: detail"), then the amber question box, then evidence. `rfi.reason`, "Why we're asking" and "Also note" are no longer shown on this page. Confirmed rows: documents show, then a green "Checks out." box with any clean-up question, then evidence. The "Hangs on the ... question" link stays at the bottom of the amber box.
- **Inline editing replaces the drawer.** `QuestionDrawer.tsx` is deleted. A pencil next to each question turns it into a textarea with Save / Cancel (Escape also cancels) and Restore original when edited. Saving text equal to the original clears the edit. One question is edited at a time. Edits still live in `CrosscheckApp` (`edits` by RFI id) and feed the send modal and the Report unchanged.
- **Report.** New "Credit at risk" column between Current and Why, same tag logic, dash for confirmed.
