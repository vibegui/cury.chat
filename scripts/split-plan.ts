#!/usr/bin/env bun
// Fatia o plano de governo em um documento por seção.
//
//   bun run split-plan
//
// Por que isto existe, medido e não suposto:
//
//   "polícia FOCO Força de Combate Preventivo"   → 6/10 citações do plano
//   "o que ele propõe sobre segurança pública"   → 0/10 do plano, 9/10 do YouTube
//
// O plano está indexado e é recuperável. O problema é que embedding premia
// semelhança de estilo, e num arquivo único de 320 KB os trechos formais do
// plano perdem para legendas coloquiais de YouTube exatamente nas perguntas que
// um eleitor digita. Um arquivo por tema dá a cada seção um documento coerente
// e curto, com o título do tema no topo — que é o que a consulta natural casa.
//
// A saída substitui o arquivo único no R2. O original continua em corpus/ como
// fonte da fatia, mas não é mais enviado (ver scripts/upload-corpus.ts).

import { readFileSync, mkdirSync, writeFileSync, rmSync, existsSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dir, "..");
const SOURCE = join(
	ROOT,
	"corpus",
	"01. Plano de Governo - O Brasil dos Nossos Sonhos (TSE 2026) - Augusto Cury.md",
);
const OUT_DIR = join(ROOT, "corpus", "plano");

/** Cabeçalho de proveniência do arquivo original, replicado em cada fatia. */
function provenance(raw: string): string {
	const end = raw.indexOf("---");
	return end > 0 ? raw.slice(0, end).trim() : "";
}

interface Section {
	title: string;
	body: string;
}

function split(raw: string): Section[] {
	const lines = raw.split("\n");
	const sections: Section[] = [];
	let title = "Abertura";
	let buf: string[] = [];

	for (const line of lines) {
		// Só títulos de primeiro nível: `## 7. SEGURANÇA PÚBLICA 4.0`, `## PROJETO
		// 3 - MULHERES VIVAS`, `## TRÊS GRANDES REFORMAS`. Subtítulos em minúscula
		// (`## a) Integração…`) continuam dentro da seção a que pertencem.
		const heading = line.match(/^##\s+([0-9]+\.\s+)?([A-ZÀ-Ú][A-ZÀ-Ú0-9 ,.'’\-()/]{5,})\s*$/);
		if (heading) {
			if (buf.join("").trim()) sections.push({ title, body: buf.join("\n") });
			title = line.replace(/^##\s+/, "").trim();
			buf = [];
			continue;
		}
		buf.push(line);
	}
	if (buf.join("").trim()) sections.push({ title, body: buf.join("\n") });
	return sections;
}

/** Nome de arquivo estável e legível — vira o rótulo da citação na resposta. */
function slugTitle(title: string): string {
	return title
		.replace(/\s+/g, " ")
		.replace(/[^\p{L}\p{N} .\-]/gu, "")
		.trim()
		.slice(0, 70);
}

/**
 * Junta seções curtas na anterior. O plano usa títulos em caixa alta tanto para
 * as 20 teses quanto para subitens ("2. CRIAÇÃO DA FOCO"), e cortar em todos
 * produzia 142 fragmentos de 1 KB — que embedam pior que o arquivo único,
 * porque perdem o contexto de onde vieram. O alvo é um documento coerente por
 * tema, não o menor pedaço possível.
 */
function coalesce(sections: Section[], minChars = 5000): Section[] {
	const out: Section[] = [];
	for (const section of sections) {
		const previous = out[out.length - 1];
		if (previous && previous.body.length < minChars) {
			previous.body += `\n\n## ${section.title}\n\n${section.body}`;
			continue;
		}
		out.push({ ...section });
	}
	return out;
}

const raw = readFileSync(SOURCE, "utf8");
const header = provenance(raw);
const sections = coalesce(split(raw).filter((s) => s.body.trim().length > 200));

if (existsSync(OUT_DIR)) rmSync(OUT_DIR, { recursive: true });
mkdirSync(OUT_DIR, { recursive: true });

sections.forEach((section, i) => {
	const n = String(i + 1).padStart(2, "0");
	const name = `01.${n} Plano de Governo — ${slugTitle(section.title)} - Augusto Cury.md`;
	// O título entra também no corpo: é ele que faz a consulta natural
	// ("segurança pública") casar com o documento certo.
	const body = `${header}\n\n# Plano de governo — ${section.title}\n\nTrecho do plano de governo "O Brasil dos Nossos Sonhos", de Augusto Cury, protocolado no TSE em 13/08/2026. Seção: ${section.title}.\n\n---\n\n${section.body.trim()}\n`;
	writeFileSync(join(OUT_DIR, name), body);
	console.log(`${name.padEnd(78)} ${(body.length / 1024).toFixed(0)} KB`);
});

console.log(`\n${sections.length} seções em corpus/plano/`);
console.log("Agora: bun run upload-corpus --remote  e sincronize o AutoRAG.");
