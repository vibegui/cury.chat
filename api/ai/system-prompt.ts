// System prompt loading. Two sources, in order:
//   1. CONFIG KV key "system-prompt" — lets you edit the prompt without redeploying.
//   2. Bundled fallback from prompts/cury-chat.md (imported as text via the
//      wrangler.toml `[[rules]] type="Text"` rule).
//
// To override at runtime: `wrangler kv key put --binding=CONFIG system-prompt "$(cat new-prompt.md)"`

// @ts-expect-error — markdown imported as text via wrangler.toml [[rules]] type="Text"
import bundledPrompt from "../../prompts/cury-chat.md";
import type { Env } from "../env.ts";

const BUNDLED: string = bundledPrompt as string;

export async function loadSystemPrompt(env: Env): Promise<string> {
	const override = await env.CONFIG.get("system-prompt");
	return override?.trim() || BUNDLED;
}

export function bundledSystemPrompt(): string {
	return BUNDLED;
}
