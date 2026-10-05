import { itcTransfer } from "./itc-transfer";
import type { Playbook } from "./types";

export const playbooks: Record<string, Playbook> = {
  [itcTransfer.id]: itcTransfer,
};

export function getPlaybook(id: string): Playbook {
  const p = playbooks[id];
  if (!p) throw new Error(`Unknown playbook: ${id}`);
  return p;
}
