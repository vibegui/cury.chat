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

	// O plano inteiro fica em corpus/ como fonte da fatia, mas o que sobe são as
	// seções de corpus/plano/. Enviar os dois faria o plano competir consigo
	// mesmo no índice, e o arquivo de 320 KB é justamente o que perde para
	// legendas de YouTube em pergunta coloquial — ver scripts/split-plan.ts.
	const PLAN_SOURCE = "01. Plano de Governo";
	const root = (await readdir(CORPUS_DIR))
		.filter((f) => f.endsWith(".md") && !f.startsWith(PLAN_SOURCE))
		.map((f) => ({ name: f, path: join(CORPUS_DIR, f) }));

	const planDir = join(CORPUS_DIR, "plano");
	const planned = (await stat(planDir).catch(() => null))?.isDirectory()
		? (await readdir(planDir))
				.filter((f) => f.endsWith(".md"))
				.map((f) => ({ name: f, path: join(planDir, f) }))
		: [];

	const entries = [...root, ...planned].sort((a, b) => a.name.localeCompare(b.name));
	const files = entries.map((e) => e.name);
	if (files.length === 0) {
		console.error("No .md files in corpus/.");
		process.exit(1);
	}

	// wrangler treats the object path as a URL, so these characters do not
	// survive the trip: the key gets truncated at the first `?` and the rest is
	// form-encoded. It fails silently — the upload reports success and the
	// mangled key is only visible later, printed as a citation.
	const unsafe = files.filter((f) => /[?#%+]/.test(f));
	if (unsafe.length > 0) {
		console.error("These filenames would be mangled into the R2 key:");
		for (const f of unsafe) console.error(`  ${f}`);
		console.error("Rename them (see filename() in scripts/fetch-corpus.ts) and run again.");
		process.exit(1);
	}

	console.log(`Uploading ${files.length} files to r2://${BUCKET}/ …`);

	for (const { name: file, path } of entries) {
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
