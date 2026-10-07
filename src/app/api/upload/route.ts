// Receives a dropped term sheet + data room (multipart: "termSheet" and repeated "dataRoom" fields),
// saves them as a numbered data room (anchor first) and returns a runId for the pipeline routes.
// Local/dev feature: serverless deployments don't share disk between requests.
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { uploadDir } from "@/engine/dataroom";
import { serverReplayOnly } from "@/lib/activePlaybook";

const MAX_FILES = 30;
const MAX_BYTES = 20 * 1024 * 1024;

// UploadStep applies the same checks (count, .pdf extension, size) as files are added; keep the two in step.
/** Why a file is refused, naming it; null when it is accepted. */
function refusal(f: File): string | null {
  if (!f.name.toLowerCase().endsWith(".pdf")) return `${f.name} is not a .pdf file.`;
  if (f.size > MAX_BYTES) return `${f.name} is over ${MAX_BYTES / 1024 / 1024} MB.`;
  return null;
}

/** A filesystem-safe name that keeps its .pdf extension, which the data room loader requires. */
function safeName(name: string) {
  return `${name.replace(/\.pdf$/i, "").replace(/[^\w.\- ]+/g, "_").slice(0, 116) || "document"}.pdf`;
}

export async function POST(req: Request) {
  if (serverReplayOnly())
    return Response.json({ error: "This public demo is replay-only. Run Crosscheck locally to analyze documents live." }, { status: 403 });
  try {
    const form = await req.formData();
    const termSheet = form.get("termSheet");
    const room = form.getAll("dataRoom").filter((f): f is File => f instanceof File);
    if (!(termSheet instanceof File)) return Response.json({ error: "No term sheet was uploaded." }, { status: 400 });
    if (room.length === 0) return Response.json({ error: "Add at least one data room PDF." }, { status: 400 });
    const files = [termSheet, ...room];
    // Every file is checked before anything is written; a refused file is named, never silently skipped.
    if (files.length > MAX_FILES)
      return Response.json({ error: `${files.length} files: at most ${MAX_FILES} can be uploaded at once.` }, { status: 400 });
    for (const f of files) {
      const why = refusal(f);
      if (why) return Response.json({ error: why }, { status: 400 });
    }

    const runId = crypto.randomUUID();
    const dir = uploadDir(runId);
    try {
      await fs.mkdir(dir, { recursive: true });
      const saved: string[] = [];
      for (const [i, f] of files.entries()) {
        // Numbered with no gaps: 01_ is the term sheet (the anchor), then the data room in upload order.
        const name = `${String(i + 1).padStart(2, "0")}_${safeName(f.name.replace(/^\d+_/, ""))}`;
        await fs.writeFile(path.join(dir, name), new Uint8Array(await f.arrayBuffer()));
        saved.push(name);
      }
      return Response.json({ runId, files: saved });
    } catch (err) {
      await fs.rm(dir, { recursive: true, force: true }).catch(() => {}); // leave no half-written data room behind
      throw err;
    }
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
