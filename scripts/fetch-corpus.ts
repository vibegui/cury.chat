#!/usr/bin/env bun
// Builds corpus/ from public sources.
//
//   bun run fetch-corpus              # everything in the manifest
//   bun run fetch-corpus plano tim    # only entries whose slug matches
//   bun run fetch-corpus --force      # re-convert even if the .md exists
//
// Every entry lands as `corpus/NN. <title> - Augusto Cury.md` with a
// provenance header (URL + access date + licence). The header is part of the
// chunk AutoRAG indexes, so the agent can be honest about where a passage
// came from.
//
// Conversion is delegated, not reimplemented:
//   - pdf / html  →  `docling` (pip install docling)
//   - wikipedia   →  MediaWiki extracts API (clean plain text, no page chrome)
//   - youtube     →  `yt-dlp` auto-subtitles, stripped to plain text
//
// ONLY public material goes in here. Cury's commercial books are copyrighted
// (Planeta / Sextante / Benvirá) and the PDFs floating around elivros,
// dlivros, zlibrary, Scribd and Academia.edu are unauthorised copies. They
// stay out — see docs/compliance.md.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

type Kind = "pdf" | "html" | "wikipedia" | "youtube";

interface Source {
	n: number;
	slug: string;
	title: string;
	kind: Kind;
	url: string;
	licence: string;
	/** Shown in the file header — why this source is legitimate to include. */
	note?: string;
	/** Drop everything before the first line matching this (site chrome/nav). */
	trimFrom?: RegExp;
	/** Drop everything from the first line matching this (refs, footers). */
	trimTo?: RegExp;
	/** Scanned or image-only PDF — force docling through OCR. Much slower. */
	ocr?: boolean;
	/** For channel/playlist URLs: how many videos to transcribe. */
	limit?: number;
}

/**
 * Rendered pages carry navigation, language switchers and edit links that
 * docling faithfully preserves. They embed badly and produce citations that
 * quote a menu, so cut the obvious ones. Per-source `trimFrom` / `trimTo` do
 * the coarse work; this catches the leftovers.
 */
const CHROME =
	/^(Alternar|Adicionar (idiomas|hiperligações)|mover para a barra lateral|ocultar|Artigo|Discussão|Ler|Editar( código fonte)?|Ver (histórico|código fonte)|Ferramentas|Ações|Geral|Imprimir\/exportar|Noutros projetos|português|Origem: Wikipédia|Obtida de|Categorias?:|Esta página foi editada|Compartilhar|Publicidade|Leia também|Continua depois da publicidade|Siga o|Assine)\b/i;

function clean(body: string, s: Source): string {
	let lines = body.split("\n");
	if (s.trimFrom) {
		const i = lines.findIndex((l) => s.trimFrom?.test(l));
		if (i >= 0) lines = lines.slice(i);
	}
	if (s.trimTo) {
		const i = lines.findIndex((l) => s.trimTo?.test(l));
		if (i > 0) lines = lines.slice(0, i);
	}
	return lines
		.map((l) => l.replace(/!\[[^\]]*\]\(data:[^)]*\)/g, "").replace(/<!--\s*image\s*-->/g, ""))
		.filter((l) => !CHROME.test(l.trim().replace(/^[-*]\s+/, "")))
		.join("\n")
		.replace(/\n{3,}/g, "\n\n")
		.trim();
}

// -----------------------------------------------------------------------------
// Manifest
// -----------------------------------------------------------------------------

