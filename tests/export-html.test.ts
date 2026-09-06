import { describe, expect, test } from "bun:test";
import { mdToHtml, renderThreadsHtml, type ExportThread } from "../api/export/html.ts";
import type { Turn } from "../api/pipeline/persist.ts";

function makeThread(overrides: Partial<ExportThread> = {}): ExportThread {
	const turns: Turn[] = [
		{ role: "user", content: "oi", ts: 1, name: "Gabriel" },
		{
			role: "assistant",
			content: "olá!",
			ts: 2,
			model: "deepseek/deepseek-v4-flash",
			usage: { total_tokens: 100, cost: 0.0001 },
		},
	];
	return {
		threadId: "5511:2026-06-01",
		phone: "5511",
		date: "2026-06-01",
		contactName: "Gabriel",
		turns,
		...overrides,
	};
}

describe("renderThreadsHtml", () => {
	test("produces a self-contained HTML document", () => {
		const html = renderThreadsHtml({ threads: [makeThread()] });
		expect(html).toContain("<!DOCTYPE html>");
		expect(html).toContain("</html>");
		expect(html).toContain("<style>"); // inline CSS, no external assets
		expect(html).not.toMatch(/<link\b/); // no external stylesheets
		expect(html).not.toMatch(/<script\b/); // no JS
	});

	test("escapes user content to prevent HTML injection", () => {
		const t = makeThread({
			turns: [
				{ role: "user", content: "<img src=x onerror=alert(1)>", ts: 1, name: "<Evil>" },
				{ role: "assistant", content: "ok", ts: 2 },
			],
		});
		const html = renderThreadsHtml({ threads: [t] });
		expect(html).not.toContain("<img src=x onerror=alert(1)>");
		expect(html).toContain("&lt;img src=x onerror=alert(1)&gt;");
		expect(html).toContain("&lt;Evil&gt;");
	});

	test("renders index, transcripts, and stats with aggregates", () => {
		const html = renderThreadsHtml({
			threads: [makeThread(), makeThread({ threadId: "5521:2026-06-01", phone: "5521" })],
		});
		expect(html).toContain("Índice");
		expect(html).toContain("Transcrições");
		expect(html).toContain("mensagens totais"); // stats label
		expect(html).toContain("4"); // 2 turns × 2 threads = 4 messages
		expect(html).toContain('href="#conv1"');
		expect(html).toContain('href="#conv2"');
	});

	test("omits the analysis section when no analysis is provided", () => {
		const html = renderThreadsHtml({ threads: [makeThread()] });
		expect(html).not.toContain("Análise");
	});

	test("renders per-thread analysis when provided", () => {
		const html = renderThreadsHtml({
			threads: [makeThread({ analysis: "**Important:** this conversation showed X." })],
		});
		expect(html).toContain("Análise");
		expect(html).toContain("<strong>Important:</strong>");
	});

	test("uses agent-supplied title/subtitle on the thread heading", () => {
		const html = renderThreadsHtml({
			threads: [makeThread({ title: "Gabriel", subtitle: "filósofo" })],
		});
		expect(html).toContain("Gabriel");
		expect(html).toContain("filósofo");
	});

	test("falls back to phone when no contact name or title is set", () => {
		const html = renderThreadsHtml({
			threads: [makeThread({ contactName: undefined, title: undefined })],
		});
		expect(html).toContain("5511");
	});

	test("renders zero-turn threads without crashing", () => {
		const html = renderThreadsHtml({ threads: [makeThread({ turns: [] })] });
		// The index cell wraps the user+bot breakdown in its own span.
		expect(html).toContain('0<span class="brk"> (0+0)</span>');
		expect(html).toContain("0 trocas (0 msgs)");
	});
});

describe("mdToHtml", () => {
	test("wraps plain text in a paragraph", () => {
		expect(mdToHtml("hello world")).toBe("<p>hello world</p>");
	});

	test("splits paragraphs on blank lines", () => {
		expect(mdToHtml("first\n\nsecond")).toBe("<p>first</p>\n<p>second</p>");
	});

	test("converts bold and italic", () => {
		expect(mdToHtml("**bold** and *italic*")).toBe(
			"<p><strong>bold</strong> and <em>italic</em></p>",
		);
	});

	test("renders bullet lists", () => {
		const out = mdToHtml("- one\n- two\n- three");
		expect(out).toBe("<ul><li>one</li><li>two</li><li>three</li></ul>");
	});

	test("escapes raw HTML in markdown", () => {
		const out = mdToHtml("<script>x</script>");
		expect(out).not.toContain("<script>");
		expect(out).toContain("&lt;script&gt;");
	});

	test("empty input returns empty string", () => {
		expect(mdToHtml("")).toBe("");
		expect(mdToHtml("   \n\n  ")).toBe("");
	});
});
