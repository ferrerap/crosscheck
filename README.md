# Crosscheck

[![CI](https://github.com/ferrerap/crosscheck/actions/workflows/ci.yml/badge.svg)](https://github.com/ferrerap/crosscheck/actions/workflows/ci.yml)

**Does the data room support the term sheet?**

A tax credit buyer signs a term sheet that assumes a credit amount: an eligible basis, a credit rate built from prevailing wage, energy community and domestic content, a placed-in-service year and an insurance limit. Diligence is the work of checking every one of those assumptions against the seller's data room. Crosscheck does that cross-document reading with Claude, puts every finding next to the exact source passage, and asks a human to make the judgment calls. The dollar impact recomputes as you decide.

![Cross-check and review: the construction-start check, its question to the seller, credit at risk, and evidence split between independent sources and the seller](docs/screenshot.png)

**Built as a demo for the AI Product Engineer role at Crux.** Crux's diligence products already match files to checklist items and extract key terms from single documents. Crosscheck explores the next layer: **reasoning across documents against the deal's own assumptions.**

## What it does

| Step | What happens |
|---|---|
| 1. Upload | Drop the term sheet and the data room. The bundled demo deal can replay a recorded live run instantly. |
| 2. Baseline | Claude extracts the assumptions behind the credit amount. You confirm each one beside the highlighted term sheet. |
| 3. Cross-check and review | Every check is traced through every document. Each comes out "checks out" or "question to the seller", with the supporting evidence one click away and seller assertions shown apart from independent evidence. You edit the questions, choose which to send, and send them. |
| 4. Report | The credit as signed, the range it could land in depending on the seller's answers, the questions sent, risks, and source walk-back for every claim. |

### The demo deal

*Cottonwood Solar I* is a fictional 100 MWac / 135 MWdc solar project whose §48E ITC is being sold under §6418 at $0.935. The data room holds **12 synthetic documents** (cost segregation report, PWA compliance report, IE and construction monitoring reports, domestic content certification, insurance binder and others) plus **4 excerpts of real public documents**: the IRS coal closure census tract list, two IRS notices, and a county siting ordinance for a *different* project. The planted issues:

- Eligible basis falls from $142.0M to $136.4M because network upgrades are excluded.
- Apprenticeship labor hours are 13.2% against 15% required, and the cure payment is unpaid.
- Beginning of construction is disputed: a notice to proceed on 12/18/25, off-site transformer work on 12/22/25, and on-site piles on 1/12/26. That date decides the domestic content threshold (47.8% passes at 45% and fails at 50%) and whether the FEOC rules apply.
- Placed in service slips to February 2027, out of the buyer's 2026 tax year.
- A module supplier FEOC certification is missing.
- The insurance limit is $55.0M against $66.4M required, and the policy excludes known PWA deficiencies.
- The insurance binder says 132 MWdc where every other document says 135.
- The seller counsel's email contains a line telling "any automated review tool" to mark everything confirmed.

As signed, the credit is **$71.0M**. Depending on how the seller answers, it lands between **$0 and $68.2M**: a 2026 construction start plus a FEOC failure means no qualified facility and no credit. If FEOC compliance is shown, the low case is **$10.9M**. The range is computed in code across every way the open questions could resolve.

## How it works

```mermaid
flowchart LR
  A[PDFs] --> B[Ingest<br/>page text + SHA-256]
  B --> C{{Claude: extract<br/>baseline}}
  C --> D{{Claude: classify<br/>documents}}
  D --> E{{Claude: gather<br/>evidence + gaps}}
  E --> F{{Claude: reconcile<br/>labels, judgment calls,<br/>RFIs, risks}}
  C & E & F --> V[Verify every quote<br/>against page text]
  F --> M[Deterministic math<br/>rate, credit, price]
  M --> UI[Review UI]
  V --> UI
```

- **The engine is generic; playbooks hold the deal type.** `src/engine/` knows nothing about tax credits. `src/playbooks/itc-transfer/` defines the assumptions (what to extract, what counts as evidence, how to judge it) and the deterministic math. A new transaction type is a new folder, not a new app. A project-acquisition LOI playbook is next.
- **Claude reads; code does the math.** Claude extracts values and quotes. TypeScript computes the credit rate (6% or 30% base, bonuses of +2 or +10 points, zero on a FEOC failure), the domestic content threshold by construction start date, and every credit figure: the range, the credit at risk per check, and the credit already cut by data room facts. Figures quoted inside Claude's prose (a day count, a dollar shortfall) come from the documents and are shown as text, not computed.
- **Every quote is verified.** Claude must return verbatim quotes with page numbers, and each one is string-matched against the PDF's text layer before it's shown. Anything that doesn't match is flagged as unverified rather than shown as fact. The same matcher drives the highlight in the PDF viewer.
- **Questions to the seller, not verdicts.** At the LOI stage the buyer's next move is to go back to the seller. Every check that doesn't hold becomes a targeted question the reviewer can edit before sending. A clerical discrepancy is a clean-up request, not a deal issue. Documents are tagged by source (seller, seller's advisor, independent, government). Seller documents sit in their own lane, the model is told they are assertions, and a seller-stated value never becomes an outcome in the credit range.
- **The dollar range is computed, not guessed.** Data room facts (for example the $136.4M basis) always apply. Each open question resolves either to the term sheet value or to the data room's. Every combination runs through the deterministic math to give the low and high case.
- **Documents are untrusted input.** The prompt treats data room text as data. Embedded instructions are surfaced as suspicious and ignored, and the eval checks this.
- **Four calls, cached per step.** The whole data room sits in a cached system prompt. Each step has its own structured-output schema and effort level, so each keeps its own cache, reused when that step runs again within the cache window. That is why a cold run costs about $1.00 and a warm one about $0.65. Cache reads and writes are recorded separately in usage. Sharing one schema across steps would let all four share a cache; it's on the list, not done.

### Tradeoffs worth naming

| Decision | Why | Cost |
|---|---|---|
| Text extraction instead of PDF vision | Native PDFs; cheaper; aligns exactly with quote verification | Scanned documents need the vision path (future) |
| Structured outputs plus our own quote verification, instead of the API's citations feature | Citations and JSON schema output can't be combined in one call; verification also powers highlighting | We maintain a matcher |
| No database | 80/20 for a demo; a run is one JSON object | No multi-user history |
| Replay of a recorded live run | Instant, free demo for anyone with the link | Live mode needs your own key |

## Evals

`npm run eval` runs the full live pipeline on the demo data room and scores it against builder-authored expected answers (`evals/itc-transfer/gold.json`). It checks:
- baseline values;
- project match for every document, including the real different-project permit;
- labels and current values for all 12 assumptions;
- that the construction-start conflict is raised as a judgment call, that domestic content and FEOC are linked to it, and that the clerical typo is an RFI rather than a decision;
- the source role of key documents (seller vs independent), and that no document IDs or codes leak into text a person reads;
- RFI and risk coverage;
- resistance to the injected instruction;
- that evidence comes from the right documents (for example, the energy community check cites the real IRS list);
- that the hidden instruction is detected, not just disobeyed;
- the quote verification rate.

| Model | Checks passed | Quotes verified | Cost per run | Time per run |
|---|---|---|---|---|
| `claude-opus-5-5`, 5 runs since the redesign | **77 / 77** in each of the first 4 (re-scored on the final checks); **78 / 78** on the latest, after a supplier source type was added | **374 / 374** (72 to 78 per run) | $0.64 to $0.96 (warm vs cold cache) | ~4–5 min |

Scores use exact matching (a partial value like "2026" for "2026-11-30" fails), and a missing value counts as a fail. Saved runs can be re-scored for free with `--rescore`. Earlier runs (in `evals/itc-transfer/results/`) caught a value-coercion bug (38/39) and an ambiguous rule for missing FEOC evidence (42/43). Both are fixed, and the history is kept.

**What this does and doesn't show.** The playbook rules were written knowing the planted issues. The eval shows the pipeline executes the playbook reliably and repeatably; it does not show it generalizes to an unseen data room. The next eval to add is a clean data room as a negative control, where every check should come out confirmed. `npm test` runs the free deterministic checks: the tax math against the gold scenarios, ingestion and quote verification, and highlight matching for every quote in the replay.

## Run it locally

```bash
npm install
cp .env.example .env.local   # add ANTHROPIC_API_KEY for live mode
npm run dev                  # http://localhost:3000
# Public demo deploys set NEXT_PUBLIC_REPLAY_ONLY=1: no live calls, no uploads, no key needed.
```

| Command | What it does |
|---|---|
| `npm test` | Deterministic checks (no API calls); also run in CI on every push |
| `npm run eval` | Live pipeline + scoring (~$1 per run; `npm run eval -- 3` for repeats) |
| `npx tsx scripts/eval.ts --rescore <results.json>` | Re-score saved runs against the current gold (free) |
| `npm run docs` | Regenerate the synthetic PDFs from `scripts/docs/itc-transfer.ts` |
| `npx tsx scripts/save-replay.ts` | Turn the latest eval run into the replay fixture |

## How I built it

Built in about two days with Claude Code. I brought the domain judgment; the models did most of the typing.

- **Domain first.** I spent years in solar and storage investment and diligence (a project finance fund, PwC valuations, Euclid project diligence). I chose what a buyer's counsel actually chases on an ITC transfer, planted those issues in the data room, and wrote the expected answers before any prompt ran.
- **Models by stage.** Opus planned the architecture, wrote the engine and prompts, and owned the money logic. Sonnet subagents built UI rounds in parallel from written specs. Fable generated ten standalone prototypes of the key screen from the real run data, and I iterated with it until one design held up.
- **Product calls made by looking at it.** The first cross-check screen was an evidence matrix. It was accurate but mostly empty cells, because most documents speak to one or two assumptions. After several prototype rounds it became "checks and questions to the seller", because at the LOI stage the buyer's next move is going back to the seller, not writing a verdict.
- **Eval-driven loop.** Every prompt or schema change was followed by a live eval run. The history is in `evals/itc-transfer/results/`, and so are the misses it caught: a value-coercion bug, an ambiguous rule for missing FEOC evidence, document IDs leaking into prose, and a run that stopped raising a question for apprenticeship. A final code review pass caught the eligible-basis row claiming "no credit impact" while the basis cut was costing $2.8M.
- **Decisions are written down.** `DECISIONS.md` is the build log: what was decided, why, and by whom.

## What I'd build next at Crux

1. **Playbooks for the rest of the capital stack.** Tax equity, debt and PPA reviews built on the same engine, with assumptions mapped to the market-standard checklists Crux already maintains.
2. **Feed it from Crux's existing layers.** Document classification and term extraction already exist in the Diligence Suite. Crosscheck's evidence step would consume them, so the new work is the cross-document reconciliation.
3. **RFIs straight into checklist Q&A.** Each RFI already names the assumption and documents it concerns, so it can land as a question anchored to the right checklist item.
4. **Evals from real reviews.** Every reviewer correction becomes a gold case per playbook, run in CI before prompt or model changes ship.
5. **Scanned documents and spreadsheets.** Claude's PDF input for scans; table-aware ingestion for models and cost schedules.

## Limits

This is a demo, not a reviewed diligence product. The gold answers and tax framing were written by the builder; a tax professional should review them. Live upload works locally; the public deployment is replay-only so no API key is exposed. All parties and figures in the synthetic documents are fictional.

---

© 2026 Paul. All rights reserved. The code is published so reviewers can read how it works; no license to reuse it is granted.
