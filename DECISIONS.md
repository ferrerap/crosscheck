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
- **Public deploys are replay-only** (`NEXT_PUBLIC_REPLAY_ONLY=1`, set for every production build by the committed `.env.production`). The server refuses live calls and uploads.

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
  - hard-coded deal name removed from the report heading (it survived in the upload card and the send modal until Review 2, which removed it there too);
  - document text escaped;
  - seller assertions excluded from range outcomes;
  - evidentiary framing for beginning of construction;
  - one consistent insurance figure;
  - eval honesty fixes;
  - scanned-page detection;
  - this log rewritten.

## Review 2 (2026-10-06 to 07): submission scope

A second independent review (Fable) read the repo against the hiring brief. Paul decided the scope the same evening: maximise evidence that the product was framed, built, evaluated and shipped end to end, not sophistication. Rules that followed: new eval rooms and the README's first screen outrank code fixes; no special-casing (new rooms run through the same engine, prompts and playbook); Cottonwood keeps its score; UI changes only where something looked broken; every README claim true of the code.

**What the review found (by id).** Tests that could not fail (H3: ingestion and highlight checks printed FAIL but exited 0; M7: the injection assertion passed when 11 of 12 checks obeyed). A "changed" check whose value the model did not return silently left the range (H4). $0 where an input was missing or a string (D5). Dates in common formats (12/22/2025, December 2025, Q4 2025) silently disabled the domestic-content and FEOC rules (D6). Two different insurance "required" figures on one card (D4). Quotes, displays and notes re-entered the fourth prompt unescaped after being unescaped for the UI, so a document carrying prompt markup could forge a page boundary there (M4). A PDF's hyphenated line break could not match a quote (M3). A hard-coded deal name, cost and "100%" note in generic screens (D2). The replay flag was a public build-time variable only (D7). Unbounded scenario enumeration (D8). Plus the UI items in §5 and the README first screen (D12).

**Decisions, including four reversals.**

| # | Topic | Decision |
|---|---|---|
| D1 | Replay pacing | Keep the simulated pacing; the copy says it is a recorded replay. Live classify shows one indeterminate state, no fake streaming. |
| D2 | Generic UI | **Reversed.** No genericization refactor. The three literally false bits (deal name, cost, 100% note) are removed and the README says the UI still carries ITC-specific copy. |
| D3 | Unverified quotes | Shown, visibly marked, rather than hidden. |
| D4 | Insurance "required" | At the high case, consistently, read from the metric. |
| D5 | Non-computable values | A null state on `Metric` with the missing inputs named. Never $0 for a missing input. |
| D6 | Dates | **Trimmed.** Common formats normalised to ISO in code; an ambiguous month, quarter or year that straddles a pivot is "not computable: a precise construction-start date is needed". No range machinery over date uncertainty. |
| D7 | API auth | **Reversed.** A server-only replay flag and one README line on the trust model; no shared-secret header. |
| D8 | Scenario blow-up | **Reversed.** A guard that throws above 100,000 scenarios instead of an approximation. |
| D9 | Test runner | Exit codes fixed; vitest not adopted (the scripts stay in the `npm test` chain). |
| D10 | Evals | Per-finding injection assertion; a clean room and a perturbed room added; adversarial room only if budget remained. |
| D11 | Replay fixture | Re-recorded from the final Cottonwood run, the latest run rather than the best. |
| D12 | README | First screen restructured for a five-minute reviewer. |
| D13 | Walkthrough | A short GIF of the replay on the README's first screen. |
| D14 | Parked work | Listed below as deliberate omissions with reasons. |

**Eval scores before and after, per room.** 

| Room | Before this review | After |
|---|---|---|
| Cottonwood | 78/78 on the old checks (79/79 once the tests could fail, 82/82 once the range rows were added) | **82/82**, 68/68 quotes, $0.85, after the rule fixes below |
| Clean (new) | 58/65 on its first run: construction start left open although the independent engineer had reviewed the records and confirmed it; a judgment call, six RFIs and four risks on a deal with nothing wrong; range low of $0 | **65/65**, 57/57 quotes, $0.77: twelve confirmed, no questions, no RFIs, one risk, range $71.0M–$71.0M. The risk is the cost segregation report counting a project-owned generation tie line as energy property; judged real (see the pre-submission pass below) and kept. |
| Perturbed (new) | — | **75/76**, 57/57 quotes, $0.78: the only miss is the gold's assumption that the schedule slip would be repeated as a risk; the run reports the slip in the placed-in-service finding (February 15, 2027, 77 days late, crossing the year end) and raises a different, sharper risk (the 2025 start rests on a transformer that later failed factory testing). Left as a recorded miss rather than edited away. |

