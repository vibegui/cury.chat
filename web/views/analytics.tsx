import { ViewHeader } from "../components/view-header";
import { useMcpState } from "../context";

interface Row {
	turns: number;
}
interface StateRow extends Row {
	state: string;
	people: number;
}
interface TopicRow extends Row {
	topic: string;
}
interface ChannelRow extends Row {
	channel: string;
}
interface DayRow extends Row {
	day: string;
}
interface PersonRow extends Row {
	who: string;
	topics: string[];
}

interface Analytics {
	from: string;
	to: string;
	turns: number;
	people: number;
	byState: StateRow[];
	byTopic: TopicRow[];
	byChannel: ChannelRow[];
	byDay: DayRow[];
	topPeople: PersonRow[];
	truncated: boolean;
}

// Nomes legíveis para os slugs que a classificação por palavra-chave produz.
const TOPIC_LABEL: Record<string, string> = {
	educacao: "Educação",
	"saude-mental": "Saúde mental",
	saude: "Saúde / SUS",
	seguranca: "Segurança",
	economia: "Economia",
	empreendedorismo: "Empreendedorismo",
	semipresidencialismo: "Semipresidencialismo",
	"inteligencia-multifocal": "Inteligência Multifocal",
	neuroinclusao: "Neuroinclusão",
	"quem-e": "Quem é / biografia",
	eleicao: "Eleição",
	"meio-ambiente": "Meio ambiente",
	agro: "Agro",
	outros: "Outros",
};

const UF_NAME: Record<string, string> = {
	AC: "Acre",
	AL: "Alagoas",
	AP: "Amapá",
	AM: "Amazonas",
	BA: "Bahia",
	CE: "Ceará",
	DF: "Distrito Federal",
	ES: "Espírito Santo",
	GO: "Goiás",
	MA: "Maranhão",
	MT: "Mato Grosso",
	MS: "Mato Grosso do Sul",
	MG: "Minas Gerais",
	PA: "Pará",
	PB: "Paraíba",
	PR: "Paraná",
	PE: "Pernambuco",
	PI: "Piauí",
	RJ: "Rio de Janeiro",
	RN: "Rio Grande do Norte",
	RS: "Rio Grande do Sul",
	RO: "Rondônia",
	RR: "Roraima",
	SC: "Santa Catarina",
	SP: "São Paulo",
	SE: "Sergipe",
	TO: "Tocantins",
};

/** Barra proporcional ao maior valor da lista, não ao total. */
function Bar({ value, max }: { value: number; max: number }) {
	const pct = max > 0 ? Math.max(2, (value / max) * 100) : 0;
	return (
		<div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
			<div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
		</div>
	);
}

function Ranking<T extends Row>({
	title,
	rows,
	label,
	note,
	limit = 12,
}: {
	title: string;
	rows: T[];
	label: (row: T) => string;
	note?: (row: T) => string | undefined;
	limit?: number;
}) {
	if (rows.length === 0) {
		return (
			<section className="rounded-lg border p-4">
				<h3 className="mb-3 text-sm font-semibold">{title}</h3>
				<p className="text-sm text-muted-foreground">Nada ainda.</p>
			</section>
		);
	}
	const max = rows[0].turns;
	return (
		<section className="rounded-lg border p-4">
			<h3 className="mb-3 text-sm font-semibold">{title}</h3>
			<ol className="flex flex-col gap-2.5">
				{rows.slice(0, limit).map((row, i) => (
					<li key={label(row)} className="flex flex-col gap-1">
						<div className="flex items-baseline gap-2 text-sm">
							<span className="w-5 shrink-0 text-right tabular-nums text-muted-foreground">
								{i + 1}
							</span>
							<span className="min-w-0 flex-1 truncate">{label(row)}</span>
							{note?.(row) && (
								<span className="shrink-0 text-xs text-muted-foreground">{note(row)}</span>
							)}
							<span className="shrink-0 tabular-nums font-medium">{row.turns}</span>
						</div>
						<div className="pl-7">
							<Bar value={row.turns} max={max} />
						</div>
					</li>
				))}
			</ol>
		</section>
	);
}

export function AnalyticsView() {
	const { toolResult } = useMcpState<unknown, Analytics>();
	const data = toolResult;

	if (!data) {
		return <p className="p-4 text-sm text-muted-foreground">Sem dados.</p>;
	}

	const peakDay = [...data.byDay].sort((a, b) => b.turns - a.turns)[0];

	return (
		<div className="flex flex-col gap-4 p-4">
			<ViewHeader
				title="Uso"
				subtitle={`${data.from} a ${data.to}${data.truncated ? " · janela truncada" : ""}`}
			/>

			<div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
				<Stat label="perguntas" value={data.turns} />
				<Stat label="pessoas" value={data.people} />
				<Stat
					label="por pessoa"
					value={data.people ? (data.turns / data.people).toFixed(1) : "0"}
				/>
				<Stat label="pico no dia" value={peakDay?.turns ?? 0} hint={peakDay?.day} />
			</div>

			<div className="grid gap-3 lg:grid-cols-2">
				<Ranking
					title="Estados"
					rows={data.byState}
					label={(r) => `${UF_NAME[r.state] ?? r.state}`}
					note={(r) => `${r.people} ${r.people === 1 ? "pessoa" : "pessoas"}`}
				/>
				<Ranking
					title="Assuntos perguntados"
					rows={data.byTopic}
					label={(r) => TOPIC_LABEL[r.topic] ?? r.topic}
				/>
			</div>

			<div className="grid gap-3 lg:grid-cols-2">
				<Ranking title="Canais" rows={data.byChannel} label={(r) => r.channel} limit={4} />
				<Ranking
					title="Quem mais conversa"
					rows={data.topPeople}
					label={(r) => r.who}
					note={(r) => r.topics.map((t) => TOPIC_LABEL[t] ?? t).join(", ")}
					limit={10}
				/>
			</div>

			<p className="text-xs leading-relaxed text-muted-foreground">
				Não guardamos endereço IP nem o texto das perguntas — só a UF, o canal e o assunto
				classificado. As sessões aparecem como um hash não reversível, que serve para contar pessoas
				distintas e não para identificar ninguém. Turnos de WhatsApp não têm estado: a requisição
				chega do provedor, não de quem escreveu.
			</p>
		</div>
	);
}

function Stat({ label, value, hint }: { label: string; value: number | string; hint?: string }) {
	return (
		<div className="rounded-lg border p-3">
			<div className="text-xl font-bold tabular-nums leading-tight">{value}</div>
			<div className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div>
			{hint && <div className="text-[11px] text-muted-foreground">{hint}</div>}
		</div>
	);
}
