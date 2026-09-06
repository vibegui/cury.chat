// Os eixos do plano de governo que viram página própria.
//
// Cada um existe porque é uma busca real em ano eleitoral ("o que fulano
// propõe sobre educação"), e hoje o site não tem nada indexável para
// responder — `/chat` e `/s/` são noindex e o sitemap tem uma URL só.
//
// O texto das páginas NÃO é escrito à mão. `bun run topics` roda cada
// `query` contra o agente publicado e grava a resposta com as fontes em
// content/topics.json. Assim a página diz exatamente o que o agente diria, com
// a mesma ancoragem — e continua revisável por gente antes do commit.

export interface Topic {
	slug: string;
	/** Título da página e do card de compartilhamento. */
	title: string;
	/** Meta description e subtítulo. */
	blurb: string;
	/** O que é enviado ao agente para gerar o corpo da página. */
	query: string;
	/** Já preenchido no chat quando a pessoa clica em "conversar". */
	prompt: string;
}

export const TOPICS: Topic[] = [
	{
		slug: "educacao",
		title: "O que Augusto Cury propõe para a educação",
		blurb:
			"Escola de Pensadores, método SOFT e gestão da emoção na grade curricular — o que está no plano de governo protocolado no TSE.",
		query:
			"Qual a proposta de Augusto Cury para a educação? Detalhe os programas e como funcionariam.",
		prompt: "Me explica a proposta dele para a educação.",
	},
	{
		slug: "saude-mental",
		title: "O que Augusto Cury propõe para a saúde mental",
		blurb:
			"Programa Você é Insubstituível, rede TouchPeace e a reformulação do atendimento psicológico no SUS.",
		query:
			"O que Augusto Cury propõe sobre saúde mental e prevenção ao suicídio? Detalhe os programas.",
		prompt: "O que ele propõe sobre saúde mental?",
	},
	{
		slug: "semipresidencialismo",
		title: "O semipresidencialismo que Augusto Cury defende",
		blurb:
			"Como funcionaria a divisão entre Presidente e Primeiro-Ministro, e o que o plano diz sobre a reforma do STF.",
		query:
			"O que Augusto Cury propõe sobre semipresidencialismo e reformas institucionais? Como funcionaria na prática?",
		prompt: "Como funcionaria o semipresidencialismo que ele defende?",
	},
	{
		slug: "empreendedorismo",
		title: "O que Augusto Cury propõe para o empreendedorismo",
		blurb:
			"Ministério do Empreendedorismo, 10 mil Escolas e 10 mil Clubes de Empreendedorismo, e o apoio a microempresas.",
		query:
			"O que Augusto Cury propõe sobre empreendedorismo e economia? Detalhe os programas e números.",
		prompt: "O que ele propõe para quem empreende?",
	},
	{
		slug: "saude",
		title: "O que Augusto Cury propõe para a saúde",
		blurb:
			"Telemedicina no SUS, o programa PNAPE de acompanhamento pediátrico e as clínicas de prevenção.",
		query:
			"O que Augusto Cury propõe para a saúde e o SUS, incluindo telemedicina e o programa PNAPE?",
		prompt: "O que ele propõe para o SUS?",
	},
	{
		slug: "inteligencia-multifocal",
		title: "O que é a Teoria da Inteligência Multifocal",
		blurb:
			"A teoria autoral de Cury sobre construção do pensamento e gestão da emoção — e como ela virou proposta pública.",
		query:
			"O que é a Teoria da Inteligência Multifocal e como ela aparece nas propostas de governo dele?",
		prompt: "Me explica a Teoria da Inteligência Multifocal.",
	},
	{
		slug: "quem-e",
		title: "Quem é Augusto Cury",
		blurb:
			"Psiquiatra, escritor e candidato à Presidência pelo Avante em 2026 — trajetória, formação e como chegou à política.",
		query:
			"Quem é Augusto Cury? Trajetória, formação, carreira como escritor e como chegou à candidatura de 2026.",
		prompt: "Quem é o Augusto Cury?",
	},
	{
		slug: "neuroinclusao",
		title: "O que Augusto Cury propõe para a neuroinclusão",
		blurb: "O projeto Brasil Neuroinclusivo e o que o plano diz sobre pessoas neurodivergentes.",
		query:
			"O que o plano de governo de Augusto Cury propõe sobre neuroinclusão e pessoas neurodivergentes?",
		prompt: "O que ele propõe sobre neuroinclusão?",
	},
];

export function topicBySlug(slug: string): Topic | undefined {
	return TOPICS.find((t) => t.slug === slug);
}
