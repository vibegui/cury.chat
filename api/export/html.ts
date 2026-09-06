// Deterministic HTML renderer for one or more conversation threads.
//
// Used by the `export_threads_html` MCP tool and by the admin UI's multi-select
// export. Pure function: given threads + optional annotations, returns a
// self-contained HTML string (inline CSS, no external assets). No LLM in the
// rendering path — agents can attach prose by passing per-thread `analysis`.

import { citationSource, citationText, type Turn } from "../pipeline/persist.ts";

export interface ExportThread {
	threadId: string;
	phone: string;
	date: string;
	contactName?: string;
	turns: Turn[];
	// Agent-supplied annotations. All optional.
	title?: string;
	subtitle?: string;
	analysis?: string;
}

export interface ExportInput {
	threads: ExportThread[];
	title?: string;
	subtitle?: string;
	intro?: string;
	model?: string;
	totalThreadsInSystem?: number;
	generatedAt?: Date;
}

const DEFAULT_TITLE = "Cury Chat — Export de Conversas";

export function renderThreadsHtml(input: ExportInput): string {
	const generatedAt = input.generatedAt ?? new Date();
	const title = input.title ?? DEFAULT_TITLE;
	const subtitle =
		input.subtitle ??
		`${input.threads.length} ${input.threads.length === 1 ? "conversa selecionada" : "conversas selecionadas"} · Gerado em ${formatDateBR(generatedAt)}`;

	const totals = computeTotals(input.threads);
	const hasAnalysis = !!input.intro || input.threads.some((t) => t.analysis);

	return [
		`<!DOCTYPE html>`,
		`<html lang="pt-BR">`,
		`<head>`,
		`<meta charset="UTF-8">`,
		`<meta name="viewport" content="width=device-width, initial-scale=1.0">`,
		`<title>${escapeHtml(title)}</title>`,
		`<style>${STYLES}</style>`,
		`</head>`,
		`<body>`,
		`<div class="wrapper">`,
		renderHeader(title, subtitle),
		renderStats(input, totals),
		renderIndex(input.threads),
		hasAnalysis ? renderAnalysisSection(input) : "",
		renderTranscripts(input.threads),
		renderFooter(generatedAt),
		`</div>`,
		input.threads.length >= 2 ? renderNavBar() : "",
		`</body>`,
		`</html>`,
	].join("\n");
}

// -----------------------------------------------------------------------------
// Sections
// -----------------------------------------------------------------------------

function renderHeader(title: string, subtitle: string): string {
	return `
  <div class="header">
    <h1>${escapeHtml(title)}</h1>
    <div class="subtitle">${escapeHtml(subtitle)}</div>
  </div>`;
}

function renderStats(input: ExportInput, totals: Totals): string {
	// One small, equally-sized card per metric — laid out on a grid so they
	// align. The model is metadata, not a headline metric, so it goes in a
	// small caption below rather than as a big stat.
	const stats: Array<{ val: string; lbl: string }> = [];
	if (typeof input.totalThreadsInSystem === "number") {
		stats.push({ val: String(input.totalThreadsInSystem), lbl: "conversas no sistema" });
	}
	stats.push({ val: String(input.threads.length), lbl: "selecionadas" });
	stats.push({ val: String(totals.totalMessages), lbl: "mensagens totais" });
	if (totals.totalTokens > 0) {
		stats.push({ val: formatBigNum(totals.totalTokens), lbl: "tokens" });
	}
	if (totals.totalCost > 0) {
		stats.push({ val: formatCost(totals.totalCost), lbl: "custo total estimado" });
	}

	const cards = stats
		.map(
			(s) => `<div class="stat">
      <span class="val">${escapeHtml(s.val)}</span>
      <span class="lbl">${escapeHtml(s.lbl)}</span>
    </div>`,
		)
		.join("\n    ");

	const model = input.model
		? `\n  <div class="stats-model">Modelo: <span>${escapeHtml(input.model)}</span></div>`
		: "";

	return `
  <div class="stats">
    ${cards}
  </div>${model}`;
}

