// Páginas de tópico: /temas e /tema/:slug.
//
// Existem por SEO. `/chat` e `/s/` são noindex e a landing é uma página só, de
// modo que a busca mais óbvia em ano eleitoral — "o que fulano propõe sobre
// educação" — não tinha nada nosso para encontrar. Cada tópico vira uma página
// estática, rápida e indexável, com um botão que abre o chat já com a pergunta
// escrita.
//
// O corpo vem de content/topics.json, gerado rodando o próprio agente
// (`bun run topics`). A página diz o que o agente diria, com as mesmas fontes.

import { Hono } from "hono";
import generated from "../../content/topics.json";
import { type Topic, TOPICS, topicBySlug } from "../../content/topics.ts";
import type { Env } from "../env.ts";
import { CACHE_PAGE, serveStatic, staticAsset } from "../lib/static-asset.ts";

interface GeneratedTopic {
	slug: string;
	answer: string;
	sources: string[];
	generatedAt: string;
}

const CONTENT = generated as unknown as Record<string, GeneratedTopic>;
const SITE = "https://cury.chat";

function esc(s: string): string {
	return s
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;");
}

/**
 * O agente escreve markdown leve. Renderizar com uma dependência seria trazer
 * uma superfície de XSS para três construções, então o texto é escapado
 * primeiro e só depois **negrito** e parágrafos são reintroduzidos.
 */
function prose(text: string): string {
	return esc(text)
		.split(/\n{2,}/)
		.map((p) => `<p>${p.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>").trim()}</p>`)
		.join("\n");
}

