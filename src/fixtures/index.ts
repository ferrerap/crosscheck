// Recorded live runs, one per playbook, used by replay mode.
import type { Run } from "@/engine/types";
import itcTransfer from "./replay-itc-transfer.json";

export const replayFixtures: Record<string, Run> = {
  "itc-transfer": itcTransfer as unknown as Run,
};
