// One POST route per pipeline step, so each stays well under serverless time limits.
// Body: { playbookId, runId?, ...slices from previous steps }, validated before it reaches a prompt.
import { z } from "zod";
import { loadDataRoom } from "@/engine/dataroom";
import { classifyDocs, extractBaseline, gatherEvidence, reconcile } from "@/engine/pipeline";
import type { BaselineAssumption, DocClassification, Evidence } from "@/engine/types";
import { serverReplayOnly } from "@/lib/activePlaybook";
import { getPlaybook } from "@/playbooks";

export const maxDuration = 300;

// Shape checks for the slices the browser sends back. They are objects the server produced in earlier steps;
// this guards against malformed or oversized input rather than re-validating every field.
const list = (max: number) => z.array(z.object({}).passthrough()).max(max);
const Body = z.object({
  playbookId: z.string().max(64).optional(),
  runId: z.string().max(64).optional(),
  baseline: list(100).optional(),
  classifications: list(200).optional(),
  evidence: list(1000).optional(),
});

export async function POST(req: Request, ctx: { params: Promise<{ step: string }> }) {
  const { step } = await ctx.params;
  if (serverReplayOnly())
    return Response.json({ error: "This public demo is replay-only. Run Crosscheck locally to analyze documents live." }, { status: 403 });
  try {
    const parsed = Body.safeParse(await req.json());
    if (!parsed.success) return Response.json({ error: "Malformed request body." }, { status: 400 });
    const body = parsed.data;
    const p = getPlaybook(body.playbookId ?? "itc-transfer");
    const docs = await loadDataRoom(p.id, body.runId);
    const baseline = (body.baseline ?? []) as unknown as BaselineAssumption[];
    const classifications = (body.classifications ?? []) as unknown as DocClassification[];
    const evidence = (body.evidence ?? []) as unknown as Evidence[];

    switch (step) {
      case "extract": {
        const { baseline: extracted, usage } = await extractBaseline(p, docs);
        const meta = docs.map((d) => ({ id: d.id, filename: d.filename, sha256: d.sha256, role: d.role, textless: d.textless }));
        return Response.json({ docs: meta, baseline: extracted, usage });
      }
      case "classify":
        return Response.json(await classifyDocs(p, docs, baseline));
      case "evidence":
        return Response.json(await gatherEvidence(p, docs, baseline, classifications));
      case "reconcile":
        return Response.json(await reconcile(p, docs, baseline, evidence, classifications));
      default:
        return Response.json({ error: `Unknown step: ${step}` }, { status: 404 });
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return Response.json({ error: message }, { status: 500 });
  }
}
