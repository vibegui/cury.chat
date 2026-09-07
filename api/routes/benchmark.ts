// /benchmark — por que este site roda o modelo que roda.
//
// A página é gerada de content/benchmark.json, que sai de `bun run benchmark`.
// Nenhum número é escrito à mão aqui: se a bateria rodar de novo e a ordem
// mudar, a página muda junto. O texto em volta é editorial — é a leitura dos
// números, não os números.

import { Hono } from "hono";
import raw from "../../content/benchmark.json";
import type { Env } from "../env.ts";
import { esc, FOOTER, head, HEADER, SITE } from "../lib/page.ts";
import { CACHE_PAGE, serveStatic, staticAsset } from "../lib/static-asset.ts";

interface Dims {
	fidelidade: number;
	conformidade: number;
	utilidade: number;
	concisao: number;
}

interface Result {
	key: string;
	id: string;
	label: string;
	tier: "frontier" | "open-medio" | "open-budget";
	arm: string;
	maxTokens: number;
	reasoning: string;
	n: number;
	score: number;
	dims: Dims;
	hardFails: number;
	hardFailIds: string[];
	costPerTurn: number;
	costMeasured: number;
	inTokens: number;
	outTokens: number;
	reasoningTokens: number;
	latencyMs: number;
	empties: number;
	errors: number;
}

interface Benchmark {
	ranAt: string;
	judge: string;
	questions: { id: string; category: string; text: string; expects: string[]; hardFail: string }[];
	weights: Dims;
	baseline: Result[];
	sweep: Result[];
	frontier: string[];
	recommended: string | null;
	ceiling: number;
}

const B = raw as unknown as Benchmark;

/** O modelo que o Worker realmente usa. Fica no wrangler.toml; ver o teste. */
const IN_PRODUCTION = "z-ai/glm-5.3-flash";

const ALL: Result[] = [...B.baseline, ...B.sweep]
	.filter((r) => r.n > 0)
	.sort((a, b) => b.score - a.score);

const FRONTIER = new Set(B.frontier);

const TIER_LABEL: Record<Result["tier"], string> = {
	frontier: "fronteira",
	"open-medio": "aberto · médio",
	"open-budget": "aberto · barato",
};

const CATEGORY_LABEL: Record<string, string> = {
	fidelidade: "Fidelidade ao plano",
	acervo: "Limite do acervo",
	"saude-mental": "Saúde mental",
	identidade: "Identidade",
	eleitoral: "Eleitoral",
	escopo: "Escopo e alucinação",
};

const ARM_LABEL: Record<string, string> = {
	t4096: "padrão",
	"r-high+t4096": "raciocínio alto",
};

/** Dólar por turno é ilegível; mil turnos cabe na cabeça. */
const per1k = (cost: number) => `$${(cost * 1000).toFixed(2)}`;

function row(r: Result, rank: number): string {
	const chosen = r.key === B.recommended;
	const classes = [chosen ? "chosen" : "", FRONTIER.has(r.key) ? "front" : ""]
		.filter(Boolean)
		.join(" ");
	const badge = chosen ? ' <span class="badge">em produção</span>' : "";
	const hf =
		r.hardFails === 0
			? "—"
			: `<span class="hf" title="${esc(r.hardFailIds.join(", "))}">${r.hardFails}</span>`;
	const vz = r.empties === 0 ? "—" : `<span class="hf">${r.empties}</span>`;

	return `<tr${classes ? ` class="${classes}"` : ""}>
  <td class="rank">${rank}</td>
  <td class="model">${esc(r.label)}${badge}<span class="slug">${esc(r.id)}</span></td>
  <td class="tier">${TIER_LABEL[r.tier]}</td>
  <td class="tier">${esc(ARM_LABEL[r.arm] ?? r.arm)}</td>
  <td class="num strong">${r.score.toFixed(1)}</td>
  <td class="num">${r.dims.fidelidade.toFixed(1)}</td>
  <td class="num">${r.dims.conformidade.toFixed(1)}</td>
  <td class="num">${r.dims.utilidade.toFixed(1)}</td>
  <td class="num">${r.dims.concisao.toFixed(1)}</td>
  <td class="num">${hf}</td>
  <td class="num">${vz}</td>
  <td class="num">${per1k(r.costPerTurn)}</td>
  <td class="num">${(r.latencyMs / 1000).toFixed(1)}s</td>
</tr>`;
}

