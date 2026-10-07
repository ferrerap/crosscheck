// Playbook: buyer-side diligence of a §48E ITC transfer (§6418) against the signed term sheet.
// Everything transaction-specific lives here; the engine stays generic.

import type { AssumptionDef, Metric } from "@/engine/types";
import { toIsoDate } from "@/lib/dates";
import type { Playbook, Values } from "../types";

const identityRule =
  "Check every document that states this fact. Confirmed if all agree. If any document differs, label conflicting and name the outlier; a likely clerical discrepancy needs an RFI to correct it, not a judgment call.";

const assumptions: AssumptionDef[] = [
  {
    id: "I1",
    name: "Nameplate capacity",
    kind: "identity",
    valueType: "text",
    extractionHint: "Project capacity in MWac and MWdc.",
    evidenceHint: "Any document that states the project's AC or DC capacity.",
    rule: identityRule,
  },
  {
    id: "I2",
    name: "Project company",
    kind: "identity",
    valueType: "text",
    extractionHint: "The legal entity that owns the project and sells the credit.",
    evidenceHint: "Any document naming the project owner or seller entity.",
    rule: identityRule,
  },
  {
    id: "I3",
    name: "Site location",
    kind: "identity",
    valueType: "text",
    extractionHint: "County and state of the project site.",
    evidenceHint: "Any document stating where the project is located.",
    rule: identityRule,
  },
  {
    id: "T1",
    name: "Credit type",
    valueType: "text",
    extractionHint: "The Code section of the credit being transferred and the type of energy property.",
    evidenceHint: "Any document that names the credit section or describes the energy property.",
    rule: "Confirmed if current documents describe the same section and property type. Changed if a different section or technology is described.",
  },
  {
    id: "T2",
    name: "Eligible basis",
    valueType: "money",
    unit: "USD",
    extractionHint: "The estimated eligible (creditable) basis the credit amount is computed from.",
    evidenceHint: "Cost segregation report or basis study; the final or most specific eligible basis figure.",
    rule: "Compare exact dollar amounts. Any difference is 'changed'. Note what was excluded or added. Do not treat total project cost as eligible basis.",
  },
  {
    id: "T3",
    name: "Prevailing wage & apprenticeship",
    valueType: "boolean",
    extractionHint: "Whether the credit rate assumes the prevailing wage and apprenticeship (PWA) requirements are satisfied (the 5x multiplier).",
    evidenceHint: "PWA compliance reports, certified payroll summaries, apprenticeship labor-hour percentages, cure or penalty payment records.",
    rule: "Contradicted if any requirement is shown unmet (e.g. apprenticeship labor-hour percentage below the required percentage). A pending or proposed cure payment does not make the requirement met; raise a question. Unverified if no compliance evidence.",
  },
  {
    id: "T4",
    name: "Energy community bonus",
    valueType: "boolean",
    extractionHint: "Whether the energy community bonus is assumed, and on what basis (e.g. coal closure census tract).",
    evidenceHint: "Site location / census tract identifiers, and official lists of qualifying census tracts or areas.",
    rule: "Confirmed only if the project's census tract (or area) appears on a qualifying list that applies to it. Do not infer from county or state alone.",
  },
  {
    id: "T5",
    name: "Domestic content bonus",
    valueType: "percent",
    extractionHint: "Whether the domestic content bonus is assumed. Value is true/false; if an adjusted percentage is stated, note it.",
    evidenceHint: "Domestic content certification or analysis giving the manufactured products adjusted percentage and steel/iron compliance.",
    rule: "Report the adjusted percentage as the current value. Whether it qualifies depends on the beginning-of-construction year threshold (computed by code), so if the construction start date is uncertain, mark conflicting and link to that question.",
  },
  {
    id: "T6",
    name: "Beginning of construction date",
    valueType: "date",
    extractionHint: "The date or period construction is assumed to have begun for tax purposes.",
    evidenceHint: "Notices to proceed, physical work records (on-site or off-site under binding written contract), independent engineer reports, manufacturer letters.",
    rule: "Under the Physical Work Test, construction begins when physical work of a significant nature starts, on site or off site under a binding written contract (not from inventory). A notice to proceed or other preliminary activity is not physical work. Off-site work is substantiated when an independent party (for example the independent engineer) states that it reviewed the contract or the manufacturer's production records and confirms the start date: then confirm that date and do not ask for the underlying records again. If the only support for an off-site start is the seller's or the supplier's own statement, or the independent engineer reviewed nothing and gives no opinion, or documents disagree, mark conflicting and ask for the substantiating documents (the binding written contract and its terms, evidence that the work was significant and not from inventory, continuity). Do not pick the latest or earliest file automatically.",
  },
  {
    id: "T7",
    name: "Placed in service date",
    valueType: "date",
    extractionHint: "The date by which the project is assumed to be placed in service (and the buyer tax year it implies).",
    evidenceHint: "Construction schedules, independent engineer construction monitoring reports, COD forecasts.",
    rule: "Changed if the most recent forecast differs; state the number of days and whether it crosses a calendar (tax) year end.",
  },
  {
    id: "T8",
    name: "FEOC compliance",
    valueType: "boolean",
    extractionHint: "Whether the term sheet assumes compliance with prohibited foreign entity (FEOC) material assistance rules, or that they do not apply.",
    evidenceHint: "Supplier certifications, material assistance cost ratio calculations, and anything that determines whether the rules apply (construction start date).",
    rule: "The material assistance rules apply only to facilities whose construction begins after December 31, 2025; a facility that fails them is not a qualified facility (no credit). If the construction start is substantiated before January 1, 2026, the rules do not apply: confirm the assumption, and treat supplier certifications and any cost ratio as informational (their absence is not a gap). If the start is unresolved or falls in 2026, label unverified if any supplier certification or the material assistance cost ratio is missing (missing evidence takes precedence over 'conflicting'), and say that applicability depends on the beginning-of-construction check.",
  },
  {
    id: "T9",
    name: "Insurance limit",
    valueType: "money",
    unit: "USD",
    extractionHint: "The required tax credit insurance coverage (often as a percentage of purchase price).",
    evidenceHint: "Insurance binders or policies stating the limit of liability.",
    rule: "Compare the bound limit with the required coverage in dollars. Changed if lower.",
  },
  {
    id: "P1",
    name: "Credit price",
    kind: "term",
    valueType: "number",
    unit: "USD per $1.00 of credit",
    extractionHint: "Purchase price per dollar of tax credit.",
    evidenceHint: "Not diligenced.",
    rule: "Deal term; not reconciled.",
  },
];

