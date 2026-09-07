// Os eixos do plano de governo que viram página própria.
//
// Cada um existe porque é uma busca real em ano eleitoral ("o que fulano
// propõe sobre educação"), e hoje o site não tem nada indexável para
// responder — `/chat` e `/s/` são noindex e o sitemap tem uma URL só.
//
// O `body` é escrito à mão a partir de corpus/, não gerado pelo agente. A
// versão gerada abria com o preâmbulo de conversa ("Olá! Sou o Cury Chat,
// uma IA independente… Sobre a sua pergunta:"), fechava perguntando "quer que
// eu detalhe?" e, em /tema/neuroinclusao, resumia em três frases um capítulo
// inteiro do plano que o retrieval não trouxe. Página não é turno de chat.
//
// `scripts/generate-topics.ts` continua existindo e ainda grava
// content/topics.json, mas aquilo virou rascunho de comparação — serve para
// ver o que o agente responderia. A página serve o `body` daqui.
//
// Regras da redação, que valem para qualquer texto novo:
//   - abre no assunto, fecha em afirmação. Sem saudação, sem pergunta no fim;
//   - terceira pessoa: o texto é sobre Cury, nunca a voz dele (Res. TSE
//     23.610/2019);
//   - todo número rastreável ao corpus, com a origem dita quando não é o
//     plano;
//   - o contestado entra, como em /patrimonio. Página que só conta a metade
//     favorável é a que um jornalista derruba em dez minutos;
//   - nada de citação dos livros comerciais: não estão no acervo.
//
// `sources` é escolhida à mão — só o que sustenta o texto. A lista gerada
// vinha do retorno cru do AutoRAG e creditava a biografia da Wikipédia por
// uma proposta que está no plano. Os nomes têm que bater com os arquivos de
// corpus/; tests/topics.test.ts verifica.

export interface Topic {
	slug: string;
	/** Título da página e do card de compartilhamento. */
	title: string;
	/** Meta description e subtítulo. */
	blurb: string;
	/** Corpo da página. Markdown leve: parágrafos, listas, **negrito**. */
	body: string;
	/** Fontes que sustentam o corpo, pelo nome que têm em corpus/. */
	sources: string[];
	/** O que é enviado ao agente por `bun run topics`, para comparação. */
	query: string;
	/** Já preenchido no chat quando a pessoa clica em "conversar". */
	prompt: string;
}

const PLANO = "Plano de Governo - O Brasil dos Nossos Sonhos (TSE 2026)";
const TIM = "Teoria da Inteligência Multifocal (e-book oficial gratuito)";
const BIO = "Biografia e bibliografia (Wikipédia)";
const CAMPANHA = "Campanha presidencial de 2026 (Wikipédia)";
const BAND = "Perfil e propostas (Band, 27-08-2026)";
const CNN = "Quem é Augusto Cury, candidato do Avante (CNN Brasil)";
const TERRA = "Semipresidencialismo, gestão da emoção e telemedicina (Terra)";
const GAZETA = "Augusto Cury é de direita ou de esquerda (Gazeta do Povo)";

