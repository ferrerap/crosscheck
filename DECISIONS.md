# Build log

How Crosscheck was built over 5–6 October 2026: the decisions, who made them, and what the evals caught.

**Roles.** Paul (product owner; solar and storage diligence background) made the product and domain calls: the transaction type, what a buyer's counsel would chase, the screen designs, and how risk is framed. Claude (Claude Code: Opus for architecture, engine and money logic; Sonnet subagents for UI rounds; Fable for design prototyping and an independent final review) proposed options and implemented them. Where a call was Claude's own, it says so.

## Product

- **Transaction type (Paul).** The first idea was a project-acquisition LOI tool. Paul switched to a §48E ITC transfer term sheet because that is Crux's core business. The LOI tool becomes a second playbook on the same engine (planned in internal notes, not in the repo).
- **The question the app answers (Paul):** does the data room still support the term sheet's credit amount?
- **Scenario (drafted by Claude, approved by Paul).** The deal is the fictional Cottonwood Solar I: 100 MWac / 135 MWdc in Montgomery County, IL, credit price $0.935. There are 12 synthetic documents. The planted issues are:
  - eligible basis cut by excluded network upgrades;
  - an apprenticeship shortfall with an unpaid cure;
  - a disputed beginning of construction (notice to proceed, off-site transformer work, on-site piles);
  - domestic content at 47.8%, which passes or fails depending on that date;
  - placed in service slipping into 2027;
  - a missing module FEOC certification;
  - an insurance limit below the requirement;
  - a 132 vs 135 MWdc clerical mismatch;
  - an instruction to "automated review tools" hidden in the seller counsel's email.
- **Real public documents (Paul).** Four excerpts, with sources in `public/demo-data/itc-transfer/SOURCES.md`: the IRS coal-closure list, two IRS notices, and a county permit for a different project. The site's census tract turned out to be a real "directly adjoining" tract on the IRS list, so the energy community check is confirmed against the actual list.
- **Screens (Paul, iterating on what Claude built and prototyped):**
  - drag-and-drop upload with instant replay for the bundled deal;
  - baseline confirmation beside the highlighted term sheet, with auto-advance.
  - **The cross-check page went through three designs.** The first, an evidence matrix, was accurate but mostly empty, because most documents speak to one or two assumptions. Ten Fable prototypes followed, and Paul chose "checks and questions to the seller" (design G4; the prototype notes are internal, not in the repo): at the LOI stage the buyer's next move is going back to the seller, not writing a verdict.
  - Two-line rows with a credit-at-risk tag and in-place question editing came from Paul's review of G4.
- **Risk framing.** Claude proposed showing the credit as a range across how the open questions could resolve; Paul accepted. The final review then found the range omitted the FEOC cliff, and Paul decided to model it. The range is now $0–$68.2M, or $10.9M if FEOC compliance is shown.
- **The hidden instruction is shown only as an "Instruction ignored" tag** on the counsel email's document card. That was Claude's call, delegated by Paul.

## Architecture (Claude, reviewed with Paul)

- **Stack.** Next.js 16 and TypeScript; the Anthropic SDK; pdf.js for server-side text extraction; react-pdf for viewing.
- **Engine and playbook.** `src/engine/` is generic. `src/playbooks/itc-transfer/` holds the assumption definitions, judging rules and the deterministic §48E math. The UI reads the active playbook (`NEXT_PUBLIC_PLAYBOOK`).
- **Four Claude calls per run:** extract, classify, evidence, reconcile, each with a Zod structured output.
- **Text, not PDF images.** Documents go in as page-tagged text. It's cheaper and lines up exactly with quote verification. Document text is escaped, so a PDF cannot forge prompt structure. Pages with no extractable text (scans) are flagged "not read" rather than silently treated as empty.
- **Our own quote verification, not the citations API.** Citations can't be combined with structured outputs. Every quote is string-matched against the page text, and the same matcher drives the PDF highlight.
- **Claude reads; code computes every credit figure.** The rate, credit, price, range, credit at risk per check, and credit cut by data room facts are all deterministic and tested against gold scenarios. The domestic content threshold follows the June 16, 2025 pivot. A FEOC failure on a 2026 start yields no credit.
- **Seller assertions are not independent evidence.** Each document is tagged by source (seller, seller's advisor, independent, government). Seller documents form their own lane. The reconcile prompt is told their status, and seller-stated values never become an outcome in the range.
- **Prompt caching works per step, not across steps.** Each call has its own structured-output schema and effort level ahead of the cache breakpoint, so the four steps keep four caches. A step's cache is reused when the same step runs again within the cache window. That's why a cold run costs about $1.00 and a warm one about $0.65. Cache reads and writes are now recorded separately in usage. A shared schema across steps could fix this, but it's deferred.
- **No database.** A run is one JSON object, and replay plays back a recorded live run.
- **Public deploys are replay-only** (`NEXT_PUBLIC_REPLAY_ONLY=1`). The server refuses live calls and uploads.

## Eval history

Scores are from `npm run eval`, and the saved runs are in `evals/itc-transfer/results/`. Gold was written by the builder; the tax framing was checked against sources in the final review.

| When | Result | What happened |
|---|---|---|
| First live run | 38/39 | A value-coercion bug: a yes/no assumption arrived as the string "true". Fixed in code. |
| Real documents added | 42/43 | FEOC was labeled "conflicting" instead of "unverified". The rule was tightened so missing evidence takes precedence. |
| Rule fix | 43/43 | |
| Identity checks, RFIs and risks added | 56/56 | The planted 132 MWdc typo was routed to an RFI, not a judgment call, as intended. |
| Source roles, no-IDs rule | 64/65 | No question was raised for apprenticeship: Claude treated it as settled-contradicted, which is defensible. Under G4, judgment-call options aren't shown, so that check was removed from gold. |
| 3 repeat runs | 64/64 each | 227/227 quotes verified. |
| After the final review | 77/77 on every run since the redesign (re-scored) | Added checks: exact value matching, a missing value counts as a fail, evidence must come from the right documents, and the hidden instruction must be detected, not just disobeyed. |
| Supplier source type added | 78/78 | The manufacturer's letter is now tagged "supplier" (under contract to the seller) rather than "independent", per Paul. The run also exposed that FEOC's zero-credit outcome depended on how Claude phrased the construction-start question; the range logic now keeps it regardless. This run is the replay fixture. |

**Known limits of the eval.** The playbook rules were written knowing the planted issues, so the eval shows the pipeline executes the playbook reliably, not that it generalizes to new data rooms. A clean data-room negative control (about $1 per run) is the next eval to add.

## Review fixes

- **Code review (Claude), seven fixes:**
  - the eligible-basis row claimed "no credit impact" while the basis cut costs $2.8M;
  - the range could drop a check under certain outputs;
  - a non-PDF term sheet was silently replaced by a data room document;
  - eval matching was too lenient;
  - the injection filter could hide a legitimate risk;
  - output-token headroom;
  - duplicated question logic.
- **Final review (Fable; Paul's decisions are recorded in internal notes, not in the repo):**
  - FEOC modeled in the range;
  - caching claim corrected and cache usage recorded;
  - hard-coded deal name removed;
  - document text escaped;
  - seller assertions excluded from range outcomes;
  - evidentiary framing for beginning of construction;
  - one consistent insurance figure;
  - eval honesty fixes;
  - scanned-page detection;
  - this log rewritten.
