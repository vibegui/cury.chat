// RAG retrieval via Cloudflare AI Search (AutoRAG).
//
// AI Search owns the chunking + embedding + search + reranking. We call
// env.AUTORAG.search({ query, ai_search_options }) and get back top-k passages.
//
// IMPORTANT — option shape & two gotchas we hit:
//
//  1. Retrieval/rerank tuning lives under nested keys (`retrieval`,
//     `query_rewrite`, `reranking`), NOT at the top of `ai_search_options`.
//     Passing `{ max_num_results, rewrite_query }` flat (as we did originally)
//     is silently ignored, so the instance defaults apply.
//
//  2. The instance default has RERANKING ON, and the reranker was dropping
//     *every* result (cross-lingual PT-query / EN-corpus rerank scored below
//     threshold). Plain vector search, by contrast, returns excellent matches
//     (scores ~0.9+ for both PT and EN queries — the embedder is multilingual).
//     So we disable reranking and gate on the vector score instead.
//
//  3. Workers AI free tier is 10,000 neurons/day. Embedding, reranking, and
//     query-rewrite each burn neurons; once exhausted, *all* retrieval throws
//     ("4006") and falls back to no citations for the rest of the day. We keep
//     usage minimal (query embedding only — no rerank, no rewrite) to stretch
//     the allocation. For reliable RAG the account needs the Workers Paid plan.
//
// The AUTORAG binding is defined in wrangler.toml under [[ai_search]]. Set
// AUTORAG_INSTANCE empty to disable RAG (we short-circuit on the empty string).

import type { Env } from "../env.ts";

export interface Citation {
	text: string;
	source: string; // markdown filename → book title
	score?: number;
}

// Measured against the live index (PT query, PT-only corpus):
//   "O que é inteligência multifocal?"        → 1.00, 0.96, 0.95, 0.94, 0.91
//   "Qual a proposta de Cury para a educação?" → 0.68, 0.67, 0.66, 0.66, 0.64
//   "receita de bolo de cenoura"               → nothing above 0.45
// Off-topic is cleanly cut off, so 0.45 holds. Re-measure whenever the corpus
// composition changes — adding short news pieces next to the 200-page plan
// moves the on-topic floor. return_on_failure:false so a real retrieval error
// surfaces (and is caught/logged) instead of silently returning empty.
const MATCH_THRESHOLD = 0.45;

// Cury's proposals are spread thin across a 200-page plan — give the model
// generous grounding so a single proposal isn't cut in half. Returning
// more/longer chunks costs no extra Workers AI neurons (the embedding is one
// call regardless of result count); it only adds cheap input tokens to the
// 1M-context flash model.
export async function retrieve(env: Env, query: string, topK = 10): Promise<Citation[]> {
	if (!env.AUTORAG_INSTANCE?.trim() || !env.AUTORAG) {
		return [];
	}

	try {
		const res = await env.AUTORAG.search({
			query,
			ai_search_options: {
				retrieval: {
					max_num_results: topK,
					match_threshold: MATCH_THRESHOLD,
					context_expansion: 2,
					return_on_failure: false,
				},
				query_rewrite: { enabled: false },
				reranking: { enabled: false },
			},
		});

		const chunks = res.chunks ?? [];
		// Observability: surfaces in `wrangler tail` so RAG health is checkable.
		console.log("autorag", {
			q: query.slice(0, 60),
			rewritten: res.search_query,
			hits: chunks.length,
			scores: chunks.slice(0, 5).map((c) => Number(c.score?.toFixed?.(3))),
		});

		return chunks.map((c) => ({
			text: c.text,
			source: prettifySource(c.item?.key ?? "unknown"),
			score: c.score,
		}));
	} catch (err) {
		console.warn("AutoRAG search failed", err);
		return [];
	}
}

export function prettifySource(filename: string): string {
	// "01. Plano de Governo - Augusto Cury.md" → "Plano de Governo"
	//
	// The prefix is dotted, not a single number: the plan slices are named
	// "01.39 …" so they sort under the original document. A `^\d+\.` pattern ate
	// only the "01." and left a bare "39" in front of the citation the reader
	// sees.
	const noDir = filename.replace(/^.*\//, "");
	const noExt = noDir.replace(/\.md$/i, "").replace(/\.summary$/i, "");
	const stripPrefix = noExt.replace(/^\d+(?:\.\d+)*\.?\s*/, "");
	const stripAuthor = stripPrefix.replace(/\s*-\s*Augusto Cury\s*$/, "");
	return stripAuthor || filename;
}

export function formatCitationsBlock(citations: Citation[]): string {
	if (citations.length === 0) return "";
	const lines = citations.map((c, i) => {
		// Keep most of the passage — a proposal cut mid-sentence invites the
		// model to fill the gap. The flash model has plenty of context budget.
		const text = c.text.length > 2800 ? `${c.text.slice(0, 2800)}…` : c.text;
		return `[${i + 1}] (${c.source})\n${text}`;
	});
	return [
		"<context>",
		"Passagens recuperadas de materiais públicos sobre Augusto Cury (plano de governo, e-books gratuitos, falas e entrevistas).",
		"Os números [1], [2], … são apenas para organizar este bloco: NUNCA os escreva na resposta — quem lê não os vê. Quando citar, use o nome da fonte entre parênteses.",
		"",
		lines.join("\n\n"),
		"</context>",
	].join("\n");
}