function renderIndex(threads: ExportThread[]): string {
	if (threads.length === 0) return "";
	return `
  <div class="section-heading">Índice</div>
  <div class="index-wrap">
  <table class="index">
    <thead>
      <tr>
        <th>Contato</th>
        <th>Thread</th>
        <th>Data</th>
        <th>Msg</th>
        <th>Tokens</th>
        <th>Custo</th>
        <th></th>
      </tr>
    </thead>
    <tbody>
${threads
	.map((t, i) => {
		const agg = aggregate(t.turns);
		const displayName = t.title ?? t.contactName ?? t.phone;
		const tagline = t.subtitle
			? `<br><small style="color:var(--muted);font-size:13px;">${escapeHtml(t.subtitle)}</small>`
			: "";
		return `      <tr>
        <td><span class="name">${escapeHtml(displayName)}</span>${tagline}</td>
        <td class="thread">${escapeHtml(t.phone)}<br>:${escapeHtml(t.date)}</td>
        <td>${formatDateBR(parseUtcDate(t.date))}</td>
        <td class="num msg-count">${agg.userTurns + agg.botTurns}<span class="brk"> (${agg.userTurns}+${agg.botTurns})</span></td>
        <td class="num">${agg.totalTokens > 0 ? `~${formatBigNum(agg.totalTokens)}` : "—"}</td>
        <td class="num">${agg.totalCost > 0 ? formatCost(agg.totalCost) : "—"}</td>
        <td><a class="jump" href="#conv${i + 1}">ver</a></td>
      </tr>`;
	})
	.join("\n")}
    </tbody>
  </table>
  </div>`;
}

function renderAnalysisSection(input: ExportInput): string {
	const blocks: string[] = [];
	if (input.intro) {
		blocks.push(`<div class="analysis">${mdToHtml(input.intro)}</div>`);
	}
	for (const t of input.threads) {
		if (!t.analysis) continue;
		const heading = t.title ?? t.contactName ?? t.phone;
		const tagline = t.subtitle ? ` — ${t.subtitle}` : "";
		blocks.push(
			`<div class="analysis">
      <h3>${escapeHtml(heading)}${escapeHtml(tagline)}</h3>
      ${mdToHtml(t.analysis)}
    </div>`,
		);
	}
	if (blocks.length === 0) return "";
	return `
  <div class="section-heading">Análise</div>
  ${blocks.join("\n  ")}`;
}

function renderTranscripts(threads: ExportThread[]): string {
	if (threads.length === 0) return "";
	const parts: string[] = [`<div class="section-heading">Transcrições</div>`];
	threads.forEach((t, i) => {
		parts.push(renderConversation(t, i + 1));
	});
	return parts.join("\n");
}