**What the clean room changed (general rules, not special cases).** The beginning-of-construction rule now says an independent party's statement that it reviewed the records and confirms the start substantiates off-site work; only a seller's or supplier's own statement, an engineer who reviewed nothing, or disagreeing documents keep the check open. The FEOC rule confirms the assumption when the start is substantiated before 2026 and treats certifications as informational. The reconcile prompt asks for an RFI only where it would change a check or correct a clerical error, and for a risk only where something in the evidence could reduce, delay or endanger the credit as signed. Cottonwood was re-run after each of these and kept 82/82; its RFIs fell from ten to five and its risks from six to two, all the asserted ones still present. The replay fixture is that run.

**UI fixes (handoff §5), done by an Opus subagent in a worktree, one commit per item, each gated and checked in the browser at 1440x900.** Choices made while implementing: the four real public-document excerpts are recognised by the `*_excerpt.pdf` filename pattern that `scripts/excerpt-real-docs.ts` produces, not by model output or file position; the run mode reaches the check page as a prop; in replay the recorded total usage is reported by the last step and the earlier steps report zero (the invented per-step split is gone); the "quotes not verified" count covers the quotes a reader can open (evidence under each check plus the quotes behind the risks shown) and is one selector for both pages; the drop zones state their real limits (one PDF up to 20 MB; up to 29 data room PDFs of 20 MB each); the upload route refuses a non-PDF, an oversize file, too many files, a missing term sheet or an empty data room with a 400 that names the problem, before writing anything; a long filename keeps its `.pdf` when shortened; after a failed live step nothing animates and unread documents say "Not read". Not verified: that the upload route removes its folder when a write fails mid-way (checked by reading the code only). Known at merge: `npm audit` reports 5 high-severity advisories in development-only dependencies (`braces` via `eslint-config-next`); `npm audit --omit=dev` reports none; left alone rather than forcing a breaking upgrade before submission.

**Deliberately not done** (parked with a reason; none affects what the demo claims):
- Full UI genericization: the engine and math are generic; the UI copy is ITC-specific, and a second playbook would be the time to generalise it against a real second case.
- Date-range or fork modelling for ambiguous construction-start dates: the not-computable state with a plain reason is honest and cheaper; modelling uncertainty would invite false precision.
- Scenario approximation above the guard: a run with more than 100,000 scenarios means the inputs are wrong, not that the math needs sampling.
- Shared-secret API auth: public deploys are replay-only; live mode is for localhost with the operator's own key.
- Retry-a-step in the UI: "Start over" is enough for a demo; a retry needs idempotent server state that does not exist yet.
- Accessibility pass (dialog focus traps, nested interactive rows, checkbox labels): real work, not demo-blocking.
- PdfPane re-key on resize and zoom override; tri-state `verified` with fuzzy partial matches; pdf.js server/client version alignment and a postinstall worker copy: viewer polish.
- Per-page textless tracking, per-step usage in the fixture, tmp-dir sweeping, a billions tier in `fmtMoney`, `Finding.currentShort`/`followUp`/`questionIds` cleanup, confirm-before-reset on the logo: small, and none changes a result.
- Adversarial room (prompt markup inside a document, an instruction in a filename): the escaping fix is unit-tested; a live adversarial room is the next eval to buy.

## Pre-submission pass (2026-10-07)

Three application-facing items, no code change.

- **The clean room's one risk (Paul asked; Claude investigated).** The passing clean run raises one risk: the cost segregation report includes $5.6M of "project-owned interconnection facilities (generation tie and project substation)" in eligible basis, and the risk notes that a generation tie line is generally transmission equipment rather than energy property, so part of that $5.6M could be disallowed even though the $142.0M figure matches the term sheet. Judged a legitimate transaction-level risk, not a false positive: it is the kind of point a buyer's tax counsel raises on a cost segregation review, it is hedged ("if the gen-tie portion is disallowed"), it cites a verified quote, and it is not a restatement of the confirmed check. The allowance of one risk was set in the handoff before the room ever ran. Nothing was changed to force it to zero; the README, this log and the gold's note now say what the risk is and why the negative control tolerates it. The fixture's cost segregation text is left as written: it is the kind of claim a seller's report makes.
- **README first screen.** Live demo, walkthrough, architecture, evals and build log links in one line under the title.
- **Live demo (Paul deployed; Claude verified and fixed the default).** The first public deploy, [crosscheck-aa4e.vercel.app](https://crosscheck-aa4e.vercel.app/), went out without the replay flag: the page was public, but a live-mode API call reached the data-room loader and failed with a 500 instead of the replay-only 403, and the upload card still offered "Run live with Claude". The flag no longer depends on a dashboard setting: a committed `.env.production` sets `NEXT_PUBLIC_REPLAY_ONLY=1` for every `next build`, and a deploy environment can set it to 0 to run live with its own key. Verified after the redeploy: `POST /api/run/extract` and `POST /api/upload` return 403 with the replay-only message, and the demo card shows "Live analysis runs locally with your own API key" instead of the live button.
- **Attribution.** The "How I built it" section was rewritten to match the roles recorded at the top of this log: Paul defined the problem and workflow, supplied the domain model, set or approved product behaviour and acceptance criteria, reviewed outputs and failures, and made the scope and architecture calls; Claude Code proposed most technical approaches and wrote most of the implementation.