const SOURCES: Source[] = [
	{
		n: 1,
		slug: "plano-governo",
		title: "Plano de Governo - O Brasil dos Nossos Sonhos (TSE 2026)",
		kind: "pdf",
		// Canônico: DivulgaCandContas do TSE
		//   https://divulgacandcontas.tse.jus.br/divulga/rest/arquivo/doc/280017125643
		// — mas ele responde 403 a download automatizado, então baixamos do
		// espelho do Poder360. Outro espelho, se este cair:
		//   https://static.congressoemfoco.com.br/2026/08/14/attachment/2026/08/14/17dd92_plano_de_governoo_brasil_dos_nossos_sonhos.pdf
		url: "https://static.poder360.com.br/uploads/2026/08/Plano_gov_Augusto_Cury_2026.pdf",
		licence: "Documento público — plano de governo protocolado no TSE em 13/08/2026",
		note: "Peça central do acervo: é o que o candidato formalmente propõe. Original no DivulgaCandContas do TSE; espelho do Poder360 porque o TSE bloqueia download automatizado.",
		// PDF digital, com camada de texto — OCR desnecessário.
	},
	{
		n: 2,
		slug: "tim",
		title: "Teoria da Inteligência Multifocal (e-book oficial gratuito)",
		kind: "pdf",
		url: "https://augustocury.com.br/wp-content/uploads/2023/04/E-BOOK-TIM-Teoria-da-Inteligencia-Multifocal.pdf",
		licence: "E-book distribuído gratuitamente pelo próprio autor em augustocury.com.br",
		// PDF diagramado, sem camada de texto — sem OCR docling devolve só imagens.
		ocr: true,
	},
	{
		n: 3,
		slug: "wikipedia-bio",
		title: "Biografia e bibliografia (Wikipédia)",
		kind: "wikipedia",
		url: "https://pt.wikipedia.org/wiki/Augusto_Cury",
		licence: "CC BY-SA 4.0 — Wikipédia, a enciclopédia livre",
	},
	{
		n: 4,
		slug: "wikipedia-campanha",
		title: "Campanha presidencial de 2026 (Wikipédia)",
		kind: "wikipedia",
		url: "https://pt.wikipedia.org/wiki/Campanha_presidencial_de_Augusto_Cury_em_2026",
		licence: "CC BY-SA 4.0 — Wikipédia, a enciclopédia livre",
	},
	{
		n: 5,
		slug: "perfil-band",
		title: "Perfil e propostas (Band, 27-08-2026)",
		kind: "html",
		url: "https://www.band.com.br/politica/eleicoes/2026/eleicoes-2026-conheca-as-propostas-e-o-perfil-de-augusto-cury-avante-202608271458",
		licence: "Matéria jornalística — uso informativo, com atribuição",
	},
	{
		n: 6,
		slug: "perfil-cnn",
		title: "Quem é Augusto Cury, candidato do Avante (CNN Brasil)",
		kind: "html",
		url: "https://www.cnnbrasil.com.br/eleicoes/quem-e-o-escritor-augusto-cury-candidato-do-avante-a-presidencia/",
		licence: "Matéria jornalística — uso informativo, com atribuição",
	},
	// Sem o nº 07: o perfil do JOTA
	// (jota.info/eleicoes/eleicoes-2026/quem-e-augusto-cury-novo-pre-candidato-a-presidente)
	// fica atrás de paywall e devolve ~400 caracteres. Se alguém tiver acesso,
	// salve o texto à mão em corpus/ seguindo a convenção de nomes.
	{
		n: 8,
		slug: "plano-terra",
		title: "Semipresidencialismo, gestão da emoção e telemedicina (Terra)",
		kind: "html",
		url: "https://www.terra.com.br/noticias/eleicoes/eleicoes-2026-plano-de-augusto-cury-preve-semipresidencialismo-gestao-da-emocao-e-telemedicina,275f8d4dd7b40fb5b714d19aeb7b0f1c9tfiftut.html",
		licence: "Matéria jornalística — uso informativo, com atribuição",
	},
	{
		n: 9,
		slug: "posicionamento-gazeta",
		title: "Augusto Cury é de direita ou de esquerda? (Gazeta do Povo)",
		kind: "html",
		url: "https://www.gazetadopovo.com.br/eleicoes/2026/augusto-cury-direita-ou-esquerda/",
		licence: "Matéria jornalística — uso informativo, com atribuição",
	},
	{
		n: 10,
		slug: "falas-canal",
		title: "Falas públicas - canal oficial no YouTube",
		kind: "youtube",
		url: "https://www.youtube.com/channel/UC3F2e1Lob9X8awYULlURyJg/videos",
		licence: "Legendas automáticas de vídeos públicos — transcrição para estudo, com atribuição",
		note: "Fonte mais rica da voz dele: como ele fala, não como escrevem sobre ele.",
		limit: 30,
	},
	// Entrevistas de campanha em canais de terceiros entram aqui, uma por
	// entrada, com kind: "youtube" e sem `limit`. Só vale a pena se o vídeo
	// tiver legenda: sem legenda automática o yt-dlp não devolve nada
	// (foi o caso de youtube.com/watch?v=c-EwPfE_JjA).
];

