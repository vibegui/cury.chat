#!/usr/bin/env bun

// Seed the CONFIG KV namespace with the bundled system prompt as a baseline,
// so you can later edit it live via `wrangler kv key put` without redeploying.
//
// You normally do NOT need to run this — the worker falls back to the bundled
// prompt automatically. Only run when you want the prompt in KV (e.g. to edit
// it without a redeploy).
//
// Usage:
//   bun run seed-prompt           # local KV
//   bun run seed-prompt --remote  # production KV

import { execSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

const PROMPT_PATH = join(import.meta.dir, "..", "prompts", "cury-chat.md");
const remote = process.argv.includes("--remote") ? "--remote" : "";

async function main() {
	const prompt = await readFile(PROMPT_PATH, "utf8");
	const tmp = `/tmp/cury-prompt-${Date.now()}.md`;
	await Bun.write(tmp, prompt);

	const cmd = `wrangler kv key put --binding=CONFIG system-prompt --path "${tmp}" ${remote}`;
	console.log(cmd);
	execSync(cmd, { stdio: "inherit" });
	console.log("Seeded CONFIG:system-prompt");
}

main();
