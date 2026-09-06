// Meta retries webhook deliveries aggressively. Without this, a slow LLM reply
// would cause the same message to be answered 2-3 times.

import type { Env } from "../env.ts";

const TTL_SECONDS = 60 * 60 * 24; // 24h is plenty; Meta retries stop way before this

export async function alreadyProcessed(env: Env, messageId: string): Promise<boolean> {
	return (await env.DEDUPE.get(`msg:${messageId}`)) !== null;
}

export async function markProcessed(env: Env, messageId: string): Promise<void> {
	await env.DEDUPE.put(`msg:${messageId}`, "1", { expirationTtl: TTL_SECONDS });
}