// -----------------------------------------------------------------------------

const ROOT = join(import.meta.dir, "..");
const CORPUS = join(ROOT, "corpus");
const RAW = join(CORPUS, "raw");

const args = process.argv.slice(2);
const force = args.includes("--force");
const filters = args.filter((a) => !a.startsWith("--"));

function filename(s: Source): string {
	return `${String(s.n).padStart(2, "0")}. ${s.title} - Augusto Cury.md`;
}

function header(s: Source): string {
	return [
		`# ${s.title}`,
		"",
		`> **Fonte:** ${s.url}`,
		`> **Acessado em:** ${new Date().toISOString().slice(0, 10)}`,
		`> **Licença / base de uso:** ${s.licence}`,
		s.note ? `> **Nota:** ${s.note}` : null,
		"",
		"---",
		"",
	]
		.filter((l) => l !== null)
		.join("\n");
}

async function run(cmd: string[], cwd = ROOT): Promise<string> {
	const proc = Bun.spawn(cmd, { cwd, stdout: "pipe", stderr: "pipe" });
	const [out, err, code] = await Promise.all([
		new Response(proc.stdout).text(),
		new Response(proc.stderr).text(),
		proc.exited,
	]);
	if (code !== 0) throw new Error(`${cmd[0]} exited ${code}\n${err.trim()}`);
	return out;
}

// docling is a heavy Python install (torch, easyocr). Allow pointing at an
// existing venv instead of installing a second copy: DOCLING_BIN=/path/to/docling
const DOCLING = process.env.DOCLING_BIN || "docling";

async function has(bin: string): Promise<boolean> {
	if (bin.includes("/")) return existsSync(bin);
	try {
		await run(["which", bin]);
		return true;
	} catch {
		return false;
	}
}

/** docling handles both PDFs and HTML pages, local or by URL. */
async function convertWithDocling(s: Source): Promise<string> {
	const outDir = join(RAW, s.slug);
	mkdirSync(outDir, { recursive: true });
	const flags = s.ocr ? ["--force-ocr", "--ocr-engine", "easyocr"] : [];
	await run([DOCLING, "--to", "md", ...flags, "--output", outDir, s.url]);

	const produced = [...new Bun.Glob("**/*.md").scanSync(outDir)];
	if (produced.length === 0) throw new Error(`docling produced no markdown for ${s.slug}`);
	return produced.map((f) => readFileSync(join(outDir, f), "utf8")).join("\n\n");
}

/**
 * MediaWiki hands out clean plain text through the extracts API, so there is
 * no reason to scrape the rendered page and then fight its sidebar, language
 * switcher and edit links. Section headings come back as `== Título ==`;
 * convert them to markdown so AutoRAG chunks on them.
 */