export const TOPICS: Topic[] = [
	{
		slug: "educacao",
		title: "O que Augusto Cury propõe para a educação",
		blurb:
			"Escola de Pensadores, método SOFT e gestão da emoção na grade curricular — o que está no plano de governo protocolado no TSE.",
		sources: [PLANO, BAND, TERRA, CNN, CAMPANHA, BIO],
		body: `**O eixo é a Escola de Pensadores.** O plano de governo protocolado no TSE apresenta o programa sob o nome de método SOFT — School of Thinkers —, formulado por Cury a partir da sua Teoria da Inteligência Multifocal. A proposta é rever a pedagogia expositiva: o professor deixa de ser o que o documento chama de "expositor cartesiano, emocionalmente frio" e passa a exercer três papéis, que se repetem em todo o plano como a fórmula do método:

- **provocador da arte de perguntar**, estimulando a curiosidade e a dúvida;
- **desafiador da arte de pensar**, trocando repetição por hipótese, debate e resolução de problema;
- **elogiador da arte de participar**, valorizando quem tenta, coopera e argumenta, não só quem acerta.

O plano descreve o professor de hoje como um "cozinheiro do conhecimento", que prepara diariamente um alimento precioso para uma plateia que perdeu o apetite pelo saber, e propõe dividir com os alunos a responsabilidade pela dinâmica da aula — o que, segundo o texto, reduziria também a sobrecarga emocional do docente.

**Gestão da emoção como disciplina.** A bandeira mais repetida da campanha é a inclusão obrigatória de gestão da emoção e inteligência multifocal na grade da educação básica. Entre as teses do plano está a implantação de "programas permanentes de gestão da emoção, prevenção da ansiedade, depressão, automutilação, bullying e violência escolar", com formação para professores, gestores, alunos e famílias. O Terra registrou esse ponto como o foco da proposta educacional entregue ao TSE.

**Tempo integral como clube de desenvolvimento humano.** A escola de tempo integral aparece no plano não como mais horas da mesma aula, mas como um espaço que o aluno queira frequentar: oratória e debates, teatro, música, esportes, eventos culturais e práticas de elogio mútuo. Ao lado das disciplinas tradicionais, o currículo receberia três pilares — Gestão da Emoção, Educação Financeira e Empreendedorismo.

**O ensino médio deixa de mirar só o vestibular.** O plano quer que a etapa vire formação técnica e projeto de vida, com ampliação do ensino técnico integrado e aproximação entre escolas, empresas, universidades e centros de inovação. A lista de conteúdos propostos inclui gestão da emoção, educação financeira, empreendedorismo, cooperativismo, inovação, inteligência artificial, tecnologia aplicada e desenvolvimento de projetos. A CNN Brasil registrou esse ponto entre as propostas centrais dele para educação.

**Professores e universidades.** Para os professores, o documento propõe formação continuada, melhoria das condições de trabalho e remuneração baseada também em qualificação — remuneração atrelada ao aperfeiçoamento, como resumiu o Terra. Para as universidades, propõe aproximar pesquisa e setor produtivo: incubadoras, laboratórios, startups, registro de patentes, transferência de tecnologia e ampliação das ações da CAPES e do CNPq.

**Os números que o plano usa.** O diagnóstico se apoia em três afirmações: a posição do Brasil no PISA, cerca de 8 milhões de jovens que não estudam nem trabalham e um "incremento de 148% de suicídios entre jovens de 10 a 19 anos". O documento não indica a fonte nem o período de referência desses dois últimos números.

**O que o plano não responde.** O capítulo de educação descreve programas, metas e método, mas não traz custo estimado, cronograma de implantação nem o instrumento legal que tornaria a nova disciplina obrigatória — outros capítulos do mesmo documento trazem estimativa de custo, este não. Vale registrar também a origem do método: o SOFT deriva da Teoria da Inteligência Multifocal, formulação autoral de Cury cuja validação científica é contestada por psiquiatras. Na sabatina da TV Globo, em 29 de agosto de 2026, ele disse que disponibilizaria gratuitamente às redes públicas os métodos de educação socioemocional ligados à sua própria produção.`,
		query:
			"Qual a proposta de Augusto Cury para a educação? Detalhe os programas e como funcionariam.",
		prompt: "Me explica a proposta dele para a educação.",
	},
	{
		slug: "saude-mental",
		title: "O que Augusto Cury propõe para a saúde mental",
		blurb:
			"Programa Você é Insubstituível, rede TouchPeace e a reformulação do atendimento psicológico no SUS.",
		sources: [PLANO, BAND, CAMPANHA, TERRA, BIO],
		body: `**Saúde mental é o centro do plano, não um capítulo dele.** O programa registrado no TSE organiza as propostas em dezoito projetos, e a gestão da emoção atravessa quase todos: entra na escola, no atendimento do SUS, na política para neurodivergentes e até no capítulo de empreendedorismo, onde é apresentada como preparo emocional para a perda de emprego. Cury é psiquiatra e construiu a carreira em torno do tema — é o eixo em que sua candidatura tem mais material próprio.

**Você é Insubstituível.** O carro-chefe é o programa de prevenção ao suicídio idealizado por ele, voltado à valorização da vida e à conscientização sobre depressão e sofrimento psíquico intenso. Segundo o plano, o programa foi referenciado pelo Conselho Regional de Medicina do Estado de São Paulo (Cremesp) por sua contribuição na prevenção de crises emocionais. A Band registrou que a proposta é expandi-lo nacionalmente em parceria com as redes de saúde e de educação.

**TouchPeace.** É a segunda peça: uma rede de escuta ativa gratuita, operada por voluntários treinados, para pessoas em risco de suicídio, conflitos familiares e transtornos emocionais. O plano afirma que a rede já opera em mais de 100 países, incluindo Estados Unidos e China, e a descreve como um modelo sem paralelo direto na literatura internacional. A proposta é levá-la ao Brasil como dispositivo público de acolhimento emergencial.

**O que muda no SUS.** O plano prevê um Programa Nacional de Saúde Mental envolvendo escolas, empresas, universidades, forças de segurança, unidades de saúde e comunidades. A plataforma da campanha detalha o desenho: reformular o atendimento psicológico e psiquiátrico da rede pública, descentralizar o apoio emocional, criar clínicas de prevenção à depressão e instituir programas de acolhimento de emergência para população vulnerável, trabalhadores sobrecarregados e pessoas neurodivergentes. A prevenção da ansiedade, da automutilação e do suicídio aparece como prioridade permanente, com identificação precoce de fatores de risco, capacitação de profissionais da educação e da saúde e fortalecimento das redes de apoio às famílias — com foco em crianças, adolescentes e jovens.

**Proteção infantil: o PNAPE.** O plano incorpora o Projeto de Lei 5815/2025, chamado de Lei Augusto Cury, que institui o Programa Nacional de Acompanhamento Anual Pediátrico/Médico e Emocional/Psicossocial da Infância e Adolescência. A ideia é que o Estado faça escutas ativas periódicas e acompanhamento anual de crianças e adolescentes, para identificar transtorno mental, negligência, violência e, em destaque no texto, abuso e exploração sexual. O documento chama isso de blindagem ativa contra predadores sexuais.

**Na escola.** A prevenção também entra pela educação: programas permanentes de gestão da emoção contra ansiedade, depressão, automutilação, bullying e violência escolar, com formação de professores, gestores, alunos e famílias. O plano é explícito quanto ao limite desse papel — a escola acolhe, identifica sinais e encaminha; não substitui médico, psicólogo ou outro profissional especializado.

**O que fica em aberto.** As propostas descrevem programas, não financiamento: o plano não estima custo nem prazo para a expansão nacional do Você é Insubstituível, do TouchPeace ou das clínicas de prevenção, e não detalha como se conectariam aos CAPS e à rede de atenção psicossocial que já existe. A base conceitual — a Teoria da Inteligência Multifocal — é formulação autoral de Cury, sem validação científica estabelecida segundo psiquiatras ouvidos pela Folha de S.Paulo em 2026.

**Se você está em sofrimento agora, ligue 188.** O CVV atende de graça, 24 horas por dia, por telefone, chat e e-mail. Esta página é sobre proposta de governo; ela não substitui atendimento.`,
		query:
			"O que Augusto Cury propõe sobre saúde mental e prevenção ao suicídio? Detalhe os programas.",
		prompt: "O que ele propõe sobre saúde mental?",
	},
	{
		slug: "semipresidencialismo",
		title: "O semipresidencialismo que Augusto Cury defende",
		blurb:
			"Como funcionaria a divisão entre Presidente e Primeiro-Ministro, e o que o plano diz sobre a reforma do STF.",
		sources: [PLANO, TERRA, CNN, BAND, BIO],
		body: `**A primeira das três reformas do plano.** O programa entregue ao TSE propõe trocar o presidencialismo pelo semipresidencialismo, e trata a mudança como medida de abertura de governo. O Presidente da República continuaria sendo a autoridade máxima do Estado, responsável pelas funções estratégicas definidas na Constituição e pela representação do país. Um Primeiro-Ministro, escolhido a partir da maioria parlamentar, assumiria a condução cotidiana da administração federal.

**O ponto central é como se troca de governo.** No desenho do plano, o Primeiro-Ministro precisa ser um gestor público altamente qualificado e depende da confiança da maioria parlamentar para continuar no cargo. Se perder as condições políticas ou administrativas de governar, é substituído pelos mecanismos constitucionais previstos — sem que o país atravesse uma crise institucional prolongada. É esse o argumento do documento: distribuir responsabilidade entre Presidência e Parlamento para que a queda de um governo não seja a queda do Estado.

**Tarcísio como premiê.** Em entrevistas desde a oficialização da candidatura, Cury disse que convidaria o governador de São Paulo, Tarcísio de Freitas, para o cargo. Também afirmou ter negociado com Romeu Zema uma chapa única para 2026, ideia que não avançou, e citou Ronaldo Caiado para um eventual Ministério da Segurança Pública.

**A segunda reforma: mandato de oito anos no STF.** O plano propõe o fim da vitaliciedade dos ministros do Supremo, com mandato fixo de oito anos, e muda os critérios de composição e ingresso:

- **Nove ministros**, e não onze: seis vindos da magistratura, dois do Ministério Público e um da advocacia.
- **Quem indica deixa de ser o presidente.** A escolha passa às respectivas classes — magistratura, Ministério Público e OAB.
- **Idade mínima de 50 anos**, e o indicado não pode ter sido filiado a partido político nos cinco anos anteriores à nomeação.
- **No mínimo três das nove vagas ocupadas por mulheres.**

O objetivo declarado é fortalecer a independência, a pluralidade e o equilíbrio institucional da Corte. Fora do plano, em entrevistas, Cury defendeu ainda o fim da reeleição e o voto distrital.

**A terceira reforma: o Itamaraty.** O ministro das Relações Exteriores passaria a se chamar Secretário de Estado, no modelo americano, com atribuição política e estratégica ampliada dentro do governo e a missão de transformar embaixadas em plataformas de comércio, investimento e abertura de mercados.

**O resto da agenda institucional.** O documento propõe reduzir a fragmentação partidária com cláusulas de desempenho mais rigorosas, ampliar a transparência dos partidos, digitalizar integralmente os serviços públicos e criar mecanismos digitais de participação — consultas públicas ampliadas e plataformas de transparência ativa. Na estrutura de governo, ele fala em fundir ou extinguir entre oito e dez ministérios, sem ter identificado quais.

**O que o plano não resolve.** Nenhuma dessas mudanças se faz por decreto: semipresidencialismo, mandato no STF e nova forma de indicação exigem emenda constitucional, com 308 votos na Câmara e 49 no Senado, em dois turnos cada — e o plano não descreve o caminho político para consegui-los, nem o que aconteceria com os ministros já empossados. A proposta de reduzir o Supremo de onze para nove cadeiras convive com a de reservar três a mulheres sem que o texto explique como a transição chegaria lá. Na sabatina da TV Globo, em 29 de agosto de 2026, ele foi cobrado sobre a viabilidade das medidas e respondeu que estudos posteriores orientariam as decisões.`,
		query:
			"O que Augusto Cury propõe sobre semipresidencialismo e reformas institucionais? Como funcionaria na prática?",
		prompt: "Como funcionaria o semipresidencialismo que ele defende?",
	},
	{
		slug: "empreendedorismo",
		title: "O que Augusto Cury propõe para o empreendedorismo",
		blurb:
			"Ministério do Empreendedorismo, 10 mil Escolas e 10 mil Clubes de Empreendedorismo, e o apoio a microempresas.",
		sources: [PLANO, BAND, TERRA, BIO, CNN],
		body: `**A tese é fragmentar a economia.** O capítulo do plano sobre empreendedorismo parte de um diagnóstico: inteligência artificial e robótica estão redesenhando o trabalho, as grandes empresas produzem mais com menos gente, e o efeito colateral é o que o documento chama de epidemia do desemprego estrutural. A resposta proposta não é conter a automação, e sim distribuir a base produtiva — milhões de unidades pequenas em vez de poucos grandes empregadores. "Fragmentar não é enfraquecer, é democratizar", diz o texto. Uma economia concentrada gera eficiência; uma economia distribuída, resiliência.

**Um ministério novo.** O plano prevê criar uma Secretaria Executiva ou Ministério do Empreendedorismo e da Economia Distribuída, com a meta de 10 milhões de microempresas. O SEBRAE seria elevado a centro estratégico de formação e acompanhamento. Parte dos lucros das empresas em que a União tem participação seria direcionada ao financiamento dessas políticas.

**As três peças operacionais.** O programa se sustenta em números redondos, repetidos nas entrevistas e no documento:

- **10 mil Clubes de Empreendedorismo** em escolas, universidades, igrejas e associações comunitárias, com mentoria de empresários locais e criação de negócios reais.
- **10 mil Escolas de Empreendedorismo**, com currículo de gestão financeira, estratégia, metas e execução — e gestão da emoção aplicada ao negócio.
- **Banco do Empreendedor**, com crédito de até R$ 20 mil a juros de 5% a 6% ao ano, orientação técnica e foco em início rápido. Na sabatina da TV Globo, Cury associou a proposta à divisão do BNDES em duas estruturas, uma para grandes empresas e outra para micro e pequenos negócios.

**O Bolsa Família na proposta.** O plano critica o desenho atual — diz que o programa "ama a pobreza, mas não ama os pobres" — e propõe que a família beneficiária não perca o benefício ao assinar carteira ou abrir microempresa por determinado tempo, sendo premiada com incentivos e juros menores. Vale o registro factual: a legislação atual já prevê a Regra de Proteção, que mantém parte do benefício para famílias cuja renda ultrapassa o limite de entrada, como observaram o Terra e a agência Lupa ao verificar declarações dele sobre o tema.

**O que ele propõe para a economia em volta disso.** Revisão do pacto federativo para destinar mais recursos aos municípios, redução de oito a dez ministérios, transição para a escala 5x2, manutenção dos incentivos da Zona Franca de Manaus, simplificação e digitalização da abertura de empresas, regularização fundiária para dar segurança jurídica e acesso a crédito a quem vive em imóvel sem documentação, e economia estimada entre R$ 150 bilhões e R$ 200 bilhões com a digitalização da máquina pública. Na sabatina, ele acrescentou auditoria da administração, revisão de cerca de 50 mil cargos comissionados e elevação da tributação sobre casas de apostas para a faixa de 40% a 50%.

**A emoção como política econômica.** O capítulo é onde o vocabulário clínico de Cury mais aparece na política: perder o trabalho, argumenta o texto, não é só perder renda, é perder identidade — na linguagem da Teoria da Inteligência Multifocal, o "Eu" deixa de ser autor e passa a ser vítima do script social. Daí a gestão da emoção entrar como conteúdo da Escola de Empreendedorismo, e não como acessório.

**O que foi questionado.** A Folha de S.Paulo observou que o plano propõe criar um Ministério do Empreendedorismo sem mencionar que existe, desde 2023, uma pasta federal com atribuição correspondente. Sobre o Bolsa Família, a Lupa classificou como carente de contexto a estimativa dele de que entre 10 e 15 milhões de beneficiários poderiam obter renda extra sem perder o auxílio, já que emprego formal ou registro como MEI não implicam corte automático. E o documento não estima o custo total do crédito de R$ 20 mil multiplicado pela meta de 10 milhões de microempresas, nem a fonte de funding do banco além da participação da União em estatais.`,
		query:
			"O que Augusto Cury propõe sobre empreendedorismo e economia? Detalhe os programas e números.",
		prompt: "O que ele propõe para quem empreende?",
	},
	{
		slug: "saude",
		title: "O que Augusto Cury propõe para a saúde",
		blurb:
			"Telemedicina no SUS, o programa PNAPE de acompanhamento pediátrico e as clínicas de prevenção.",
		sources: [PLANO, TERRA, BAND, BIO],
		body: `**A aposta é telemedicina em escala.** O projeto Tele Saúde Brasil quer transformar o país na maior plataforma pública de medicina digital do mundo, com a meta declarada de atender por telemedicina cerca de 80% das consultas básicas do SUS. O raciocínio do plano é de fila: resolvendo remotamente o que é simples, o atendimento presencial e as consultas com especialista — que hoje podem demorar mais de 50 dias — chegariam mais rápido a quem precisa de exame físico ou procedimento.

**Trinta minutos como meta.** O documento estabelece uma meta nacional de atendimento digital em até trinta minutos para os casos compatíveis com telemedicina, sustentada por uma plataforma nacional integrada que conecte médicos de todas as regiões numa única rede pública. Se houver profissional disponível em um estado, o atendimento poderia beneficiar imediatamente um paciente de qualquer outra região. Na sabatina da TV Globo, Cury disse que a plataforma deveria ser construída pelo próprio governo, e não operar como serviço privado, e que as normas do Conselho Federal de Medicina precisariam acompanhar as inovações tecnológicas.

**Quem teria prioridade.** O plano lista: crianças em situação de vulnerabilidade, idosos com dificuldade de locomoção, pessoas de baixa renda, gestantes, pessoas com deficiência e moradores de regiões remotas e comunidades rurais. Para quem não tem equipamento ou conexão, prevê uma rede de pontos públicos de acesso digital assistido em unidades básicas de saúde, escolas, centros comunitários e municípios pequenos.

**Inteligência artificial na triagem, não no diagnóstico.** Antes da consulta, sistemas fariam triagem clínica inicial — coleta de sintomas, classificação de risco, priorização dos casos graves e encaminhamento. O texto é explícito em dizer que a tecnologia não substitui o médico, e prevê avaliação permanente da qualidade dos atendimentos por indicadores clínicos e satisfação dos pacientes.

**O SUS fora da tela.** Além da telemedicina, o plano propõe fortalecer a atenção primária como eixo do sistema, com ampliação das equipes multiprofissionais e foco em prevenção para reduzir internações evitáveis, e modernizar a gestão com digitalização de prontuários, integração de sistemas e indicadores de desempenho.

**Saúde mental dentro do atendimento.** Enquanto aguardam consulta, os pacientes teriam acesso a conteúdo de educação emocional: orientações sobre ansiedade e estresse, exercícios de respiração, vídeos educativos e suporte psicológico inicial. Isso se soma ao Programa Nacional de Saúde Mental, às clínicas de prevenção à depressão e ao programa de prevenção ao suicídio Você é Insubstituível.

**PNAPE: acompanhamento anual de crianças e adolescentes.** O plano incorpora o Projeto de Lei 5815/2025, apelidado de Lei Augusto Cury, que cria o Programa Nacional de Acompanhamento Anual Pediátrico/Médico e Emocional/Psicossocial da Infância e Adolescência. A proposta é que o Estado faça escutas ativas periódicas e acompanhe anualmente o desenvolvimento físico e emocional de menores, articulando escolas, serviços de saúde e órgãos de proteção para identificar violência, negligência, exploração e, com destaque no texto, abuso sexual.

**Prevenção do câncer.** Há ainda um projeto dedicado — Sociedade Está Abraçando (SEA) —, voltado a rastreamento e detecção precoce, inspirado no modelo do Hospital de Amor, com comitês locais e um programa permanente de educação em saúde.

**O que ficou sem resposta.** O plano não estima o custo da plataforma nacional, o número de médicos necessário para sustentar a meta de trinta minutos, nem como a rede pública de telemedicina se articularia com a atenção básica municipal já existente. Um ponto de atenção foi levantado na sabatina: Cury é apresentado publicamente como "embaixador social" da Click Lifee, empresa privada de telessaúde. Ele negou conflito de interesses, disse não ter participação societária na companhia e afirmou que a atuação é voluntária e não remunerada.`,
		query:
			"O que Augusto Cury propõe para a saúde e o SUS, incluindo telemedicina e o programa PNAPE?",
		prompt: "O que ele propõe para o SUS?",
	},
	{
		slug: "inteligencia-multifocal",
		title: "O que é a Teoria da Inteligência Multifocal",
		blurb:
			"A teoria autoral de Cury sobre construção do pensamento e gestão da emoção — e como ela virou proposta pública.",
		sources: [TIM, BIO, PLANO, CAMPANHA, BAND],
		body: `**A ideia central é que o "Eu" não pilota sozinho.** A Teoria da Inteligência Multifocal (TIM) é a formulação que Cury desenvolveu desde o fim dos anos 1990 para descrever como a mente constrói pensamentos e emoções. No e-book que ele distribui de graça no próprio site, o Eu aparece como o piloto consciente — quem escolhe, traça caminhos e estabelece metas — convivendo com copilotos inconscientes que trabalham o tempo todo sem pedir licença.

**As peças do modelo.** O e-book descreve quatro:

- **Fenômeno RAM** (Registro Automático da Memória): registra involuntariamente tudo o que se vive, sente e pensa. O que foi registrado não pode ser deletado, apenas reeditado.
- **Gatilho da memória**: um estímulo físico, social ou psíquico abre áreas do córtex e produz as primeiras reações, antes de qualquer escolha consciente.
- **Janelas da memória**: as áreas de leitura disponíveis num dado momento. O e-book as classifica em neutras, *light* (prazer, serenidade, apoio) e *killer* (angustiantes, fóbicas, traumáticas).
- **Âncora e autofluxo**: conforme a carga emocional, a leitura fica restrita a certas regiões da memória, e o autofluxo é atraído justamente pelas janelas de maior carga — retroalimentando o que já dói.

**As ferramentas de gestão da emoção.** A parte prática da teoria é um conjunto de técnicas de autodiálogo. O **Pacto do Eu** é um acordo consigo mesmo para não consumir o lixo emocional dos outros. O **Silêncio Proativo** é calar por fora para se interrogar por dentro antes de reagir. A **Mesa Redonda do Eu** é o debate deliberado com as próprias falsas crenças, feito fora do momento de tensão. E o **DCD** — duvidar, criticar e determinar — é a técnica aplicada enquanto a janela está aberta e sendo registrada: duvidar do que aprisiona, criticar o pensamento que fere, determinar aonde se quer chegar. A ordem importa: o e-book diz que, sem duvidar e criticar antes, o DCD vira autoajuda sem sustentação.

**Como a teoria virou plano de governo.** A TIM é a espinha dorsal do programa registrado no TSE. Na educação, é dela que sai o método SOFT (School of Thinkers), com o professor como provocador da arte de perguntar, desafiador da arte de pensar e elogiador da arte de participar, e a proposta de disciplina de gestão da emoção na educação básica. Na saúde, embasa o Programa Nacional de Saúde Mental e o programa de prevenção ao suicídio Você é Insubstituível. Na economia, sustenta o argumento de que perder o trabalho é perder identidade — o "Eu" que deixa de ser autor e vira vítima do script social. Até a introdução do plano usa o DCD, ali apresentado como instrumento contra a polarização política.

**O que a comunidade científica contesta.** A TIM não tem reconhecimento estabelecido como teoria científica em psiquiatria ou psicologia clínica. Em abril de 2026, a Folha de S.Paulo consultou cinco psiquiatras — entre eles professores e pesquisadores ligados à USP e à UERJ — e todos disseram não conhecer validação científica que a sustente nem utilizá-la na prática clínica. Críticas anteriores apontavam a ausência de elementos típicos da produção científica convencional: publicação sistemática em periódicos com revisão por pares, descrição metodológica replicável, teste de hipóteses e diálogo com a literatura da área.

**A resposta dele.** Cury contestou as críticas. Afirmou que aspectos dos seus conceitos foram avaliados ou usados em contextos educacionais e acadêmicos, e que a teoria não deveria ser descartada apenas por ter se desenvolvido fora das correntes tradicionais da psiquiatria. Um segundo ponto entrou na mesma discussão: um trecho do livro Inteligência Multifocal mencionava resultados obtidos com pacientes autistas, e a expressão usada foi lida por críticos como alegação de eficácia clínica. Em 2026, questionado pela Folha, ele declarou que não pretendia dizer que o autismo pode ser curado, reconheceu que não existe cura para o transtorno e afirmou que se referia à evolução observada em determinados pacientes.

**Por que a distinção importa aqui.** As propostas de governo derivadas da TIM não deixam de existir porque a teoria é contestada — mas quem lê o plano precisa saber que a base conceitual é uma formulação autoral de grande circulação comercial, não um consenso científico.`,
		query:
			"O que é a Teoria da Inteligência Multifocal e como ela aparece nas propostas de governo dele?",
		prompt: "Me explica a Teoria da Inteligência Multifocal.",
	},
	{
		slug: "quem-e",
		title: "Quem é Augusto Cury",
		blurb:
			"Psiquiatra, escritor e candidato à Presidência pelo Avante em 2026 — trajetória, formação e como chegou à política.",
		sources: [BIO, CNN, CAMPANHA, BAND, GAZETA, PLANO],
		body: `**Médico psiquiatra, escritor e, desde 2026, candidato.** Augusto Jorge Cury nasceu em Colina, no interior de São Paulo, em 2 de outubro de 1958. Formou-se em Medicina em 1984 pela Faculdade de Medicina de São José do Rio Preto (Famerp), tem pós-graduação na PUC-SP e doutorado internacional em Psicologia pela Florida Christian University, obtido em 2013. Atuou em psiquiatria e psicoterapia; em entrevista ao Cremesp, em 2018, afirmou que já não exercia clínica regularmente havia cerca de uma década, dedicando-se a livros, palestras e projetos educacionais.

**A origem do trabalho.** Em entrevistas, relatou ter enfrentado um período de sofrimento psíquico durante a graduação, experiência que associou ao interesse pelo estudo das emoções e do pensamento. Acumulou milhares de páginas manuscritas e recusas de editoras antes de estrear, no fim dos anos 1990, com *Inteligência Multifocal*, livro em que sistematizou a teoria que leva esse nome — sua proposta própria sobre construção do pensamento, formação do eu, memória e gestão da emoção.

**O escritor.** É um dos autores brasileiros de maior circulação do século. Os números variam conforme a fonte e a data: a IstoÉ registrou 27 milhões de exemplares vendidos no Brasil em 2016; a Forbes, mais de 30 milhões e mais de 50 livros em 2017; em agosto de 2026, durante a campanha, ele afirmou ter ultrapassado 40 milhões de exemplares — cifra apresentada como declaração do autor, sem auditoria independente publicada. É publicado em cerca de 70 países. Entre os títulos mais conhecidos estão *O Vendedor de Sonhos*, adaptado ao cinema em 2016 com direção de Jayme Monjardim, *Ansiedade: Como Enfrentar o Mal do Século*, que ficou cerca de 180 semanas na lista da Veja, e *O Homem Mais Inteligente da História*. O mercado classifica boa parte da obra como autoajuda, rótulo que ele rejeita.

**O educador e empresário.** Idealizou a Escola da Inteligência, programa de educação socioemocional levado a escolas. Fora da educação, disse à Folha de S.Paulo em 2026 ter vendido uma editora nos anos 2000 e empresas educacionais depois, reinvestindo parte dos recursos no agronegócio; declarou à Justiça Eleitoral R$ 242 milhões em bens, incluindo 17 fazendas, imóveis urbanos, investimentos e participações societárias.

**A entrada na política.** A candidatura pela Presidência em 2026, pelo Avante, é sua estreia eleitoral. A pré-candidatura foi confirmada em abril; a convenção nacional do partido oficializou o nome em 3 de agosto, na Assembleia Legislativa de São Paulo, e o Agir declarou apoio dois dias depois. O ex-deputado federal Júlio Delgado é o candidato a vice. O plano de governo, *O Brasil dos Nossos Sonhos*, tem cerca de 200 páginas e organiza as propostas em dezoito projetos, com saúde mental e educação emocional no centro.

**Como ele se posiciona.** Rejeita os rótulos de direita e esquerda e repete a fórmula "mente capitalista, mas um coração social" — mente capitalista no sentido de meritocracia, Estado enxuto, responsabilidade fiscal e empreendedorismo; coração social no de escutar a dor humana. A campanha o apresenta como "agente da despolarização", e ele tem evitado ataques pessoais aos adversários. Em agosto de 2026 foi o primeiro candidato de terceira via a ultrapassar 10% nas intenções de voto, com forte crescimento nas redes: ganhou 19,4% de seguidores no Instagram após o primeiro debate, e as buscas pelo nome dele no Google subiram cerca de 900% na semana seguinte.

**O que é contestado.** A Teoria da Inteligência Multifocal, base de toda a obra e do plano, não tem validação científica estabelecida: em abril de 2026, cinco psiquiatras ouvidos pela Folha de S.Paulo disseram não conhecer respaldo científico para ela nem usá-la clinicamente, e ele respondeu que aspectos do seu trabalho têm avaliação em contextos acadêmicos e educacionais. A instituição do doutorado, a Florida Christian University, foi objeto de reportagem da Folha em 2020 apontando ausência de acreditação relevante no sistema americano. Na sabatina da TV Globo, em 29 de agosto de 2026, colunistas de O Globo deram a ele a nota mínima entre os presidenciáveis, e propostas apresentadas ali — como drones com sirene no combate à violência doméstica — viraram alvo de memes.`,
		query:
			"Quem é Augusto Cury? Trajetória, formação, carreira como escritor e como chegou à candidatura de 2026.",
		prompt: "Quem é o Augusto Cury?",
	},
	{
		slug: "neuroinclusao",
		title: "O que Augusto Cury propõe para a neuroinclusão",
		blurb: "O projeto Brasil Neuroinclusivo e o que o plano diz sobre pessoas neurodivergentes.",
		sources: [PLANO, CAMPANHA],
		body: `**É o segundo dos dezoito projetos do plano.** Brasil Neuroinclusivo vem logo depois do capítulo de educação e propõe uma política permanente de Estado para crianças, adolescentes e adultos neurodivergentes — com destaque para autismo, TDAH, dislexia, transtornos de aprendizagem e altas habilidades. A frase que resume a virada pretendida está no próprio documento: o Brasil deve deixar de perguntar apenas "qual é a dificuldade deste aluno?" e passar a perguntar quais são suas habilidades e como sua mente aprende.

**Os números que o plano usa.** O Censo 2022 identificou 2,4 milhões de brasileiros diagnosticados com autismo, 1,2% da população, segundo a Agência IBGE. Para dislexia, o plano cita estimativa superior a 7,8 milhões de pessoas, e menciona prevalências expressivas de TDAH apontadas pelo Ministério da Saúde. O próprio texto reconhece o limite desses dados: não existe censo consolidado de neurodivergentes, e as condições podem coexistir.

**Mapa Nacional da Neurodiversidade.** Daí a primeira ação proposta — um levantamento nacional, em parceria entre Governo Federal, IBGE, MEC e Ministério da Saúde, cobrindo TEA, TDAH, dislexia e outros transtornos de aprendizagem, altas habilidades, evasão e desempenho escolar, bullying, acesso ao atendimento educacional especializado e necessidade de profissionais de apoio. O plano diz que os dados seriam anonimizados, respeitariam a LGPD e serviriam para planejamento, nunca para discriminar estudante.

**Metodologia Psicoativa na sala de aula.** O coração pedagógico do projeto é o mesmo método SOFT da proposta de educação, aplicado à diferença: provocar a arte de perguntar, desafiar a arte de pensar e elogiar a arte de participar. O argumento é direto — um aluno com dificuldade numa área pode revelar habilidade extraordinária em outra, e elogiar participação, e não só acerto, combate a cultura da comparação.

**Sala e escola.** Cada escola teria um Plano de Inclusão e Desenvolvimento, com adaptações pedagógicas conforme a necessidade funcional do estudante: formas diferentes de apresentar conteúdo, períodos adequados de concentração, recursos visuais e tecnológicos, atividades colaborativas e maneiras diferentes de demonstrar aprendizagem. A escola regular continua sendo o espaço central de convivência, e o Atendimento Educacional Especializado permanece complementar. O plano se ancora na legislação existente: a Lei 12.764 já assegura acompanhante especializado à pessoa com TEA em classe comum quando há necessidade comprovada, e a Lei 14.254/2021 determina acompanhamento integral a alunos com dislexia, TDAH e outros transtornos de aprendizagem. A proposta se apresenta como implementação nacional desses princípios, articulada à Política Nacional de Educação Especial Inclusiva.

**Professor neuroinclusivo.** O plano prevê um Programa Nacional de Formação em Neurodiversidade e Gestão da Emoção, presencial e digital, para professores, coordenadores e gestores. O conteúdo inclui identificação de sinais que mereçam avaliação profissional — o texto é explícito em não transformar professor em diagnosticador —, estratégias para TEA, TDAH e transtornos de aprendizagem, manejo da diversidade em sala, comunicação com famílias, prevenção do bullying e ferramentas de gestão da emoção.

**Rede integrada e saúde mental.** Cada município organizaria uma Rede Neuroinclusiva conectando escola, família, atenção básica, assistência social e serviços especializados, com o objetivo declarado de reduzir a peregrinação das famílias entre instituições. Toda escola participante manteria ações permanentes de prevenção de ansiedade excessiva, bullying, isolamento social e autoagressão. O limite do papel escolar está escrito: a escola acolhe, identifica sinais e encaminha; não substitui médico, psicólogo ou outro profissional especializado.

**Como o resultado seria medido.** A meta é alcançar progressivamente todas as redes públicas de educação básica, com protocolos de inclusão por escola e indicadores de redução de evasão, bullying e exclusão. O plano propõe avaliar não só quantos alunos passaram de ano, mas quantos passaram a participar e quantos deixaram de sofrer em silêncio.

**O que não está no documento.** O projeto não traz custo estimado, cronograma nem número de profissionais de apoio a contratar, e não detalha como o Mapa Nacional se relacionaria com o Censo Escolar já existente. A defesa dos neurodivergentes também aparece fora da educação: a plataforma da campanha cita programas de acolhimento psicológico de emergência para trabalhadores sobrecarregados e para "os milhões de neurodivergentes do país", dentro da reformulação proposta para o atendimento em saúde mental no SUS.`,
		query:
			"O que o plano de governo de Augusto Cury propõe sobre neuroinclusão e pessoas neurodivergentes?",
		prompt: "O que ele propõe sobre neuroinclusão?",
	},
];

export function topicBySlug(slug: string): Topic | undefined {
	return TOPICS.find((t) => t.slug === slug);
}
