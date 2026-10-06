// The playbook this deployment serves. One codebase, one deploy per deal type:
// NEXT_PUBLIC_PLAYBOOK=itc-transfer (default) or, later, project-loi.
import { getPlaybook } from "@/playbooks";

export const activePlaybook = getPlaybook(process.env.NEXT_PUBLIC_PLAYBOOK ?? "itc-transfer");

/** Public demo deployments set NEXT_PUBLIC_REPLAY_ONLY=1: no live Claude calls, no uploads, no API key needed. */
export const replayOnly = process.env.NEXT_PUBLIC_REPLAY_ONLY === "1";