function renderConversation(t: ExportThread, n: number): string {
	const agg = aggregate(t.turns);
	const displayName = t.title ?? t.contactName ?? t.phone;
	const tagline = t.subtitle ? ` — ${t.subtitle}` : "";

	const badges: string[] = [];
	badges.push(
		`<span class="badge">${agg.userTurns} trocas (${agg.userTurns + agg.botTurns} msgs)</span>`,
	);
	if (agg.totalTokens > 0)
		badges.push(`<span class="badge">~${formatBigNum(agg.totalTokens)} tokens</span>`);
	if (agg.totalCost > 0)
		badges.push(`<span class="badge">${escapeHtml(formatCost(agg.totalCost))}</span>`);

	// Per-conversation citation index: each distinct passage the bot cited (a
	// source + its snippet), in order of first appearance. Exact duplicates are
	// collapsed. The 1-based number is shared by the in-message chips and the
	// "Fontes citadas" footer, and drives the jump anchors.
	const citeEntries: Array<{ source: string; text?: string }> = [];
	const citeKeyToNum = new Map<string, number>();
	const citeKey = (c: string | { source: string; text?: string }) =>
		`${citationSource(c)}::${(citationText(c) ?? "").slice(0, 80)}`;
	for (const turn of t.turns) {
		if (turn.role !== "assistant" || !turn.citations) continue;
		for (const c of turn.citations) {
			const key = citeKey(c);
			if (!citeKeyToNum.has(key)) {
				citeEntries.push({ source: citationSource(c), text: citationText(c) });
				citeKeyToNum.set(key, citeEntries.length);
			}
		}
	}

	let userIdx = 0;
	const messages = t.turns
		.map((turn) => {
			if (turn.role === "user") userIdx += 1;
			// Clickable chips for the passages this message used (deduped, sorted).
			let citeRefs = "";
			if (turn.role === "assistant" && turn.citations?.length) {
				const nums = [...new Set(turn.citations.map((c) => citeKeyToNum.get(citeKey(c))))]
					.filter((x): x is number => typeof x === "number")
					.sort((a, b) => a - b);
				const links = nums
					.map((num) => `<a class="cite-ref" href="#conv${n}-cite${num}">${num}</a>`)
					.join("");
				citeRefs = `<div class="cite-refs"><span class="cite-refs-label">Fontes</span>${links}</div>`;
			}
			return renderMessage(turn, turn.role === "user" ? userIdx : undefined, citeRefs);
		})
		.join("\n");

	const citationsBlock =
		citeEntries.length > 0
			? `
    <div class="citations-section">
      <div class="citations-title">Fontes citadas</div>
      <ol class="citations-list">
        ${citeEntries
					.map(
						(e, i) =>
							`<li id="conv${n}-cite${i + 1}"><span class="cite-src">${escapeHtml(e.source)}</span>${
								e.text ? `<div class="cite-text">${escapeHtml(e.text)}</div>` : ""
							}</li>`,
					)
					.join("\n        ")}
      </ol>
    </div>`
			: "";

	return `
  <div class="conversation" id="conv${n}">
    <div class="conv-header">
      <div>
        <div class="conv-title">${escapeHtml(displayName)}${escapeHtml(tagline)}</div>
        <div class="conv-meta">Thread: ${escapeHtml(t.threadId)} · ${formatDateBR(parseUtcDate(t.date))}</div>
      </div>
      <div class="conv-badge">
        ${badges.join("\n        ")}
      </div>
    </div>
    <div class="messages">
${messages}
    </div>${citationsBlock}
  </div>`;
}

function renderMessage(turn: Turn, userIdx?: number, citeRefs = ""): string {
	const cls = turn.role === "user" ? "user" : "bot";
	const speakerLabel = turn.role === "user" ? (turn.name ?? "Usuário") : "Cury Chat";
	const turnNum = userIdx !== undefined ? String(userIdx) : "";
	const tokens = turn.usage?.total_tokens;
	const meta = tokens ? `${formatBigNum(tokens)} tok` : "";
	return `      <div class="msg ${cls}">
        <div class="turn-num">${escapeHtml(turnNum)}</div>
        <div class="speaker">${escapeHtml(speakerLabel)}</div>
        <div class="body">${mdToHtml(turn.content)}${citeRefs}</div>
        <div class="msg-meta">${escapeHtml(meta)}</div>
      </div>`;
}

