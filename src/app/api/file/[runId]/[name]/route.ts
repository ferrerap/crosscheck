// Serves an uploaded PDF back to the viewer: GET /api/file/<runId>/<filename>
import fs from "node:fs/promises";
import path from "node:path";
import { uploadDir } from "@/engine/dataroom";
import { serverReplayOnly } from "@/lib/activePlaybook";

export async function GET(_req: Request, ctx: { params: Promise<{ runId: string; name: string }> }) {
  const { runId, name } = await ctx.params;
  if (serverReplayOnly()) return new Response("Not found", { status: 404 });
  try {
    const file = path.basename(decodeURIComponent(name)); // no path traversal
    const bytes = await fs.readFile(path.join(uploadDir(runId), file));
    return new Response(new Uint8Array(bytes), { headers: { "Content-Type": "application/pdf" } });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}
