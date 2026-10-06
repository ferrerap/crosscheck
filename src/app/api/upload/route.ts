// Receives a dropped term sheet + data room (multipart: "termSheet" and repeated "dataRoom" fields),
// saves them as a numbered data room (anchor first) and returns a runId for the pipeline routes.
// Local/dev feature: serverless deployments don't share disk between requests.
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { uploadDir } from "@/engine/dataroom";

const MAX_FILES = 30;
const MAX_BYTES = 20 * 1024 * 1024;

function safeName(name: string) {
  return name.replace(/[^\w.\- ]+/g, "_").slice(0, 120) || "document.pdf";
}

export async function POST(req: Request) {
  try {
    const form = await req.formData();
    const termSheet = form.get("termSheet");
    const room = form.getAll("dataRoom").filter((f): f is File => f instanceof File);
    if (!(termSheet instanceof File)) return Response.json({ error: "Add a term sheet PDF." }, { status: 400 });
    const files = [termSheet, ...room];
    if (files.length > MAX_FILES) return Response.json({ error: `At most ${MAX_FILES} files.` }, { status: 400 });

    const runId = crypto.randomUUID();
    const dir = uploadDir(runId);
    await fs.mkdir(dir, { recursive: true });
    const saved: string[] = [];
    for (const [i, f] of files.entries()) {
      if (!f.name.toLowerCase().endsWith(".pdf")) continue;
      if (f.size > MAX_BYTES) return Response.json({ error: `${f.name} is over 20 MB.` }, { status: 400 });
      const name = `${String(i + 1).padStart(2, "0")}_${safeName(f.name.replace(/^\d+_/, ""))}`;
      await fs.writeFile(path.join(dir, name), new Uint8Array(await f.arrayBuffer()));
      saved.push(name);
    }
    return Response.json({ runId, files: saved });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