// Fixed bottom pill bar to jump between conversation transcripts. Self-contained
// inline JS (no external deps) so the exported file stays portable.
function renderNavBar(): string {
	return `
  <div class="navbar" aria-hidden="true">
    <button type="button" data-prev>← Anterior</button>
    <div class="sep"></div>
    <button type="button" data-next>Próximo →</button>
  </div>
  <script>
  (function(){
    var bar = document.querySelector('.navbar');
    if (!bar) return;
    function convs(){ return Array.prototype.slice.call(document.querySelectorAll('.conversation')); }
    function go(dir){
      var cs = convs(); if(!cs.length) return;
      var top = function(el){ return el.getBoundingClientRect().top; };
      var target;
      if (dir > 0) {
        for (var i = 0; i < cs.length; i++){ if (top(cs[i]) > 5){ target = cs[i]; break; } }
        if (!target) target = cs[cs.length - 1];
      } else {
        for (var j = cs.length - 1; j >= 0; j--){ if (top(cs[j]) < -5){ target = cs[j]; break; } }
        if (!target) target = cs[0];
      }
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    bar.querySelector('[data-prev]').addEventListener('click', function(){ go(-1); });
    bar.querySelector('[data-next]').addEventListener('click', function(){ go(1); });
  })();
  </script>`;
}

function renderFooter(generatedAt: Date): string {
	return `
  <div class="footer">
    Gerado em ${formatDateBR(generatedAt)} ${formatTimeBR(generatedAt)} · Cury Chat
  </div>`;
}

// -----------------------------------------------------------------------------
// Aggregation
// -----------------------------------------------------------------------------

interface Totals {
	totalMessages: number;
	totalTokens: number;
	totalCost: number;
}

interface ThreadAgg {
	userTurns: number;
	botTurns: number;
	totalTokens: number;
	totalCost: number;
}

function aggregate(turns: Turn[]): ThreadAgg {
	let userTurns = 0;
	let botTurns = 0;
	let totalTokens = 0;
	let totalCost = 0;
	for (const t of turns) {
		if (t.role === "user") userTurns += 1;
		else botTurns += 1;
		if (t.usage?.total_tokens) totalTokens += t.usage.total_tokens;
		if (typeof t.usage?.cost === "number") totalCost += t.usage.cost;
	}
	return { userTurns, botTurns, totalTokens, totalCost };
}

function computeTotals(threads: ExportThread[]): Totals {
	let totalMessages = 0;
	let totalTokens = 0;
	let totalCost = 0;
	for (const t of threads) {
		const agg = aggregate(t.turns);
		totalMessages += agg.userTurns + agg.botTurns;
		totalTokens += agg.totalTokens;
		totalCost += agg.totalCost;
	}
	return { totalMessages, totalTokens, totalCost };
}

// -----------------------------------------------------------------------------
// Formatting helpers (server-side; web/lib/format.ts is browser-side)
// -----------------------------------------------------------------------------

function escapeHtml(s: string): string {
	return s
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&#39;");
}

function formatCost(cost: number): string {
	if (cost === 0) return "$0";
	if (cost < 0.01) return `${(cost * 100).toFixed(3)}¢`;
	return `$${cost.toFixed(4)}`;
}

function formatBigNum(n: number): string {
	if (n < 1000) return String(n);
	if (n < 1_000_000) return `${(n / 1000).toFixed(n < 10_000 ? 1 : 0)}k`;
	return `${(n / 1_000_000).toFixed(1)}M`;
}

function pad2(n: number): string {
	return String(n).padStart(2, "0");
}

function formatDateBR(d: Date): string {
	return `${pad2(d.getUTCDate())}/${pad2(d.getUTCMonth() + 1)}/${d.getUTCFullYear()}`;
}

function formatTimeBR(d: Date): string {
	return `${pad2(d.getUTCHours())}:${pad2(d.getUTCMinutes())} UTC`;
}

function parseUtcDate(yyyymmdd: string): Date {
	const [y, m, dd] = yyyymmdd.split("-").map((s) => parseInt(s, 10));
	return new Date(Date.UTC(y || 1970, (m || 1) - 1, dd || 1));
}

// -----------------------------------------------------------------------------
// Minimal markdown-to-HTML (paragraphs, bold, italic, lists)
// -----------------------------------------------------------------------------

export function mdToHtml(src: string): string {
	if (!src) return "";
	const trimmed = src.replace(/\r\n/g, "\n").trim();
	if (!trimmed) return "";
	const blocks = trimmed.split(/\n\s*\n/);
	return blocks.map(renderBlock).join("\n");
}

