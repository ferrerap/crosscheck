// Playbook: buyer-side diligence of a §48E ITC transfer (§6418) against the signed term sheet.
// Everything transaction-specific lives here; the engine stays generic.

import type { AssumptionDef, Metric } from "@/engine/types";
import type { Playbook, Values } from "../types";

const assumptions: AssumptionDef[] = [
  {
    id: "T1",
    name: "Credit section and technology",
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
    name: "Prevailing wage & apprenticeship met",
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
    name: "Beginning of construction",
    valueType: "date",
    extractionHint: "The date or period construction is assumed to have begun for tax purposes.",
    evidenceHint: "Notices to proceed, physical work records (on-site or off-site under binding written contract), independent engineer reports, manufacturer letters.",
    rule: "A notice to proceed alone is not physical work. If sources support different dates or methods, mark conflicting and ask which governs; do not pick the latest or earliest file automatically.",
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
    name: "FEOC / material assistance compliance",
    valueType: "boolean",
    extractionHint: "Whether the term sheet assumes compliance with prohibited foreign entity (FEOC) material assistance rules, or that they do not apply.",
    evidenceHint: "Supplier certifications, material assistance cost ratio calculations, and anything that determines whether the rules apply (construction start date).",
    rule: "Label unverified if any supplier certification or the material assistance cost ratio is missing, even if applicability is also in question (missing evidence takes precedence over 'conflicting'). If applicability depends on the beginning-of-construction date, say so and link to that question.",
  },
  {
    id: "T9",
    name: "Tax credit insurance limit",
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

/** Domestic content manufactured-products threshold by construction start year. */
export function dcThreshold(bocDate: string | null): number | null {
  if (!bocDate) return null;
  const y = Number(bocDate.slice(0, 4));
  if (y < 2025) return 40;
  if (y === 2025) return 45;
  if (y === 2026) return 50;
  return 55;
}

export interface CreditFacts {
  basis: number | null;
  pwaMet: boolean | null;
  ecQualifies: boolean | null;
  dcQualifies: boolean | null;
  price: number | null;
  insuranceLimit: number | null;
}

function asBool(v: unknown): boolean | null {
  if (typeof v === "boolean") return v;
  if (v === "true") return true;
  if (v === "false") return false;
  return null;
}
function asNum(v: unknown): number | null {
  if (typeof v === "number") return v;
  if (typeof v === "string" && v.trim() !== "" && !isNaN(Number(v))) return Number(v);
  return null;
}

/** Map assumption values (baseline or resolved current) to the facts the math needs. */
export function toFacts(v: Values): CreditFacts {
  // T5 may be a boolean (term sheet: "bonus assumed") or an adjusted percentage (evidence).
  let dc = asBool(v.T5);
  const dcPct = asNum(v.T5);
  if (dc === null && dcPct !== null) {
    const t = dcThreshold(typeof v.T6 === "string" ? v.T6 : null);
    dc = t === null ? null : dcPct >= t;
  }
  return {
    basis: asNum(v.T2),
    pwaMet: asBool(v.T3),
    ecQualifies: asBool(v.T4),
    dcQualifies: dc,
    price: asNum(v.P1),
    insuranceLimit: asNum(v.T9),
  };
}

/** §48E rate: 6% base or 30% with PWA; each bonus is 10 points with PWA, 2 without. */
export function creditRate(f: CreditFacts): number | null {
  if (f.pwaMet === null) return null;
  const base = f.pwaMet ? 30 : 6;
  const bonus = f.pwaMet ? 10 : 2;
  return base + (f.ecQualifies ? bonus : 0) + (f.dcQualifies ? bonus : 0);
}

function metrics(baseline: Values, current: Values): Metric[] {
  const b = toFacts(baseline);
  const c = toFacts({ ...baseline, ...current }); // unresolved items fall back to baseline
  const bRate = creditRate(b) ?? 0;
  const cRate = creditRate(c) ?? 0;
  const cents = (x: number) => Math.round(x * 100) / 100;
  const bCredit = cents((b.basis ?? 0) * (bRate / 100));
  const cCredit = cents((c.basis ?? 0) * (cRate / 100));
  const price = b.price ?? 0;
  return [
    { id: "rate", label: "Credit rate", baseline: bRate, current: cRate, format: "percent" },
    { id: "credit", label: "Credit amount", baseline: bCredit, current: cCredit, format: "money" },
    { id: "price", label: "Purchase price", baseline: cents(bCredit * price), current: cents(cCredit * price), format: "money", note: `at $${price.toFixed(3)} per $1.00 of credit` },
    {
      id: "insurance",
      label: "Insurance limit vs. required",
      baseline: b.insuranceLimit ?? cents(bCredit * price),
      current: c.insuranceLimit ?? 0,
      format: "money",
      note: "term sheet requires coverage of 100% of purchase price",
    },
  ];
}

export const itcTransfer: Playbook = {
  id: "itc-transfer",
  name: "Tax credit transfer diligence",
  anchorLabel: "Term sheet",
  question: "Do the assumptions behind the term sheet's credit amount survive diligence?",
  context:
    "Buyer-side diligence of a transfer of a §48E investment tax credit under §6418. The term sheet is the baseline; the seller's data room is current evidence. Values in tax documents are exact; never round.",
  assumptions,
  metrics,
};