async function fetchWikipedia(s: Source): Promise<string> {
	const { hostname, pathname } = new URL(s.url);
	const title = decodeURIComponent(pathname.replace(/^\/wiki\//, ""));
	const api = new URL(`https://${hostname}/w/api.php`);
	api.search = new URLSearchParams({
		action: "query",
		prop: "extracts",
		explaintext: "1",
		redirects: "1",
		format: "json",
		formatversion: "2",
		titles: title,
	}).toString();

	const res = await fetch(api, { headers: { "User-Agent": "cury.chat corpus builder" } });
	if (!res.ok) throw new Error(`wikipedia api ${res.status}`);
	const json = (await res.json()) as { query?: { pages?: { extract?: string }[] } };
	const extract = json.query?.pages?.[0]?.extract;
	if (!extract) throw new Error(`no extract for "${title}"`);

	return extract.replace(
		/^(={2,6})\s*(.+?)\s*\1$/gm,
		(_m, eq: string, text: string) => `${"#".repeat(eq.length)} ${text}`,
	);
}

/**
 * Auto-subtitles → plain text. WebVTT cues repeat heavily (rolling captions),
 * so dedupe consecutive identical lines or the corpus triples in size and the
 * embeddings drown in repetition.
 */
function vttToText(vtt: string): string {
	const lines = vtt.split("\n");
	const out: string[] = [];
	for (const raw of lines) {
		const line = raw
			.replace(/<[^>]+>/g, "")
			.replace(/^﻿/, "")
			.trim();
		if (!line) continue;
		if (line === "WEBVTT" || line.startsWith("Kind:") || line.startsWith("Language:")) continue;
		if (line.includes("-->")) continue;
		if (/^\d+$/.test(line)) continue;
		if (out[out.length - 1] === line) continue;
		out.push(line);
	}
	return out.join(" ").replace(/\s{2,}/g, " ");
}

async function convertWithYtDlp(s: Source): Promise<string> {
	const outDir = join(RAW, s.slug);
	mkdirSync(outDir, { recursive: true });
	await run([
		"yt-dlp",
		...(s.limit ? ["--playlist-end", String(s.limit)] : ["--no-playlist"]),
		"--skip-download",
		"--write-auto-sub",
		"--write-sub",
		"--sub-lang",
		"pt,pt-BR",
		"--sub-format",
		"vtt",
		// A video with no captions shouldn't abort the whole channel run.
		"--ignore-errors",
		"-o",
		join(outDir, "%(upload_date)s - %(title)s.%(ext)s"),
		s.url,
	]);

	const files = [...new Bun.Glob("*.vtt").scanSync(outDir)].sort();
	if (files.length === 0) throw new Error(`no subtitles found for ${s.slug}`);

	return files
		.map((f) => {
			const label = f.replace(/\.(pt|pt-BR)\.vtt$/, "");
			return `## ${label}\n\n${vttToText(readFileSync(join(outDir, f), "utf8"))}`;
		})
		.join("\n\n");
}

// -----------------------------------------------------------------------------

const selected = filters.length
	? SOURCES.filter((s) => filters.some((f) => s.slug.includes(f)))
	: SOURCES;

if (selected.length === 0) {
	console.error(`No source matches ${filters.join(", ")}.`);
	console.error(`Known slugs: ${SOURCES.map((s) => s.slug).join(", ")}`);
	process.exit(1);
}

mkdirSync(RAW, { recursive: true });

const needsDocling = selected.some((s) => s.kind === "pdf" || s.kind === "html");
const needsYtDlp = selected.some((s) => s.kind === "youtube");
if (needsDocling && !(await has(DOCLING))) {
	console.error(
		"docling not found — `uv tool install docling`, or point DOCLING_BIN at an existing venv.",
	);
	process.exit(1);
}
if (needsYtDlp && !(await has("yt-dlp"))) {
	console.error("yt-dlp not found — `brew install yt-dlp`.");
	process.exit(1);
}

let ok = 0;
let skipped = 0;
const failed: string[] = [];

for (const s of selected) {
	const dest = join(CORPUS, filename(s));
	if (existsSync(dest) && !force) {
		console.log(`skip   ${s.slug} (exists — pass --force to redo)`);
		skipped++;
		continue;
	}
	try {
		console.log(`fetch  ${s.slug} …`);
		const raw =
			s.kind === "youtube"
				? await convertWithYtDlp(s)
				: s.kind === "wikipedia"
					? await fetchWikipedia(s)
					: await convertWithDocling(s);
		const body = clean(raw, s);
		// An image-only PDF with no OCR, or a bot-blocked page, converts to a
		// few hundred bytes of nothing. Better to fail loudly than to ship an
		// empty doc the agent will later cite as a source.
		if (body.length < 2000) {
			throw new Error(
				`only ${body.length} chars of text after cleaning — likely blocked, paywalled, or an image-only PDF (try ocr: true)`,
			);
		}
		writeFileSync(dest, `${header(s) + body}\n`);
		console.log(`  ✓ ${filename(s)} (${(body.length / 1024).toFixed(0)} KB)`);
		ok++;
	} catch (err) {
		console.error(`  ✗ ${s.slug}: ${(err as Error).message.split("\n")[0]}`);
		failed.push(s.slug);
	}
}

console.log(`\n${ok} written, ${skipped} skipped, ${failed.length} failed.`);
if (failed.length) {
	console.log(`Retry: bun run fetch-corpus ${failed.join(" ")} --force`);
	console.log("Paywalled or bot-blocked pages may need a manual save into corpus/ by hand.");
}
console.log("Spot-check the markdown, then: bun run upload-corpus");
