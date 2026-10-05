// Loads a playbook's demo data room from public/demo-data/<playbookId>/.
// Convention: the anchor document's filename starts with "01_"; docs get ids D01, D02, ... in filename order.
import fs from "node:fs/promises";
import path from "node:path";
import { ingest } from "./ingest";
import type { DocRecord } from "./types";

const cache = new Map<string, DocRecord[]>();

export async function loadDataRoom(playbookId: string): Promise<DocRecord[]> {
  const hit = cache.get(playbookId);
  if (hit) return hit;
  const dir = path.join(process.cwd(), "public", "demo-data", playbookId);
  const files = (await fs.readdir(dir)).filter((f) => f.toLowerCase().endsWith(".pdf")).sort();
  const docs: DocRecord[] = [];
  for (const [i, f] of files.entries()) {
    const bytes = new Uint8Array(await fs.readFile(path.join(dir, f)));
    docs.push(await ingest(`D${String(i + 1).padStart(2, "0")}`, f, bytes, i === 0 ? "anchor" : "dataroom"));
  }
  cache.set(playbookId, docs);
  return docs;
}

/** Render documents as page-tagged text for prompts. Page tags let Claude cite pages we can verify. */
export function renderDocs(docs: DocRecord[]): string {
  return docs
    .map((d) =>
      [`<document id="${d.id}" filename="${d.filename}" role="${d.role}">`,
        ...d.pages.map((p, i) => `<page number="${i + 1}">\n${p}\n</page>`),
        "</document>"].join("\n"),
    )
    .join("\n\n");
}
