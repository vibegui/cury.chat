import { describe, expect, test } from "bun:test";
import {
	isWebThread,
	newConversationId,
	randomSlug,
	titleFrom,
	webThreadId,
} from "../api/pipeline/conversations.ts";

describe("webThreadId", () => {
	test("keeps the `<phone>:<date>` shape the MCP dashboard splits on", () => {
		const id = webThreadId("abc123def456", "2026-09-06-x9cd7q");
		const [left, right] = id.split(":");
		expect(left).toBe("web_abc123def456");
		expect(right).toBe("2026-09-06-x9cd7q");
		// Exactly one colon, or the dashboard's split would mangle the date column.
		expect(id.split(":")).toHaveLength(2);
	});

	test("web threads are distinguishable from phone threads", () => {
		expect(isWebThread(webThreadId("abc123def456", "2026-09-06-aaaaaa"))).toBe(true);
		expect(isWebThread("5511988887777:2026-09-06")).toBe(false);
	});
});

describe("newConversationId", () => {
	test("is date-prefixed so it sorts chronologically", () => {
		const id = newConversationId(new Date("2026-09-06T12:00:00Z"));
		expect(id).toMatch(/^2026-09-06-[a-z0-9]{6}$/);
	});

	test("matches the id the API accepts", () => {
		// Same regex as validConversationId in api/routes/chat.ts — if these drift,
		// the server rejects ids it just minted.
		const accepted = /^\d{4}-\d{2}-\d{2}-[a-z0-9]{4,12}$/;
		for (let i = 0; i < 50; i++) {
			expect(newConversationId()).toMatch(accepted);
		}
	});
});

describe("randomSlug", () => {
	test("avoids glyphs that get misread when a link is typed by hand", () => {
		const sample = Array.from({ length: 200 }, () => randomSlug(10)).join("");
		expect(sample).not.toMatch(/[l1o0]/);
	});

	test("does not collide across a realistic number of shares", () => {
		const seen = new Set(Array.from({ length: 5000 }, () => randomSlug(10)));
		expect(seen.size).toBe(5000);
	});
});

describe("titleFrom", () => {
	test("uses the first message, collapsed to one line", () => {
		expect(titleFrom("  O que ele propõe\n sobre educação?  ")).toBe(
			"O que ele propõe sobre educação?",
		);
	});

	test("truncates long questions with an ellipsis", () => {
		const title = titleFrom("a".repeat(200));
		expect(title).toHaveLength(60);
		expect(title.endsWith("…")).toBe(true);
	});

	test("falls back rather than producing an empty sidebar row", () => {
		expect(titleFrom("   \n  ")).toBe("Nova conversa");
	});
});
