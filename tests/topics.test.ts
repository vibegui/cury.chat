// As páginas de tópico são escritas à mão (content/topics.ts). O que quebra
// nelas não é tipo, é voz: um texto colado da resposta do agente traz o
// preâmbulo "Olá! Sou o Cury Chat…" e o fecho "quer que eu detalhe?" para uma
// página que ninguém perguntou nada. Estes testes prendem isso, e prendem
// também as fontes: a lista tem que citar arquivo que existe em corpus/.

import { readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";
import { TOPICS } from "../content/topics.ts";
import { mdToHtml } from "../api/lib/page.ts";

const CORPUS = new Set(
	readdirSync(join(import.meta.dir, "..", "corpus"))
		.filter((f) => f.endsWith(".md"))
		// "01. Plano de Governo (TSE 2026) - Augusto Cury.md" -> "Plano de Governo (TSE 2026)"
		.map((f) => f.replace(/^\d+\.\s*/, "").replace(/\s*-\s*Augusto Cury\.md$/, "")),
);

// Marcas de conversa. Cada uma apareceu de verdade no texto gerado.
const CHAT_VOICE =
	/\bOlá\b|Sou o Cury Chat|\bIA independente|Sobre a sua pergunta|Quer que eu|Posso detalhar|Quer saber mais|Quer detalhar/i;

describe("páginas de tópico", () => {
	test("existe conteúdo para todo tópico", () => {
		expect(TOPICS.length).toBeGreaterThan(0);
		for (const t of TOPICS) {
			expect(t.body.trim().length).toBeGreaterThan(0);
			expect(t.sources.length).toBeGreaterThan(0);
		}
	});

	test("nenhum texto tem voz de chat", () => {
		for (const t of TOPICS) {
			expect(`${t.slug}: ${t.body.match(CHAT_VOICE)?.[0] ?? "ok"}`).toBe(`${t.slug}: ok`);
		}
	});

	test("nenhum texto termina em pergunta", () => {
		for (const t of TOPICS) {
			expect(`${t.slug}: ${t.body.trim().slice(-1)}`).not.toBe(`${t.slug}: ?`);
		}
	});

	test("as fontes existem em corpus/", () => {
		for (const t of TOPICS) {
			for (const s of t.sources) {
				expect(`${t.slug}: ${CORPUS.has(s) ? s : `${s} (fora do acervo)`}`).toBe(`${t.slug}: ${s}`);
			}
		}
	});

	test("bullet vira lista, não hífen solto no parágrafo", () => {
		for (const t of TOPICS) {
			const html = mdToHtml(t.body);
			expect(`${t.slug}: ${html.includes("<p>- ") ? "hífen cru" : "ok"}`).toBe(`${t.slug}: ok`);
		}
	});
});
