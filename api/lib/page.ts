// Cromo compartilhado das páginas estáticas (/temas, /tema/:slug, /patrimonio,
// /benchmark). Vive fora de routes/ porque três famílias de página já o usam e
// a quarta não deveria copiar de novo o <head> — um og:image errado numa delas
// é invisível até alguém compartilhar o link.

export const SITE = "https://cury.chat";

export function esc(s: string): string {
	return s
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&#39;");
}

/**
 * Markdown leve — parágrafos, listas, **negrito** e *itálico*. Renderizar com
 * uma dependência seria trazer uma superfície de XSS para três construções,
 * então o texto é escapado primeiro e a marcação reintroduzida depois.
 *
 * Morava em export/html.ts. Veio para cá porque a versão que as páginas de
 * tópico usavam não tratava bullet: `- item` virava parágrafo com o hífen
 * literal no meio do texto, visível em produção em /tema/semipresidencialismo.
 * Uma cópia só, com teste, em vez de duas divergindo.
 */
export function mdToHtml(src: string): string {
	if (!src) return "";
	const trimmed = src.replace(/\r\n/g, "\n").trim();
	if (!trimmed) return "";
	return trimmed
		.split(/\n\s*\n/)
		.map(renderBlock)
		.join("\n");
}

function renderBlock(block: string): string {
	const lines = block.split("\n");
	const allBullets = lines.every((l) => /^\s*[-*]\s+/.test(l)) && lines.length > 0;
	if (allBullets) {
		const items = lines
			.map((l) => l.replace(/^\s*[-*]\s+/, ""))
			.map((l) => `<li>${inlineMd(esc(l))}</li>`)
			.join("");
		return `<ul>${items}</ul>`;
	}
	return `<p>${inlineMd(esc(block).replace(/\n/g, "<br>"))}</p>`;
}

function inlineMd(s: string): string {
	// Negrito antes de itálico (marcador mais longo), senão **x** vira *.
	return s
		.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
		.replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g, "$1<em>$2</em>");
}

export function head(title: string, description: string, url: string, image: string): string {
	return `<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${esc(title)} · cury.chat</title>
<meta name="description" content="${esc(description)}">
<link rel="canonical" href="${url}">
<meta name="theme-color" content="#0d3a63">
<meta name="color-scheme" content="light dark">
<meta property="og:type" content="article">
<meta property="og:url" content="${url}">
<meta property="og:site_name" content="cury.chat">
<meta property="og:locale" content="pt_BR">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:image" content="${image}">
<meta property="og:image:secure_url" content="${image}">
<meta property="og:image:type" content="image/png">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(title)}">
<meta name="twitter:description" content="${esc(description)}">
<meta name="twitter:image" content="${image}">
<link rel="icon" href="/favicon.ico" sizes="32x32">
<link rel="icon" href="/icon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="/apple-touch-icon.png">
<link rel="stylesheet" href="/styles.css">`;
}

export const HEADER = `<header>
  <div class="wrap">
    <a class="brand" href="/">
      <img src="/icon.svg" alt="" width="30" height="30">
      cury.chat <span>projeto independente</span>
    </a>
  </div>
</header>`;

export const FOOTER = `<footer>
  <div class="wrap">
    <p><b>cury.chat</b> — projeto independente, sem vínculo com Augusto Cury, com a campanha ou com o Avante.</p>
    <p>Respostas geradas por inteligência artificial a partir de fontes públicas. Podem conter erros — confira na fonte. <a href="/benchmark">Como escolhemos o modelo</a>.</p>
    <p>Em sofrimento? <b>CVV 188</b>, gratuito, 24 horas.</p>
  </div>
</footer>`;