function head(title: string, description: string, url: string, image: string): string {
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

const HEADER = `<header>
  <div class="wrap">
    <a class="brand" href="/">
      <img src="/icon.svg" alt="" width="30" height="30">
      cury.chat <span>projeto independente</span>
    </a>
  </div>
</header>`;

const FOOTER = `<footer>
  <div class="wrap">
    <p><b>cury.chat</b> — projeto independente, sem vínculo com Augusto Cury, com a campanha ou com o Avante.</p>
    <p>Respostas geradas por inteligência artificial a partir de fontes públicas. Podem conter erros — confira na fonte.</p>
    <p>Em sofrimento? <b>CVV 188</b>, gratuito, 24 horas.</p>
  </div>
</footer>`;

function otherTopics(current: string): string {
	const rest = TOPICS.filter((t) => t.slug !== current && CONTENT[t.slug]);
	if (rest.length === 0) return "";
	return `<section>
  <div class="wrap">
    <h2>Outros assuntos</h2>
    <ul class="topic-list">
      ${rest
				.map(
					(t) =>
						`<li><a href="/tema/${t.slug}"><span class="what">${esc(t.title)}</span><span class="meta">${esc(t.blurb)}</span></a></li>`,
				)
				.join("\n      ")}
    </ul>
  </div>
</section>`;
}

function topicPage(topic: Topic, body: GeneratedTopic): string {
	const url = `${SITE}/tema/${topic.slug}`;
	const chatHref = `/chat?q=${encodeURIComponent(topic.prompt)}`;

	// FAQPage: a página é literalmente uma pergunta e a resposta ancorada.
	const jsonLd = JSON.stringify({
		"@context": "https://schema.org",
		"@type": "FAQPage",
		inLanguage: "pt-BR",
		mainEntity: [
			{
				"@type": "Question",
				name: topic.title,
				acceptedAnswer: { "@type": "Answer", text: body.answer },
			},
		],
	});

	return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
${head(topic.title, topic.blurb, url, `${SITE}/tema/${topic.slug}/og.png`)}
<script type="application/ld+json">${jsonLd}</script>
</head>
<body>
${HEADER}

<section style="padding-top:26px">
  <div class="wrap">
    <h1>${esc(topic.title)}</h1>
    <p class="lede">${esc(topic.blurb)}</p>

    <div class="answer">
      ${prose(body.answer)}
    </div>

    <details class="sources-block">
      <summary>${body.sources.length} ${body.sources.length === 1 ? "fonte" : "fontes"} usadas nesta resposta</summary>
      <ul>${body.sources.map((s) => `<li>${esc(s)}</li>`).join("")}</ul>
    </details>

    <div class="cta-row">
      <a class="cta" href="${chatHref}">Conversar sobre esse assunto</a>
    </div>
    <small class="cta-note">Abre o chat com a pergunta já escrita. Grátis, sem cadastro.</small>

    <div class="disclaimer">
      <strong>Como esta página foi feita.</strong>
      O texto acima é a resposta do próprio agente, ancorada nas fontes listadas — não é
      redação de campanha. Este é um projeto independente: não é a campanha, não é o Avante e
      não é Augusto Cury. Respostas geradas por IA podem conter erros.
    </div>
  </div>
</section>

${otherTopics(topic.slug)}
${FOOTER}
</body>
</html>`;
}

function indexPage(): string {
	const url = `${SITE}/temas`;
	return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
${head(
	"O que Augusto Cury propõe, por assunto",
	"Educação, saúde mental, semipresidencialismo, empreendedorismo e mais — cada assunto com a resposta ancorada no plano de governo protocolado no TSE.",
	url,
	`${SITE}/og.png`,
)}
</head>
<body>
${HEADER}
<section style="padding-top:26px">
  <div class="wrap">
    <h1>O que ele propõe, por assunto</h1>
    <p class="lede">
      Cada página traz a resposta do agente sobre um eixo do plano de governo, com as fontes
      que a sustentaram. Dá para ler direto ou abrir o chat e continuar perguntando.
    </p>
    <ul class="topic-list">
      ${TOPICS.filter((t) => CONTENT[t.slug])
				.map(
					(t) =>
						`<li><a href="/tema/${t.slug}"><span class="what">${esc(t.title)}</span><span class="meta">${esc(t.blurb)}</span></a></li>`,
				)
				.join("\n      ")}
    </ul>
    <p class="cta-note">
      Fora do plano de governo: <a href="/patrimonio">de onde vem o patrimônio dele</a>.
    </p>
  </div>
</section>
${FOOTER}
</body>
</html>`;
}

/* ---- /patrimonio ---------------------------------------------------------
 *
 * Escrita à mão, não gerada pelo agente: o corpus não tem nada sobre a origem
 * do patrimônio, então o agente só poderia inventar. Aqui os números vêm de
 * fonte primária (declaração ao TSE, comunicado da Arco à SEC) e a página diz
 * de onde tirou cada um.
 *
 * Fica deliberadamente fora do índice da home e da lista de /temas: é a
 * resposta para quem procura, não uma bandeira. Só o rodapé de /temas e o
 * sitemap levam até ela.
 *
 * A seção "o que foi contestado" não é concessão: uma página que só conta a
 * metade favorável é a que um jornalista derruba em dez minutos, e aí o
 * projeto inteiro perde credibilidade junto.
 */

const PATRIMONIO_TITLE = "De onde vem o patrimônio de Augusto Cury";
const PATRIMONIO_BLURB =
	"R$ 242,3 milhões declarados ao TSE. A maior parte vem da venda da Escola da Inteligência para a Arco Educação, companhia aberta na Nasdaq — transação pública e rastreável.";

const PATRIMONIO_SOURCES = [
	"Declaração de bens ao TSE — eleições 2026, DivulgaCandContas",
	"Arco Platform Ltd. (Nasdaq: ARCE) — comunicado de aquisição de 60% da Escola da Inteligência, 2020, reportado à SEC",
	"Folha de S.Paulo, setembro de 2026 — empresas ausentes da declaração",
	"Nota da campanha de Augusto Cury, 5 de setembro de 2026",
];

function patrimonioPage(): string {
	const url = `${SITE}/patrimonio`;
	return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
${head(PATRIMONIO_TITLE, PATRIMONIO_BLURB, url, `${SITE}/og.png`)}
</head>
<body>
${HEADER}

<section style="padding-top:26px">
  <div class="wrap">
    <h1>De onde vem o patrimônio dele</h1>
    <p class="lede">${esc(PATRIMONIO_BLURB)}</p>

    <div class="answer">
      <p><strong>A venda da Escola da Inteligência.</strong> Em 2020, a Arco Educação — companhia
      de capital aberto listada na Nasdaq, que reporta à SEC americana — comprou 60% da Escola da
      Inteligência por R$ 288 milhões: R$ 200 milhões à vista e R$ 88 milhões no segundo trimestre
      de 2021. Somadas as parcelas seguintes, a Arco pagou R$ 589,1 milhões à família entre 2020 e
      2023.</p>

      <p>A Escola da Inteligência leva às escolas, em programas de educação socioemocional, a
      Teoria da Inteligência Multifocal formulada por Cury. Ele não constava do quadro societário: a
      empresa era da esposa, Suleima, das filhas Camila, Carolina e Cláudia e do genro Bruno
      Oliveira.</p>

      <p><strong>O resto da declaração.</strong> O maior item isolado são R$ 121 milhões de
      empréstimo a receber da Filadélfia Nature, empresa do setor rural da qual ele detém 99,97%.
      O restante são 17 fazendas, imóveis urbanos e aplicações no Brasil e no exterior. Antes disso
      há três décadas de direitos autorais — mais de 40 milhões de livros vendidos.</p>

      <p><strong>O que foi contestado.</strong> Em setembro de 2026 a Folha de S.Paulo apontou
      cinco empresas ligadas a ele fora da declaração entregue ao TSE: três na Flórida (Cury
      Academia Comportamental, Contemplare Investments e Free Mind Publish) e duas em Ribeirão
      Preto (Contemplare e Academia de Pensar e Brincar). No dia 5 de setembro a campanha disse que
      corrigiria a declaração e classificou as ausências como "inconsistências pontuais".</p>
    </div>

    <details class="sources-block">
      <summary>${PATRIMONIO_SOURCES.length} fontes desta página</summary>
      <ul>${PATRIMONIO_SOURCES.map((s) => `<li>${esc(s)}</li>`).join("")}</ul>
    </details>

    <div class="disclaimer">
      <strong>Esta página não foi escrita pelo agente.</strong>
      As respostas do chat vêm do acervo de materiais públicos, que não cobre este assunto — então
      aqui os números foram compilados à mão, com a fonte de cada um listada acima. Projeto
      independente: não é a campanha, não é o Avante e não é Augusto Cury.
    </div>

    <div class="cta-row">
      <a class="cta cta-secondary" href="/temas">Ver o que ele propõe, por assunto</a>
    </div>
  </div>
</section>

${FOOTER}
</body>
</html>`;
}

export const topicsRoute = new Hono<{ Bindings: Env }>();

// Construídas uma vez por isolate: o conteúdo só muda em deploy.
const INDEX = staticAsset(indexPage(), "text/html; charset=utf-8", CACHE_PAGE);
const PAGES = new Map(
	TOPICS.filter((t) => CONTENT[t.slug]).map((t) => [
		t.slug,
		staticAsset(topicPage(t, CONTENT[t.slug]), "text/html; charset=utf-8", CACHE_PAGE),
	]),
);

const PATRIMONIO = staticAsset(patrimonioPage(), "text/html; charset=utf-8", CACHE_PAGE);

topicsRoute.get("/temas", (c) => serveStatic(INDEX, c.req.header("if-none-match")));

topicsRoute.get("/patrimonio", (c) => serveStatic(PATRIMONIO, c.req.header("if-none-match")));

topicsRoute.get("/tema/:slug", (c) => {
	const page = PAGES.get(c.req.param("slug"));
	if (!page) return c.redirect("/temas", 302);
	return serveStatic(page, c.req.header("if-none-match"));
});

/** Slugs com página publicada — usado pelo sitemap. */
export function publishedTopics(): Topic[] {
	return TOPICS.filter((t) => CONTENT[t.slug] && topicBySlug(t.slug));
}
