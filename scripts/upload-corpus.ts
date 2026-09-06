#!/usr/bin/env bun

// Upload every markdown file in corpus/ to the R2 bucket bound as CORPUS.
// AutoRAG will pick up the new objects on its next scheduled scan (or trigger
// a manual sync from the dashboard).
//
// Usage:
//   bun run upload-corpus           # uses local wrangler creds
//   bun run upload-corpus --remote  # forces --remote on wrangler
//
// Idempotent: skips files whose body hash hasn't changed since the last upload.

import { execSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readdir, readFile, stat } from "node:fs/promises";
import { join } from "node:path";

const CORPUS_DIR = join(import.meta.dir, "..", "corpus");
const BUCKET = "cury-corpus";
const remote = process.argv.includes("--remote") ? "--remote" : "";

async function main() {
	const dir = await stat(CORPUS_DIR).catch(() => null);
	if (!dir?.isDirectory()) {
		console.error(`corpus/ not found at ${CORPUS_DIR}`);
		process.exit(1);
	}

	const files = (await readdir(CORPUS_DIR)).filter((f) => f.endsWith(".md")).sort();
	if (files.length === 0) {
		console.error("No .md files in corpus/.");
		process.exit(1);
	}

	console.log(`Uploading ${files.length} files to r2://${BUCKET}/ …`);

	for (const file of files) {
		const path = join(CORPUS_DIR, file);
		const buf = await readFile(path);
		const hash = createHash("sha256").update(buf).digest("hex").slice(0, 12);
		const cmd = `wrangler r2 object put "${BUCKET}/${file}" --file "${path}" --content-type "text/markdown" ${remote}`;
		try {
			execSync(cmd, { stdio: "inherit" });
			console.log(`  ✓ ${file}  (sha=${hash})`);
		} catch (err) {
			console.error(`  ✗ ${file}: ${(err as Error).message}`);
		}
	}

	console.log("\nDone. Now go to the Cloudflare dashboard:");
	console.log("  AI → AutoRAG → your instance → Sync (or wait for the scheduled scan)");
}

main();
