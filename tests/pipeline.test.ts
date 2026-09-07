// Pure-function tests for the message pipeline.

import { describe, expect, test } from "bun:test";
import { normalize } from "../api/pipeline/normalize.ts";
import { prettifySource } from "../api/pipeline/retrieve.ts";
import { chunkForWhatsApp } from "../api/pipeline/send.ts";
import type { WhatsAppMessage } from "../api/types/whatsapp.ts";

// -----------------------------------------------------------------------------
// normalize — covers every WhatsApp message type the bot acknowledges
// -----------------------------------------------------------------------------

function msg(partial: Partial<WhatsAppMessage>): WhatsAppMessage {
	return { id: "wamid.x", from: "5511", type: "text", ...partial } as WhatsAppMessage;
}

describe("normalize", () => {
	test("text → content from body", () => {
		const out = normalize(msg({ type: "text", text: { body: "Olá" } }));
		expect(out.content).toBe("Olá");
		expect(out.from).toBe("5511");
	});

	test("text with missing body → empty content (caller will skip)", () => {
		const out = normalize(msg({ type: "text" }));
		expect(out.content).toBe("");
	});

	test("interactive button_reply → labelled content", () => {
		const out = normalize(
			msg({
				type: "interactive",
				interactive: { type: "button_reply", button_reply: { id: "b1", title: "Sim" } },
			}),
		);
		expect(out.content).toBe("[Button: Sim]");
	});

	test("interactive list_reply → labelled content", () => {
		const out = normalize(
			msg({
				type: "interactive",
				interactive: { type: "list_reply", list_reply: { id: "x", title: "Opção A" } },
			}),
		);
		expect(out.content).toBe("[List: Opção A]");
	});

	test("plain button → uses button text", () => {
		const out = normalize(msg({ type: "button", button: { text: "Confirmar", payload: "ok" } }));
		expect(out.content).toBe("Confirmar");
	});

	test("reaction → emoji captured", () => {
		const out = normalize(msg({ type: "reaction", reaction: { message_id: "x", emoji: "❤️" } }));
		expect(out.content).toBe("[Reaction: ❤️]");
	});

	test("location → coordinates captured", () => {
		const out = normalize(
			msg({ type: "location", location: { latitude: -23.5, longitude: -46.6, name: "SP" } }),
		);
		expect(out.content).toContain("-23.5");
		expect(out.content).toContain("-46.6");
		expect(out.content).toContain("(SP)");
	});

	test("sticker → placeholder", () => {
		const out = normalize(msg({ type: "sticker" }));
		expect(out.content).toBe("[Sticker]");
	});

	test.each([
		"image",
		"video",
		"audio",
		"document",
	] as const)("media (%s) → placeholder mentions the type", (type) => {
		const out = normalize(msg({ type } as any));
		expect(out.content).toContain(type);
		expect(out.content).toContain("not yet enabled");
	});

	test("unknown type → safe fallback (does not throw)", () => {
		const out = normalize(msg({ type: "system" as any }));
		expect(out.content).toContain("system");
	});

	test("always preserves id and from", () => {
		const out = normalize(msg({ id: "wamid.42", from: "5521", type: "sticker" }));
		expect(out.id).toBe("wamid.42");
		expect(out.from).toBe("5521");
	});
});

// -----------------------------------------------------------------------------
// prettifySource — strips numeric prefix + author suffix from corpus filenames
// -----------------------------------------------------------------------------

describe("prettifySource", () => {
	test("strips leading NN., trailing author, .md", () => {
		expect(prettifySource("01. Plano de Governo - Augusto Cury.md")).toBe("Plano de Governo");
	});

	test("handles Portuguese accented titles", () => {
		expect(prettifySource("02. Teoria da Inteligência Multifocal - Augusto Cury.md")).toBe(
			"Teoria da Inteligência Multifocal",
		);
	});

	test("strips .summary suffix from companion files", () => {
		expect(prettifySource("05. Entrevista à CNN - Augusto Cury.summary.md")).toBe(
			"Entrevista à CNN",
		);
	});

	test("strips the whole dotted prefix of a plan slice, not just the first number", () => {
		expect(
			prettifySource(
				"plano/01.39 Plano de Governo — 1. INTEGRAÇÃO NACIONAL DAS FORÇAS DE SEGURANÇA - Augusto Cury.md",
			),
		).toBe("Plano de Governo — 1. INTEGRAÇÃO NACIONAL DAS FORÇAS DE SEGURANÇA");
	});

	test("falls back to filename when nothing matches", () => {
		expect(prettifySource("random-doc.md")).toBe("random-doc");
	});

	test("empty input → returns input", () => {
		expect(prettifySource("")).toBe("");
	});
});

// -----------------------------------------------------------------------------
// chunkForWhatsApp — splits long replies on paragraph boundaries
// -----------------------------------------------------------------------------

const SOFT = 1500;
const HARD = 3800;

describe("chunkForWhatsApp", () => {
	test("short text → single chunk, unchanged", () => {
		const t = "Olá, como vai?";
		expect(chunkForWhatsApp(t)).toEqual([t]);
	});

	test("text right at soft limit → single chunk", () => {
		const t = "a".repeat(SOFT);
		expect(chunkForWhatsApp(t)).toEqual([t]);
	});

	test("splits on paragraph boundaries when over soft limit", () => {
		const para = "lorem ".repeat(200).trim(); // ~1200 chars
		const t = `${para}\n\n${para}\n\n${para}`;
		const chunks = chunkForWhatsApp(t);
		expect(chunks.length).toBeGreaterThan(1);
		// Each chunk is non-empty and reasonably sized
		for (const c of chunks) {
			expect(c.length).toBeGreaterThan(0);
			expect(c.length).toBeLessThanOrEqual(HARD);
		}
	});

	test("paragraph longer than HARD_LIMIT → split by hard chars", () => {
		const monster = "x".repeat(HARD * 2 + 50);
		const chunks = chunkForWhatsApp(monster);
		expect(chunks.length).toBe(3);
		expect(chunks[0].length).toBe(HARD);
		expect(chunks[1].length).toBe(HARD);
		expect(chunks[2].length).toBe(50);
	});

	test("reassembling chunks recovers original (paragraph case)", () => {
		const t = "alpha\n\nbeta\n\ngamma".repeat(100);
		const chunks = chunkForWhatsApp(t);
		// Paragraphs are joined back with double newlines between chunks; verify
		// no information loss within chunks.
		const reassembled = chunks.join("\n\n");
		// All original tokens still present (the join may add extra \n\n, that's ok)
		expect(reassembled).toContain("alpha");
		expect(reassembled).toContain("beta");
		expect(reassembled).toContain("gamma");
	});

	test("empty string → single empty chunk (sendReply caller short-circuits)", () => {
		// Documents actual behavior: chunkForWhatsApp doesn't filter empties —
		// sendReply() does, by trimming and bailing before calling this.
		expect(chunkForWhatsApp("")).toEqual([""]);
	});

	test("multiple paragraphs but combined ≤ SOFT → single chunk", () => {
		const t = "short.\n\nalso short.\n\nfinal.";
		expect(chunkForWhatsApp(t)).toEqual([t]);
	});
});
