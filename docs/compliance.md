# Compliance — cury.chat

Este é o documento que se apresenta se a campanha, uma editora, um veículo de
imprensa ou a Justiça Eleitoral perguntar o que é este projeto e de onde vem o
que ele diz. Mantenha-o atualizado quando o acervo ou o prompt mudarem.

## O que é o projeto

`cury.chat` é um **projeto independente**. Não tem vínculo com Augusto Cury,
com a campanha presidencial de 2026, com o partido Avante ou com as editoras
que publicam os livros dele.

É um agente de IA que conversa por WhatsApp sobre as **propostas e ideias
públicas** do candidato, recuperando trechos de um acervo de materiais
públicos (RAG) e gerando a resposta com um modelo de linguagem.

## Decisões de design tomadas por causa da lei

### Res. TSE 23.610/2019 (alterada pela 23.732/2024, ampliada pela 23.755/2026)

A norma exige identificação clara de conteúdo eleitoral gerado ou alterado por
IA e **proíbe** criar, substituir ou alterar imagem ou voz de pessoa real para
favorecer ou prejudicar candidatura.

O que fazemos por causa disso:

| Exigência | Como cumprimos | Onde está no código |
|---|---|---|
| Não simular a pessoa real | O agente fala **sobre** Cury, sempre em terceira pessoa. Nunca escreve como se fosse ele. | `prompts/cury-chat.md`, bloco `<identidade>` |
| Sem voz ou imagem sintética | O bot só responde texto. Não gera áudio, vídeo ou imagem. | `api/pipeline/send.ts` — só `sendText` |
| Identificar o uso de IA | Rótulo na primeira resposta de cada conversa, no aviso da landing e no `llms.txt`. | `prompts/cury-chat.md`; `landing/index.html`; `landing/llms.txt` |
| Não fazer propaganda | O agente não pede voto, não convoca e não ataca adversários. | `prompts/cury-chat.md`, "Regras eleitorais" |

### Política da Meta para WhatsApp Business API

A Meta veta o uso da Cloud API por políticos, partidos, candidatos e campanhas
políticas. Este projeto **não é** nenhum deles, mas trata de um candidato — o
que é suficiente para atrair revisão.

Postura: registrar o WABA como projeto editorial independente (nome do negócio
sem referência a campanha ou partido, sem uso de logo do Avante, descrição
declarando a natureza independente e informativa). Se o número for reprovado
ou suspenso, o plano B é expor o pipeline por HTTP e embutir um chat na
landing — o `handleInbound` de `api/pipeline/index.ts` já é agnóstico de canal;
o que muda é o `send.ts`.

### Direito autoral

Os livros de Augusto Cury são obras comerciais protegidas (Planeta, Sextante,
Benvirá e outras). Cópias completas circulam em sites como elivros.info,
dlivros.com, 99ebooks, zlibrary, Scribd, Academia.edu e dokumen.pub — são
reproduções não autorizadas.

**Nenhuma delas entra no acervo.** Consequência aceita: o agente não consegue
citar literalmente os livros. O prompt trata isso de frente — ele conhece a
bibliografia (para não inventar títulos) mas é instruído a dizer que não tem o
texto quando pedirem uma citação, em vez de fabricar uma frase e atribuí-la ao
autor.

Se houver autorização do autor ou das editoras no futuro, basta acrescentar as
obras a `scripts/fetch-corpus.ts` e registrar a autorização aqui.

## Acervo — fonte por fonte

Definido em `scripts/fetch-corpus.ts`. Cada arquivo em `corpus/` carrega um
cabeçalho com URL, data de acesso e base de uso.

| # | Fonte | Base de uso |
|---|---|---|
| 01 | Plano de governo "O Brasil dos Nossos Sonhos" | Documento público, protocolado no TSE em 13/08/2026. Baixado do espelho do Poder360 porque o DivulgaCandContas responde 403 a download automatizado. |
| 02 | E-book "Teoria da Inteligência Multifocal" | Distribuído gratuitamente pelo próprio autor em augustocury.com.br. |
| 03–04 | Verbetes da Wikipédia (biografia; campanha 2026) | CC BY-SA 4.0, com atribuição no cabeçalho do arquivo e na landing. |
| 05–09 | Matérias jornalísticas (Band, CNN, JOTA, Terra, Gazeta do Povo) | Uso informativo, com atribuição e link para o original. |
| 10–11 | Transcrições de falas e entrevistas públicas | Legendas automáticas de vídeos públicos, transcritas para estudo, com atribuição e link. |

## Onde aparecem os avisos

1. **Landing** (`landing/index.html`) — bloco de aviso logo abaixo do botão
   principal, seção "De onde vêm as respostas", FAQ e rodapé.
2. **Primeira mensagem de cada conversa** — o prompt manda o agente se
   identificar como IA independente.
3. **Quando perguntado** — "você é o Cury?", "isso é a campanha?" têm resposta
   explícita no prompt e um exemplo calibrado.
4. **`landing/llms.txt`** — para que outros sistemas de IA que citarem este
   site não o descrevam como oficial.

## Saúde mental

Cury é psiquiatra e o carro-chefe da campanha é prevenção ao suicídio, então
usuários em sofrimento vão procurar o bot. O prompt tem uma regra de
prioridade máxima: nada de diagnóstico, prescrição ou conduta clínica; diante
de sinal de risco, acolher e encaminhar ao **CVV 188** (gratuito, 24h),
ao CAPS e, em emergência, ao **SAMU 192**. A landing repete os mesmos números.

Ao mexer no prompt, **esta regra não se negocia** — teste-a sempre antes de
publicar (`docs/deploy.md`, seção de verificação).