function renderBlock(block: string): string {
	const lines = block.split("\n");
	const allBullets = lines.every((l) => /^\s*[-*]\s+/.test(l)) && lines.length > 0;
	if (allBullets) {
		const items = lines
			.map((l) => l.replace(/^\s*[-*]\s+/, ""))
			.map((l) => `<li>${inlineMd(escapeHtml(l))}</li>`)
			.join("");
		return `<ul>${items}</ul>`;
	}
	const escaped = escapeHtml(block).replace(/\n/g, "<br>");
	return `<p>${inlineMd(escaped)}</p>`;
}

function inlineMd(s: string): string {
	// Bold first (longer marker), then italic, so we don't eat **x** as *.
	return s
		.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
		.replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g, "$1<em>$2</em>");
}

// -----------------------------------------------------------------------------
// Inline stylesheet — single source of truth so the output file is portable.
// Mirror of the reference template the operator approved.
// -----------------------------------------------------------------------------

const STYLES = `
  :root {
    --bg: #f9f9f7;
    --surface: #ffffff;
    --border: #d8d8cf;
    --text: #161616;
    --muted: #4a4a44;
    --faint: #6f6f68;
    --user-bg: #ecece4;
    --bot-bg: #ffffff;
    --accent: #224a1d;
    --accent-light: #e8f0e6;
    --tag-bg: #ebebeb;
    --font: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif;
    --mono: "SF Mono", "Fira Code", "Fira Mono", Menlo, monospace;
  }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: var(--font);
    font-size: 16px;
    line-height: 1.6;
    color: var(--text);
    background: var(--bg);
    padding: 32px 16px;
    -webkit-text-size-adjust: 100%;
    text-rendering: optimizeLegibility;
  }
  a { color: var(--accent); text-decoration: none; }
  a:hover { text-decoration: underline; }
  .wrapper { max-width: 860px; margin: 0 auto; overflow-x: hidden; }
  .header { border-bottom: 2px solid var(--text); padding-bottom: 20px; margin-bottom: 32px; }
  .header h1 { font-size: 28px; font-weight: 800; letter-spacing: -0.3px; line-height: 1.2; overflow-wrap: anywhere; }
  .header .subtitle { color: var(--muted); font-size: 16px; font-weight: 500; margin-top: 6px; }
  .stats {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
    gap: 10px; margin-bottom: 10px;
  }
  .stat {
    background: var(--surface); border: 1px solid var(--border); border-radius: 6px;
    padding: 12px 14px;
  }
  .stat .val { font-size: 20px; font-weight: 800; display: block; line-height: 1.15; }
  .stat .lbl { font-size: 11px; font-weight: 600; color: var(--muted); text-transform: uppercase; letter-spacing: 0.4px; margin-top: 3px; display: block; }
  .stats-model { font-size: 12px; color: var(--muted); margin-bottom: 24px; }
  .stats-model span { color: var(--text); font-weight: 600; font-family: var(--mono); }
  .section-heading {
    font-size: 14px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.8px;
    color: var(--muted); margin-bottom: 12px; margin-top: 40px;
    padding-bottom: 6px; border-bottom: 1px solid var(--border);
  }
  .index-wrap { overflow-x: auto; -webkit-overflow-scrolling: touch; margin-bottom: 40px; }
  table.index { width: 100%; border-collapse: collapse; font-size: 16px; }
  table.index th {
    text-align: left; font-size: 13px; font-weight: 700;
    text-transform: uppercase; letter-spacing: 0.4px; color: var(--muted);
    padding: 8px 10px; border-bottom: 2px solid var(--border);
  }
  table.index td { padding: 11px 10px; border-bottom: 1px solid var(--border); vertical-align: top; }
  table.index tr:last-child td { border-bottom: none; }
  table.index .name { font-weight: 700; }
  table.index .thread { font-family: var(--mono); font-size: 13px; color: var(--faint); }
  table.index .num { font-family: var(--mono); font-size: 14px; white-space: nowrap; }
  table.index .msg-count { font-size: 12px; color: var(--muted); }
  table.index .msg-count .brk { color: var(--faint); }
  table.index td:last-child { width: 1%; white-space: nowrap; text-align: right; }
  table.index a.jump {
    display: inline-block; font-size: 12px; font-weight: 700; color: var(--accent);
    border: 1px solid var(--border); border-radius: 6px; padding: 4px 12px;
    background: var(--surface); white-space: nowrap;
  }
  table.index a.jump:hover { background: var(--accent-light); text-decoration: none; }
  .analysis {
    background: var(--surface); border: 1px solid var(--border); border-left: 4px solid var(--accent);
    border-radius: 4px; padding: 20px 24px; margin-bottom: 20px;
  }
  .analysis h3 {
    font-weight: 800; margin-bottom: 10px; color: var(--accent);
    text-transform: uppercase; letter-spacing: 0.4px; font-size: 14px;
  }
  .analysis p { font-size: 16px; color: var(--text); margin-bottom: 10px; }
  .analysis p:last-child { margin-bottom: 0; }
  .analysis ul { font-size: 16px; padding-left: 20px; margin-bottom: 10px; }
  .analysis li { margin-bottom: 6px; }
  .conversation {
    margin-bottom: 56px; background: var(--surface);
    border: 1px solid var(--border); border-radius: 4px; overflow: hidden;
  }
  .conv-header {
    background: var(--text); color: #fff; padding: 16px 20px;
    display: flex; flex-direction: column; align-items: flex-start; gap: 10px;
  }
  .conv-header .conv-title { font-size: 17px; font-weight: 800; line-height: 1.3; }
  .conv-header .conv-meta { font-size: 12px; opacity: 0.8; margin-top: 3px; font-family: var(--mono); overflow-wrap: anywhere; }
  .conv-header .conv-badge { display: flex; flex-flow: row wrap; align-items: center; gap: 6px; }
  .badge {
    display: inline-block; background: rgba(255,255,255,0.18); color: #fff;
    font-size: 11px; font-family: var(--mono); padding: 3px 8px; border-radius: 4px;
    white-space: nowrap;
  }
  .msg { display: flex; padding: 16px 20px; border-bottom: 1px solid var(--border); gap: 14px; }
  .msg:last-child { border-bottom: none; }
  .msg.user { background: var(--user-bg); }
  .msg.bot  { background: var(--bot-bg); }
  .msg .speaker {
    flex-shrink: 0; width: 104px; font-size: 11px; font-weight: 800;
    text-transform: uppercase; letter-spacing: 0.3px; padding-top: 3px; color: var(--muted);
    overflow-wrap: anywhere;
  }
  .msg.user .speaker { color: var(--text); }
  .msg.bot  .speaker { color: var(--accent); }
  .msg .turn-num {
    flex-shrink: 0; width: 24px; font-size: 12px; font-family: var(--mono);
    color: var(--faint); padding-top: 3px; text-align: right;
  }
  .msg .body { flex: 1; font-size: 16px; line-height: 1.65; color: var(--text); }
  .msg .body p { margin-bottom: 10px; }
  .msg .body p:last-child { margin-bottom: 0; }
  .msg .body strong { font-weight: 800; }
  .msg .body em { font-style: italic; }
  .msg .body ul { padding-left: 20px; margin-bottom: 10px; }
  .msg .body li { margin-bottom: 6px; }
  .msg .msg-meta {
    flex-shrink: 0; font-size: 12px; font-family: var(--mono);
    color: var(--faint); text-align: right; padding-top: 3px; min-width: 60px;
  }
  /* In-message source chips → jump to the conversation's "Fontes citadas". */
  .msg .cite-refs {
    margin-top: 10px; display: flex; flex-wrap: wrap; align-items: center; gap: 6px;
  }
  .cite-refs-label {
    font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.4px;
    color: var(--muted);
  }
  a.cite-ref {
    display: inline-flex; align-items: center; justify-content: center;
    min-width: 22px; height: 22px; padding: 0 7px;
    border: 1px solid var(--border); border-radius: 999px;
    font-size: 12px; font-weight: 700; font-family: var(--mono);
    color: var(--accent); background: var(--accent-light); text-decoration: none;
  }
  a.cite-ref:hover { background: var(--accent); color: #fff; text-decoration: none; }
  .citations-section { border-top: 1px solid var(--border); padding: 16px 20px; background: var(--bg); }
  .citations-title {
    font-size: 11px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.6px;
    color: var(--muted); margin-bottom: 10px;
  }
  .citations-list { margin: 0; padding-left: 24px; }
  .citations-list li {
    font-size: 15px; margin-bottom: 12px;
    scroll-margin-top: 16px; scroll-margin-bottom: 88px; padding: 4px 8px; border-radius: 4px;
  }
  .citations-list .cite-src { font-weight: 700; }
  .citations-list .cite-text {
    font-weight: 400; font-size: 13px; color: var(--muted); line-height: 1.55; margin-top: 4px;
  }
  /* Highlight the entry you clicked through to. */
  .citations-list li:target { background: var(--accent-light); outline: 2px solid var(--accent); }
  .footer { border-top: 1px solid var(--border); padding-top: 20px; margin-top: 40px; margin-bottom: 72px; font-size: 14px; color: var(--muted); }
  .navbar {
    position: fixed; bottom: 16px; left: 50%; transform: translateX(-50%);
    z-index: 50; display: flex; align-items: stretch; gap: 2px;
    background: var(--surface); border: 1px solid var(--border);
    border-radius: 999px; padding: 4px; box-shadow: 0 6px 24px rgba(0,0,0,0.16);
  }
  .navbar button {
    font-family: var(--font); font-size: 13px; font-weight: 700; color: var(--text);
    background: transparent; border: none; border-radius: 999px;
    padding: 8px 18px; cursor: pointer; white-space: nowrap;
  }
  .navbar button:hover { background: var(--accent-light); color: var(--accent); }
  .navbar .sep { width: 1px; background: var(--border); margin: 5px 0; }
  @media (max-width: 600px) {
    body { font-size: 16px; padding: 20px 12px; }
    .header h1 { font-size: 24px; }
    .stats { grid-template-columns: repeat(2, 1fr); gap: 8px; }
    .stat { padding: 10px 12px; }
    .stat .val { font-size: 19px; }
    /* Index: drop secondary technical columns (Thread, Tokens, Custo) so the
       table fits a phone without horizontal scroll. Keeps #, Contato, Data,
       Msg and the jump link. */
    table.index { font-size: 14px; }
    table.index th:nth-child(2), table.index td:nth-child(2),
    table.index th:nth-child(5), table.index td:nth-child(5),
    table.index th:nth-child(6), table.index td:nth-child(6) { display: none; }
    table.index th, table.index td { padding: 9px 6px; }
    table.index .num { font-size: 12px; }
    table.index a.jump { padding: 4px 10px; }
    /* Transcript rows: stack speaker label above the message body for a wide,
       easy-to-read column. Hide the tiny turn-number and token meta. */
    .msg { flex-direction: column; gap: 6px; padding: 14px 16px; }
    .msg .turn-num, .msg .msg-meta { display: none; }
    .msg .speaker { width: auto; font-size: 12px; }
    .msg .body { font-size: 16px; line-height: 1.65; }
  }
  @media print {
    body { background: white; padding: 0; }
    .wrapper { max-width: none; }
    .conversation { break-inside: avoid; }
    .navbar { display: none; }
  }
`;
