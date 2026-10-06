import type { Finding } from "@/engine/types";
import { fmtMoney } from "./format";
import { assumptionName } from "./meta";

export interface CreditTag {
  kind: "risk" | "part" | "none";
  text: string;
}

/** The credit-impact tag for one check; null for confirmed checks. Shared by the check rows and the Report. */
export function creditTag(f: Finding, atRisk: Record<string, number>, findings: Map<string, Finding>): CreditTag | null {
  const own = atRisk[f.assumptionId] ?? 0;
  if (own > 0) return { kind: "risk", text: `up to ${fmtMoney(own)} at risk` };
  const parent = f.dependsOn ? atRisk[f.dependsOn] ?? 0 : 0;
  if (f.dependsOn && parent > 0 && findings.has(f.dependsOn))
    return { kind: "part", text: `part of the ${fmtMoney(parent)} on the ${assumptionName(f.dependsOn).toLowerCase()}` };
  if (f.label === "confirmed") return null;
  return { kind: "none", text: "no credit impact" };
}
