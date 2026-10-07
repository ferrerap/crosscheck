// Loads a playbook's demo data room from public/demo-data/<playbookId>/.
// Convention: the anchor document's filename starts with "01_"; docs get ids D01, D02, ... in filename order.
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { ingest } from "./ingest";
import type { DocRecord } from "./types";

const cache = new Map<string, DocRecord[]>();

/** Folder for an uploaded data room (local/dev use; serverless instances don't share disk). */
export function uploadDir(runId: string): string {
  if (!/^[a-z0-9-]{8,64}$/i.test(runId)) throw new Error("Invalid run id");
  return path.join(os.tmpdir(), "crosscheck-uploads", runId);
}

/** Loads the demo data room for a playbook, or an uploaded one when `runId` is given. */
export async function loadDataRoom(playbookId: string, runId?: string): Promise<DocRecord[]> {
  const key = runId ? `upload:${runId}` : playbookId;
  const hit = cache.get(key);
  if (hit) return hit;
  const dir = runId ? uploadDir(runId) : path.join(process.cwd(), "public", "demo-data", playbookId);
  const files = (await fs.readdir(dir)).filter((f) => f.toLowerCase().endsWith(".pdf")).sort();
  const docs: DocRecord[] = [];
  for (const [i, f] of files.entries()) {
    const bytes = new Uint8Array(await fs.readFile(path.join(dir, f)));
    docs.push(await ingest(`D${String(i + 1).padStart(2, "0")}`, f, bytes, i === 0 ? "anchor" : "dataroom"));
  }
  cache.set(key, docs);
  // Keep only the most recent uploaded data rooms in memory (the demo data room always stays).
  const uploads = [...cache.keys()].filter((k) => k.startsWith("upload:"));
  for (const k of uploads.slice(0, Math.max(0, uploads.length - 3))) cache.delete(k);
  return docs;
}

/**
 * Document text is untrusted: escape markup so a PDF cannot close a <page> tag and impersonate another document.
 * Anything that re-enters a prompt after passing through the model (quotes, displays, notes) goes through it too.
 */
export const escapeText = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** Render documents as page-tagged text for prompts. Page tags let Claude cite pages we can verify. */
export function renderDocs(docs: DocRecord[]): string {
  return docs
    .map((d) =>
      [`<document id="${d.id}" filename="${escapeText(d.filename)}" role="${d.role}">`,
        ...d.pages.map((p, i) =>
          `<page number="${i + 1}">\n${p.trim().length < 20 ? "[No extractable text on this page; likely a scanned image. Not read.]" : escapeText(p)}\n</page>`),
        "</document>"].join("\n"),
    )
    .join("\n\n");
}