// ---- Deterministic tax math (the LLM never does this) ----

/** Why a rule could not be applied to a date value. */
export type RuleReason = "not parsed" | "a precise construction-start date is needed";
export interface RuleResult<T> {
  value: T | null;
  reason?: RuleReason;
}

const DC_BANDS: [string, number][] = [
  ["2025-06-16", 40], // before June 16, 2025
  ["2026-01-01", 45], // June 16 to December 31, 2025
  ["2027-01-01", 50], // 2026
];
const dcBand = (isoDay: string) => DC_BANDS.find(([until]) => isoDay < until)?.[1] ?? 55;

/**
 * Domestic content manufactured-products threshold for §48E by construction start date:
 * 40% before June 16, 2025; 45% from June 16 to December 31, 2025; 50% in 2026; 55% after 2026.
 * Accepts any format `toIsoDate` parses. A month, quarter or year that straddles a pivot cannot be placed.
 */
export function dcThreshold(bocDate: string | null): RuleResult<number> {
  const d = toIsoDate(bocDate);
  if (!d) return { value: null, reason: "not parsed" };
  const a = dcBand(d.start);
  const b = dcBand(d.end);
  return a === b ? { value: a } : { value: null, reason: "a precise construction-start date is needed" };
}

/** Construction beginning after December 31, 2025 brings the material assistance (FEOC) rules into play. */
export function feocApplies(bocDate: string | null): RuleResult<boolean> {
  const d = toIsoDate(bocDate);
  if (!d) return { value: null, reason: "not parsed" };
  if (d.start >= "2026-01-01") return { value: true };
  if (d.end < "2026-01-01") return { value: false };
  return { value: null, reason: "a precise construction-start date is needed" };
}

/** Which figure an unusable input blocks: the rate (and so everything after it), the credit amount, or the price. */
type Scope = "rate" | "credit" | "price";

export interface CreditFacts {
  basis: number | null;
  pwaMet: boolean | null;
  ecQualifies: boolean | null;
  dcQualifies: boolean | null;
  price: number | null;
  /** Null when the data room states no limit; that is "not stated", not an error. */
  insuranceLimit: number | null;
  /** True when the FEOC rules apply and compliance fails: not a qualified facility, so no credit. Null = unknown. */
  feocFails: boolean | null;
  /** Inputs that are missing or unusable, by assumption name, with the figure they block. */
  problems: { name: string; scope: Scope }[];
}

function asBool(v: unknown): boolean | null {
  if (typeof v === "boolean") return v;
  if (v === "true") return true;
  if (v === "false") return false;
  return null;
}
function asNum(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "" && !isNaN(Number(v))) return Number(v);
  return null;
}
const nameOf = (id: string) => assumptions.find((a) => a.id === id)?.name ?? id;

