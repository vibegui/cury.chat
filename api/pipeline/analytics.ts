// Telemetria de uso: o que perguntam, de onde, por qual canal.
//
// O que é gravado, e o que deliberadamente não é:
//
//   grava   estado (UF), país, canal, assunto classificado, um hash da sessão
//   NÃO     endereço IP, cidade, o texto da pergunta
//
// O IP chega em toda requisição e é tentador guardar. Não guardamos: a UF é
// tudo que uma pergunta de "de onde vêm" precisa, e um IP num projeto sobre
// opinião política é um passivo, não um ativo. O hash de sessão permite contar
// quantas pessoas distintas e quem conversa mais, sem identificar ninguém — e
// não é reversível para o id original.
//
// O texto fica onde já ficava (a thread, 30 dias). Isto aqui é só agregado.
//
// Um evento por turno, com TTL de 90 dias. KV não tem incremento atômico, então
// um contador lido-e-reescrito perderia escritas sob concorrência; gravar
// eventos e somar na leitura é mais lento e está certo.
// ponytail: agregação na leitura via KV list. Se passar de ~50k eventos no
// período, migrar para contadores em Durable Object.

import type { Env } from "../env.ts";

const TTL_SECONDS = 60 * 60 * 24 * 90;

export interface TurnEvent {
	ts: number;
	channel: "web" | "whatsapp";
	/** Sigla da UF quando o Cloudflare a conhece. */
	state?: string;
	country?: string;
	topic: string;
	/** Hash não reversível da sessão/telefone, só para contagem distinta. */
	who: string;
}

/**
 * Classificação por palavra-chave, não por LLM. Uma chamada de modelo por turno
 * só para rotular dobraria o custo e adicionaria latência ao caminho quente,
 * para uma informação que é agregada e tolera ruído.
 */
const TOPIC_PATTERNS: Array<[string, RegExp]> = [
	["educacao", /educa|escola|professor|aluno|ensino|pensadores|soft|creche|universidade/i],
	[
		"saude-mental",
		/saúde mental|saude mental|suicíd|suicid|depress|ansied|emocion|psicólog|psicolog|insubstituível|touchpeace|terapia/i,
	],
	["saude", /\bsus\b|telemedicin|hospital|médic|medic|vacina|pnape|remédio|saúde(?! mental)/i],
	["seguranca", /seguran|violênc|violenc|polícia|policia|crime|armas|presídio|presidio/i],
	[
		"economia",
		/economia|imposto|tribut|inflação|inflacao|emprego|salário|salario|juros|renda|pobreza/i,
	],
	["empreendedorismo", /empreend|microempres|mei\b|pequeno negócio|startup|negócio|negocio/i],
	[
		"semipresidencialismo",
		/semipresidencial|primeiro-ministro|reforma política|stf|supremo|congresso|constituição|constituicao/i,
	],
	[
		"inteligencia-multifocal",
		/multifocal|\btim\b|gestão da emoção|gestao da emocao|janela da memória|fenômeno ram/i,
	],
	["neuroinclusao", /neurodiverg|neuroinclus|autis|tdah|deficiên|deficien/i],
	[
		"quem-e",
		/quem é|quem e ele|biografia|história dele|historia dele|livro|escritor|psiquiatra|idade|família|familia/i,
	],
	["eleicao", /eleiç|eleic|voto|votar|urna|candidat|avante|vice|pesquisa|segundo turno|campanha/i],
	["meio-ambiente", /ambient|clima|amazôn|amazon|desmatamento|sustentab/i],
	["agro", /agro|agricultur|fazend|produtor rural|pecuár|pecuar/i],
];

export function classifyTopic(text: string): string {
	for (const [topic, pattern] of TOPIC_PATTERNS) {
		if (pattern.test(text)) return topic;
	}
	return "outros";
}

/** FNV-1a truncado. Contagem distinta, não identificação. */
export function pseudonym(id: string): string {
	let hash = 0x811c9dc5;
	for (let i = 0; i < id.length; i++) {
		hash ^= id.charCodeAt(i);
		hash = Math.imul(hash, 0x01000193) >>> 0;
	}
	return hash.toString(36);
}

export function dayStamp(ts = Date.now()): string {
	return new Date(ts).toISOString().slice(0, 10);
}

/**
 * Nunca lança e nunca é esperado pelo caminho da resposta. Telemetria que
 * derruba um turno é pior do que telemetria nenhuma.
 */
