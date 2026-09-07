#!/usr/bin/env bun
// Preenche content/topics.json rodando cada tópico contra o agente publicado.
//
//   bun run topics              # só os que ainda não têm resposta
//   bun run topics --force      # regenera todos
//   bun run topics educacao     # um slug específico
//
// Isto é rascunho, não é o que a página serve. O corpo de /tema/:slug é
// escrito à mão em content/topics.ts — a resposta do agente vinha com
// preâmbulo e fecho de conversa, e o retrieval deixava capítulo inteiro do
// plano de fora. O que sobra de valor aqui é comparação: rodar depois de mexer
// no prompt ou no acervo e ver o que o agente responderia hoje.
//
// A saída, content/topics.json, é commitada e revisável.

import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { TOPICS } from "../content/topics.ts";

const BASE = process.env.CURY_BASE_URL || "https://cury.chat";
const TOKEN = process.env.MCP_AUTH_TOKEN;
if (!TOKEN) {
	console.error("MCP_AUTH_TOKEN não definido. Ele está em .dev.vars.");
	process.exit(1);
}

const OUT = join(import.meta.dir, "..", "content", "topics.json");

export interface GeneratedTopic {
	slug: string;
	answer: string;
	sources: string[];
	model: string;
	generatedAt: string;
}

const args = process.argv.slice(2);
const force = args.includes("--force");
const only = args.filter((a) => !a.startsWith("--"));

let existing: Record<string, GeneratedTopic> = {};
try {
	existing = (await Bun.file(OUT).json()) as Record<string, GeneratedTopic>;
} catch {
	// primeira execução
}

const selected = TOPICS.filter((t) => (only.length ? only.includes(t.slug) : true));

for (const topic of selected) {
	if (existing[topic.slug] && !force) {
		console.log(`skip   ${topic.slug}`);
		continue;
	}

	process.stdout.write(`gerar  ${topic.slug} … `);
	const res = await fetch(`${BASE}/test`, {
		method: "POST",
		headers: { authorization: `Bearer ${TOKEN}`, "content-type": "application/json" },
		// persist:false — estas consultas não são conversa de ninguém e não
		// devem aparecer no dashboard como se fossem.
		body: JSON.stringify({
			from: `topic-${topic.slug}`,
			text: topic.query,
			persist: false,
		}),
	});

	if (!res.ok) {
		console.log(`FALHOU ${res.status}`);
		continue;
	}

	const data = (await res.json()) as {
		reply: string;
		citations: { source: string }[];
		model: string;
	};

	existing[topic.slug] = {
		slug: topic.slug,
		answer: data.reply.trim(),
		// Ordem preservada: as primeiras são as de maior score.
		sources: [...new Set(data.citations.map((c) => c.source))],
		model: data.model,
		generatedAt: new Date().toISOString(),
	};

	console.log(`${data.reply.length} chars, ${existing[topic.slug].sources.length} fontes`);
}

// Mantém a ordem de content/topics.ts para o diff ser legível.
const ordered: Record<string, GeneratedTopic> = {};
for (const t of TOPICS) if (existing[t.slug]) ordered[t.slug] = existing[t.slug];

writeFileSync(OUT, `${JSON.stringify(ordered, null, "\t")}\n`);
console.log(`\n${Object.keys(ordered).length} tópicos em content/topics.json`);
console.log("Leia o diff antes de commitar — é isso que vai virar página pública.");
