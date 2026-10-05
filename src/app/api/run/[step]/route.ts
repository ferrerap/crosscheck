// One POST route per pipeline step, so each stays well under serverless time limits.
// Body: { playbookId, ...slices from previous steps }.
import { loadDataRoom } from "@/engine/dataroom";
import { classifyDocs, extractBaseline, gatherEvidence, reconcile } from "@/engine/pipeline";
import { getPlaybook } from "@/playbooks";

export const maxDuration = 300;

export async function POST(req: Request, ctx: { params: Promise<{ step: string }> }) {
  const { step } = await ctx.params;
  try {
    const body = await req.json();
    const p = getPlaybook(body.playbookId ?? "itc-transfer");
    const docs = await loadDataRoom(p.id);

    switch (step) {
      case "extract": {
        const { baseline, usage } = await extractBaseline(p, docs);
        const meta = docs.map((d) => ({ id: d.id, filename: d.filename, sha256: d.sha256, role: d.role }));
        return Response.json({ docs: meta, baseline, usage });
      }
      case "classify":
        return Response.json(await classifyDocs(p, docs, body.baseline));
      case "evidence":
        return Response.json(await gatherEvidence(p, docs, body.baseline, body.classifications));
      case "reconcile":
        return Response.json(await reconcile(p, docs, body.baseline, body.evidence));
      default:
        return Response.json({ error: `Unknown step: ${step}` }, { status: 404 });
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return Response.json({ error: message }, { status: 500 });
  }
}