export async function recordTurn(
	env: Env,
	input: {
		channel: TurnEvent["channel"];
		text: string;
		who: string;
		// `Request.cf` é uma união larga no tipo do Hono; a leitura é defensiva
		// de qualquer forma, porque os campos são opcionais em runtime também.
		cf?: Record<string, unknown>;
	},
): Promise<void> {
	try {
		const ts = Date.now();
		const event: TurnEvent = {
			ts,
			channel: input.channel,
			state: typeof input.cf?.regionCode === "string" ? input.cf.regionCode : undefined,
			country: typeof input.cf?.country === "string" ? input.cf.country : undefined,
			topic: classifyTopic(input.text),
			who: pseudonym(input.who),
		};
		// A chave carrega o dia para a leitura poder filtrar por prefixo sem ler
		// tudo, e um sufixo aleatório para dois turnos no mesmo milissegundo não
		// se sobrescreverem.
		const key = `q:${dayStamp(ts)}:${ts}:${Math.random().toString(36).slice(2, 8)}`;
		await env.THREADS.put(key, JSON.stringify(event), { expirationTtl: TTL_SECONDS });
	} catch (err) {
		console.warn("analytics falhou", err);
	}
}

export interface AnalyticsSummary {
	from: string;
	to: string;
	turns: number;
	people: number;
	byState: Array<{ state: string; turns: number; people: number }>;
	byTopic: Array<{ topic: string; turns: number }>;
	byChannel: Array<{ channel: string; turns: number }>;
	byDay: Array<{ day: string; turns: number }>;
	/** Sessões mais ativas, pseudonimizadas. */
	topPeople: Array<{ who: string; turns: number; topics: string[] }>;
	truncated: boolean;
}

const MAX_EVENTS = 50_000;

export async function readAnalytics(env: Env, days = 30): Promise<AnalyticsSummary> {
	const today = new Date();
	const stamps: string[] = [];
	for (let i = 0; i < days; i++) {
		stamps.push(dayStamp(today.getTime() - i * 86_400_000));
	}

	const events: TurnEvent[] = [];
	let truncated = false;

	// Uma varredura por dia: o prefixo mantém cada list pequeno e permite parar
	// cedo quando o período já encheu.
	for (const day of stamps) {
		let cursor: string | undefined;
		do {
			const page = await env.THREADS.list({ prefix: `q:${day}:`, limit: 1000, cursor });
			const values = await Promise.all(page.keys.map((k) => env.THREADS.get(k.name)));
			for (const raw of values) {
				if (!raw) continue;
				try {
					events.push(JSON.parse(raw) as TurnEvent);
				} catch {
					// evento corrompido não derruba o relatório
				}
			}
			cursor = page.list_complete ? undefined : page.cursor;
			if (events.length >= MAX_EVENTS) {
				truncated = true;
				cursor = undefined;
			}
		} while (cursor);
		if (truncated) break;
	}

	const countBy = <K extends keyof TurnEvent>(key: K) => {
		const out = new Map<string, number>();
		for (const e of events) {
			const v = e[key];
			if (typeof v === "string" && v) out.set(v, (out.get(v) ?? 0) + 1);
		}
		return out;
	};

	const statePeople = new Map<string, Set<string>>();
	const peopleTurns = new Map<string, number>();
	const peopleTopics = new Map<string, Set<string>>();
	for (const e of events) {
		if (e.state) {
			if (!statePeople.has(e.state)) statePeople.set(e.state, new Set());
			statePeople.get(e.state)?.add(e.who);
		}
		peopleTurns.set(e.who, (peopleTurns.get(e.who) ?? 0) + 1);
		if (!peopleTopics.has(e.who)) peopleTopics.set(e.who, new Set());
		peopleTopics.get(e.who)?.add(e.topic);
	}

	const sortDesc = <T>(m: Map<string, number>, make: (k: string, n: number) => T): T[] =>
		[...m.entries()].sort((a, b) => b[1] - a[1]).map(([k, n]) => make(k, n));

	return {
		from: stamps[stamps.length - 1],
		to: stamps[0],
		turns: events.length,
		people: peopleTurns.size,
		byState: sortDesc(countBy("state"), (state, turns) => ({
			state,
			turns,
			people: statePeople.get(state)?.size ?? 0,
		})),
		byTopic: sortDesc(countBy("topic"), (topic, turns) => ({ topic, turns })),
		byChannel: sortDesc(countBy("channel"), (channel, turns) => ({ channel, turns })),
		byDay: stamps
			.map((day) => ({ day, turns: events.filter((e) => dayStamp(e.ts) === day).length }))
			.reverse(),
		topPeople: sortDesc(peopleTurns, (who, turns) => ({
			who,
			turns,
			topics: [...(peopleTopics.get(who) ?? [])].slice(0, 4),
		})).slice(0, 15),
		truncated,
	};
}
