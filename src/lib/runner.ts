// Runner abstraction: the UI talks to a Runner; replay reads the fixture, live calls the API routes.
import type {
  BaselineAssumption,
  DocClassification,
  Evidence,
  Finding,
  Question,
  Run,
  RunUsage,
} from "@/engine/types";
import replayFixture from "@/fixtures/replay-itc-transfer.json";

export type RunnerMode = "replay" | "live";
export type DocMeta = Run["docs"][number];

export interface ExtractResult { docs: DocMeta[]; baseline: BaselineAssumption[]; usage: RunUsage }
export interface ClassifyResult { classifications: DocClassification[]; usage: RunUsage }
export interface EvidenceResult { evidence: Evidence[]; usage: RunUsage }
export interface ReconcileResult { findings: Finding[]; questions: Question[]; usage: RunUsage }

export interface Runner {
  extractBaseline(): Promise<ExtractResult>;
  /** onDoc fires as each document is classified so the UI can stream progress. */
  classifyDocs(
    input: { docs: DocMeta[]; baseline: BaselineAssumption[] },
    onDoc?: (c: DocClassification, index: number, total: number) => void,
  ): Promise<ClassifyResult>;
  gatherEvidence(input: { baseline: BaselineAssumption[]; classifications: DocClassification[] }): Promise<EvidenceResult>;
  reconcile(input: {
    baseline: BaselineAssumption[];
    classifications: DocClassification[];
    evidence: Evidence[];
  }): Promise<ReconcileResult>;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const jitter = (base: number, spread: number) => base + Math.random() * spread;

export function addUsage(a: RunUsage, b: RunUsage): RunUsage {
  return {
    calls: a.calls + b.calls,
    inputTokens: a.inputTokens + b.inputTokens,
    outputTokens: a.outputTokens + b.outputTokens,
    costUsd: Math.round((a.costUsd + b.costUsd) * 100) / 100,
  };
}
export const ZERO_USAGE: RunUsage = { calls: 0, inputTokens: 0, outputTokens: 0, costUsd: 0 };

// Split the fixture's total usage across the four steps so the footer sums to the recorded totals.
const SPLIT = {
  extract: { calls: 1, share: 0.1 },
  classify: { calls: 4, share: 0.3 },
  evidence: { calls: 6, share: 0.4 },
  reconcile: { calls: 3, share: 0.2 },
} as const;
function stepUsage(total: RunUsage, step: keyof typeof SPLIT): RunUsage {
  const s = SPLIT[step];
  const round = (n: number) => Math.round(n);
  if (step === "reconcile") {
    // remainder so totals are exact
    const others = (["extract", "classify", "evidence"] as const).map((k) => stepUsage(total, k));
    const sum = others.reduce(addUsage, ZERO_USAGE);
    return {
      calls: total.calls - sum.calls,
      inputTokens: total.inputTokens - sum.inputTokens,
      outputTokens: total.outputTokens - sum.outputTokens,
      costUsd: Math.round((total.costUsd - sum.costUsd) * 100) / 100,
    };
  }
  return {
    calls: s.calls,
    inputTokens: round(total.inputTokens * s.share),
    outputTokens: round(total.outputTokens * s.share),
    costUsd: Math.round(total.costUsd * s.share * 100) / 100,
  };
}

export class ReplayRunner implements Runner {
  private fx = replayFixture as unknown as Run;

  async extractBaseline(): Promise<ExtractResult> {
    await sleep(jitter(1400, 500));
    return { docs: this.fx.docs, baseline: this.fx.baseline, usage: stepUsage(this.fx.usage, "extract") };
  }

  async classifyDocs(
    _input: { docs: DocMeta[]; baseline: BaselineAssumption[] },
    onDoc?: (c: DocClassification, index: number, total: number) => void,
  ): Promise<ClassifyResult> {
    const list = this.fx.classifications;
    for (let i = 0; i < list.length; i++) {
      await sleep(jitter(420, 380));
      onDoc?.(list[i], i, list.length);
    }
    return { classifications: list, usage: stepUsage(this.fx.usage, "classify") };
  }

  async gatherEvidence(): Promise<EvidenceResult> {
    await sleep(jitter(1800, 600));
    return { evidence: this.fx.evidence, usage: stepUsage(this.fx.usage, "evidence") };
  }

  async reconcile(): Promise<ReconcileResult> {
    await sleep(jitter(1500, 500));
    return {
      findings: this.fx.findings,
      questions: this.fx.questions.map((q) => ({ ...q, answer: undefined })),
      usage: stepUsage(this.fx.usage, "reconcile"),
    };
  }
}

export class LiveRunner implements Runner {
  constructor(private playbookId = "itc-transfer") {}

  private async post<T>(step: string, body: Record<string, unknown>): Promise<T> {
    const res = await fetch(`/api/run/${step}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ playbookId: this.playbookId, ...body }),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`Live run failed at "${step}" (${res.status}). ${text.slice(0, 300)}`);
    }
    return (await res.json()) as T;
  }

  extractBaseline() {
    return this.post<ExtractResult>("extract", {});
  }

  async classifyDocs(
    input: { docs: DocMeta[]; baseline: BaselineAssumption[] },
    onDoc?: (c: DocClassification, index: number, total: number) => void,
  ): Promise<ClassifyResult> {
    // The classify route returns everything at once; reveal results progressively so the UI still streams.
    const res = await this.post<ClassifyResult>("classify", input);
    const list = res.classifications;
    for (let i = 0; i < list.length; i++) {
      onDoc?.(list[i], i, list.length);
      await sleep(120);
    }
    return res;
  }

  gatherEvidence(input: { baseline: BaselineAssumption[]; classifications: DocClassification[] }) {
    return this.post<EvidenceResult>("evidence", input);
  }

  reconcile(input: { baseline: BaselineAssumption[]; classifications: DocClassification[]; evidence: Evidence[] }) {
    return this.post<ReconcileResult>("reconcile", input);
  }
}

export function makeRunner(mode: RunnerMode): Runner {
  return mode === "live" ? new LiveRunner() : new ReplayRunner();
}