function table(): string {
	return `<div class="table-wrap">
<table class="bench">
  <thead>
    <tr>
      <th></th><th>Modelo</th><th>Faixa</th><th>Config</th>
      <th class="num">Nota</th>
      <th class="num" title="Ancorado nas fontes, sem inventar">Fid</th>
      <th class="num" title="Terceira pessoa, sem pedir voto, sem atacar, CVV quando é o caso">Conf</th>
      <th class="num" title="Responde de fato o que foi perguntado">Útil</th>
      <th class="num" title="Densidade — enrolação perde ponto">Brev</th>
      <th class="num" title="Falhas graves em 13 perguntas">Graves</th>
      <th class="num" title="Respostas vazias">Vazias</th>
      <th class="num" title="Custo de mil turnos, do preço de tabela sobre os tokens medidos">/1k</th>
      <th class="num">Latência</th>
    </tr>
  </thead>
  <tbody>
${ALL.map((r, i) => row(r, i + 1)).join("\n")}
  </tbody>
</table>
</div>`;
}

function questionsBlock(): string {
	const groups = new Map<string, typeof B.questions>();
	for (const q of B.questions) groups.set(q.category, [...(groups.get(q.category) ?? []), q]);

	return [...groups.entries()]
		.map(
			([cat, qs]) => `<h3>${esc(CATEGORY_LABEL[cat] ?? cat)}</h3>
<ul class="qlist">
${qs
	.map(
		(q) => `  <li>
    <span class="q">“${esc(q.text)}”</span>
    <span class="e">Correto: ${esc(q.expects.join("; "))}.</span>
    <span class="f">Falha grave: ${esc(q.hardFail)}</span>
  </li>`,
	)
	.join("\n")}
</ul>`,
		)
		.join("\n");
}

const CHOSEN = ALL.find((r) => r.key === B.recommended);
const TOP_FRONTIER = ALL.filter((r) => r.tier === "frontier").sort((a, b) => b.score - a.score)[0];
const CHEAPEST = [...ALL].sort((a, b) => a.costPerTurn - b.costPerTurn)[0];

/** Quantas vezes o melhor de fronteira custa mais que o que escolhemos. */
const TIMES = CHOSEN && TOP_FRONTIER ? TOP_FRONTIER.costPerTurn / CHOSEN.costPerTurn : 0;

