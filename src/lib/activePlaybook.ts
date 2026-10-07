// The playbook this deployment serves. One codebase, one deploy per deal type:
// NEXT_PUBLIC_PLAYBOOK=itc-transfer (default) or, later, project-loi.
import { getPlaybook } from "@/playbooks";

export const activePlaybook = getPlaybook(process.env.NEXT_PUBLIC_PLAYBOOK ?? "itc-transfer");

/**
 * Public demo deployments are replay-only: no live Claude calls, no uploads, no API key needed. The browser reads
 * NEXT_PUBLIC_REPLAY_ONLY (inlined at build time); the server honours that or the server-only CROSSCHECK_REPLAY_ONLY,
 * so a deploy that sets either one refuses live work even if the client bundle was built without the flag.
 */
export const replayOnly = process.env.NEXT_PUBLIC_REPLAY_ONLY === "1";
export const serverReplayOnly = () => process.env.CROSSCHECK_REPLAY_ONLY === "1" || process.env.NEXT_PUBLIC_REPLAY_ONLY === "1";