/** Map assumption values (baseline or resolved current) to the facts the math needs. */
export function toFacts(v: Values): CreditFacts {
  const problems: CreditFacts["problems"] = [];
  const need = (id: string, scope: Scope, reason?: string) =>
    problems.push({ name: reason ? `${nameOf(id)} (${reason})` : nameOf(id), scope });
  const boc = typeof v.T6 === "string" ? v.T6 : null;

  const basis = asNum(v.T2);
  if (basis === null) need("T2", "credit");
  const pwaMet = asBool(v.T3);
  if (pwaMet === null) need("T3", "rate");
  const ecQualifies = asBool(v.T4);
  if (ecQualifies === null) need("T4", "rate");

  // T5 may be a boolean (term sheet: "bonus assumed") or an adjusted percentage (evidence) judged against the
  // threshold for the construction start date.
  let dcQualifies = asBool(v.T5);
  const dcPct = asNum(v.T5);
  if (dcQualifies === null && dcPct !== null) {
    const t = dcThreshold(boc);
    if (t.value === null) need("T6", "rate", t.reason);
    else dcQualifies = dcPct >= t.value;
  } else if (dcQualifies === null) need("T5", "rate");

  // The FEOC rules only matter when construction began after 2025; then failing them means no credit.
  let feocFails: boolean | null = false;
  const feocOk = asBool(v.T8);
  if (feocOk !== true) {
    const applies = feocApplies(boc);
    if (applies.value === null) {
      feocFails = null;
      need("T6", "rate", applies.reason);
    } else if (applies.value && feocOk === null) {
      feocFails = null;
      need("T8", "rate");
    } else feocFails = applies.value && feocOk === false;
  }

  const price = asNum(v.P1);
  if (price === null) need("P1", "price");

  return { basis, pwaMet, ecQualifies, dcQualifies, price, insuranceLimit: asNum(v.T9), feocFails, problems };
}

/** §48E rate: 6% base or 30% with PWA; each bonus is 10 points with PWA, 2 without. FEOC failure: 0. */
export function creditRate(f: CreditFacts): number | null {
  if (f.feocFails === true) return 0;
  if (f.feocFails === null || f.pwaMet === null || f.ecQualifies === null || f.dcQualifies === null) return null;
  const base = f.pwaMet ? 30 : 6;
  const bonus = f.pwaMet ? 10 : 2;
  return base + (f.ecQualifies ? bonus : 0) + (f.dcQualifies ? bonus : 0);
}

const cents = (x: number) => Math.round(x * 100) / 100;

/** Rate, credit and price for one set of facts; a null figure carries the names of the inputs it lacks. */
function figures(f: CreditFacts) {
  const missing = (scopes: Scope[]) => [...new Set(f.problems.filter((p) => scopes.includes(p.scope)).map((p) => p.name))];
  const rate = creditRate(f);
  const credit = rate === null || f.basis === null ? null : cents(f.basis * (rate / 100));
  const price = credit === null || f.price === null ? null : cents(credit * f.price);
  return {
    rate,
    credit,
    price,
    rateMissing: rate === null ? missing(["rate"]) : [],
    creditMissing: credit === null ? missing(["rate", "credit"]) : [],
    priceMissing: price === null ? missing(["rate", "credit", "price"]) : [],
  };
}

function metrics(baseline: Values, current: Values): Metric[] {
  const bf = toFacts(baseline);
  const cf = toFacts({ ...baseline, ...current }); // unresolved items fall back to baseline
  const b = figures(bf);
  const c = figures(cf);
  // The term sheet's coverage requirement as a share of the purchase price (100% in the demo deal), applied to
  // this scenario's price. The report reads it from the high case.
  const ratio = bf.insuranceLimit !== null && b.price ? bf.insuranceLimit / b.price : 1;
  const ratioPct = Math.round(ratio * 1000) / 10;
  const required = c.price === null ? null : cents(c.price * ratio);
  const perDollar = bf.price !== null ? `at $${bf.price.toFixed(3)} per $1.00 of credit` : undefined;
  return [
    { id: "rate", label: "Credit rate", baseline: b.rate, current: c.rate, format: "percent", missing: c.rateMissing },
    { id: "credit", label: "Credit amount", baseline: b.credit, current: c.credit, format: "money", missing: c.creditMissing },
    { id: "price", label: "Purchase price", baseline: b.price, current: c.price, format: "money", note: perDollar, missing: c.priceMissing },
    {
      // baseline = required coverage at this scenario's purchase price; current = the limit the data room states
      // (null when none is stated).
      id: "insurance",
      label: "Insurance limit vs. required",
      baseline: required,
      current: cf.insuranceLimit,
      format: "money",
      note: `term sheet requires coverage of ${ratioPct}% of the purchase price`,
      missing: required === null ? c.priceMissing : [],
    },
  ];
}

export const itcTransfer: Playbook = {
  id: "itc-transfer",
  name: "Tax credit transfer diligence",
  anchorLabel: "Term sheet",
  dealNameFrom: "I2",
  question: "Do the assumptions behind the term sheet's credit amount survive diligence?",
  context:
    "Buyer-side diligence of a transfer of a §48E investment tax credit under §6418. The term sheet is the baseline; the seller's data room is current evidence. Values in tax documents are exact; never round.",
  assumptions,
  metrics,
};