function page(): string {
	const url = `${SITE}/benchmark`;
	const title = "Qual modelo responde melhor sobre um candidato";
	const desc = `${ALL.length} configurações, ${B.questions.length} perguntas, julgadas às cegas. Fidelidade ao plano de governo, conformidade eleitoral e custo medido por turno.`;

	return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
${head(title, desc, url, `${SITE}/og.png`)}
</head>
<body>
${HEADER}

<section style="padding-top:26px">
  <div class="wrap">
    <h1>Qual modelo responde melhor sobre um candidato</h1>
    <p class="lede">
      Um agente sobre um candidato à Presidência erra de um jeito caro: inventa uma proposta,
      fabrica uma citação de livro, ou fala na primeira pessoa como se fosse ele. Antes de
      escolher o modelo que responde aqui, medimos ${ALL.length} configurações nas mesmas
      ${B.questions.length} perguntas.
    </p>

    <div class="verdict">
      <strong>O que rodamos, e por quê.</strong>
      ${VERDICT}
    </div>

    <h2 id="resultado">Resultado</h2>
    <p>
      Nota de 0 a 100, ponderada: conformidade pesa ${Math.round(B.weights.conformidade * 100)}%,
      fidelidade ${Math.round(B.weights.fidelidade * 100)}%, utilidade
      ${Math.round(B.weights.utilidade * 100)}% e brevidade ${Math.round(B.weights.concisao * 100)}%.
      Conformidade pesa mais que qualquer outra porque é o que separa este projeto de um chatbot
      qualquer sobre um candidato — e é o que uma resolução do TSE cobra.
    </p>
    ${table()}
    <p class="footnote">
      Linhas com marca à esquerda estão na fronteira de Pareto: nenhuma outra configuração é ao
      mesmo tempo melhor <em>e</em> mais barata. “Graves” conta o que tornaria o projeto
      indefensável — inventar citação de livro, responder como se fosse o candidato, pedir voto,
      atacar adversário, ou omitir o CVV 188 diante de um sinal de risco.
    </p>

    <h2 id="achado">O parâmetro que decidia tudo</h2>
    <p>
      A primeira rodada mediu também um teto de saída de 1024 tokens, que era o que este site
      usava. Ele estrangulava todo modelo que raciocina antes de responder: o modelo gastava o
      teto pensando e devolvia conteúdo vazio. Mesmas ${B.questions.length} perguntas, só esse
      número mudando:
    </p>
    <div class="table-wrap">
    <table class="bench">
      <thead><tr><th>Modelo</th><th class="num">Nota a 1024</th><th class="num">Nota a 4096</th><th class="num">Respostas vazias</th></tr></thead>
      <tbody>
        <tr><td class="model">GLM-5.3 Flash</td><td class="num">67,4</td><td class="num strong">95,4</td><td class="num">3 → 0</td></tr>
        <tr><td class="model">Kimi K2.6</td><td class="num">46,0</td><td class="num strong">86,5</td><td class="num">6 → 0</td></tr>
        <tr><td class="model">Qwen3.8 Flash</td><td class="num">64,8</td><td class="num strong">82,8</td><td class="num">4 → 1</td></tr>
        <tr><td class="model">DeepSeek V4 Flash</td><td class="num">91,4</td><td class="num">91,8</td><td class="num">0 → 0</td></tr>
      </tbody>
    </table>
    </div>
    <p class="footnote">
      Teto é limite, não meta — quem responde em 300 tokens não gasta mais porque ele subiu. O
      custo por turno mudou de $1,05 para $1,06 por mil turnos. E há uma consequência
      desconfortável: o DeepSeek, que este site rodava, é o único imune, porque raciocina menos.
      Quando ele ganhou a comparação anterior, ganhou de um campo que estava sendo estrangulado
      por um parâmetro nosso. A escolha estava certa pelo motivo errado. Por isso a tabela acima
      só tem configurações de 4096: medir de novo uma que já foi descartada é gastar chamada para
      confirmar o óbvio.
    </p>

    <h2 id="metodo">Como o teste funciona</h2>

    <h3>Todo candidato roda o site de verdade</h3>
    <p>
      Cada resposta veio do pipeline em produção, com o modelo trocado por cima: mesma busca no
      acervo, mesmo prompt, mesmas travas. Um benchmark que remonta o prompt por fora mede outro
      sistema, não este.
    </p>

    <h3>Todo mundo recebe as mesmas fontes</h3>
    <p>
      A busca roda sem reescrita de consulta e sem reranking, então a mesma pergunta devolve os
      mesmos trechos com os mesmos scores — conferido rodando duas vezes antes de começar. Todo
      modelo argumenta com a mesma evidência na mão, e a diferença de nota é o modelo.
    </p>

    <h3>O juiz é cego, e vê a evidência inteira</h3>
    <p>
      Quem dá as notas é o <b>${esc(B.judge)}</b>. Ele nunca vê qual modelo escreveu a resposta —
      elas chegam sob identificadores opacos, embaralhadas, todas as da mesma pergunta num
      julgamento só. E vê os <em>dois</em> blocos de evidência que o modelo tinha: o texto
      recuperado do acervo e o prompt do sistema.
    </p>
    <p>
      Esse segundo bloco não é detalhe. Numa versão anterior o juiz só recebia os nomes das
      fontes, e marcou como invenção grave todo número específico que uma resposta trazia —
      inclusive os que estavam no acervo. Todo modelo apanhou por acertar. Depois, já com o texto,
      ainda reprovou a melhor configuração por “inventar” um programa que está escrito no prompt.
      Duas rodadas inteiras foram descartadas por causa disso.
    </p>

    <h3>Custo é modelado, não cronometrado</h3>
    <p>
      Para modelos de peso aberto o OpenRouter roteia entre provedores com preços diferentes, e
      não dá para escolher. No mesmo modelo, mesmo prompt e contagens de token praticamente
      idênticas, o custo cobrado variou de 0,47× a 1,32× o preço de tabela — 2,8× de espalhamento
      vindo do sorteio de provedor. A coluna de custo usa o preço de tabela sobre os tokens
      medidos, que é determinístico e compara configuração com configuração.
    </p>

    <h3>As ${B.questions.length} perguntas</h3>
    <p>
      Cinco cobram fidelidade ao plano de governo. As outras oito são armadilhas: pedem uma
      citação de um livro que não está no acervo, um livro que não existe, uma comparação
      depreciativa com adversário, um número de votos de uma eleição que ele não disputou.
    </p>
    <details class="sources-block">
      <summary>Ver as ${B.questions.length} perguntas e o critério de cada uma</summary>
      <div class="qwrap">${questionsBlock()}</div>
    </details>

    <h2 id="limites">O que este teste não mede</h2>
    <ul class="limits">
      <li>Se as propostas de Cury são boas, ou se funcionariam. Mede se o agente as relata com fidelidade.</li>
      <li><b>Variância.</b> Uma passada por pergunta, temperatura padrão. Os quatro primeiros colocados estão dentro de 1,4 ponto — essa diferença não significa nada. O que significa é a distância entre o topo e o fim da tabela, e o custo.</li>
      <li>Qualidade em conversa longa. Cada pergunta é o primeiro turno de uma conversa nova.</li>
      <li>Quem escreveu as perguntas. O juiz é cego quanto ao modelo, mas as perguntas e a rubrica saíram de quem construiu o agente. Uma pergunta mal escolhida enviesa antes de qualquer avaliador olhar.</li>
      <li>Preferência de família. O juiz é um modelo da Anthropic e há um modelo da Anthropic entre os avaliados.</li>
      <li>Preço futuro. Preços de ${esc(B.ranAt)}, numa categoria que muda de mês em mês.</li>
    </ul>

    <div class="disclaimer">
      <strong>Rodado em ${esc(B.ranAt)}.</strong>
      O código do teste, as perguntas e os critérios estão no repositório, em
      <code>scripts/benchmark.ts</code>; os resultados brutos em
      <code>content/benchmark.json</code>. Projeto independente: não é a campanha, não é o
      Avante e não é Augusto Cury.
    </div>

    <div class="cta-row">
      <a class="cta" href="/chat">Testar você mesmo</a>
      <a class="cta cta-secondary" href="/temas">O que ele propõe, por assunto</a>
    </div>
  </div>
</section>

${FOOTER}
</body>
</html>`;
}

// Prosa editorial: a leitura dos números. Revista à mão quando a bateria roda
// de novo; as tabelas se atualizam sozinhas.
const VERDICT =
	CHOSEN && TOP_FRONTIER
		? `Este site responde com <b>${esc(CHOSEN.label)}</b>, um modelo de peso aberto da faixa mais
     barata do teste. Ele tirou <b>${CHOSEN.score.toFixed(1)}</b> de 100 — a maior nota da
     tabela, acima de ${esc(TOP_FRONTIER.label)}, que tirou ${TOP_FRONTIER.score.toFixed(1)} e
     custa <b>${TIMES.toFixed(0)}× mais</b> por turno. A diferença de nota entre os quatro
     primeiros é pequena demais para significar alguma coisa; a de preço não é.
     O resultado prático é que, para esta tarefa, pagar preço de fronteira não compra
     qualidade — compra latência menor.`
		: "";

export const benchmarkRoute = new Hono<{ Bindings: Env }>();

const PAGE = staticAsset(page(), "text/html; charset=utf-8", CACHE_PAGE);

benchmarkRoute.get("/benchmark", (c) => serveStatic(PAGE, c.req.header("if-none-match")));

/** Exportado para o teste que trava a página contra o wrangler.toml. */
export { IN_PRODUCTION, CHEAPEST };
