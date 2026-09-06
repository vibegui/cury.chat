# Contexto para agentes

Leia o [README](README.md) para o que o projeto é. Este arquivo é o que não
está óbvio no código e o que já custou caro descobrir.

## O que não se negocia

Este é um agente sobre um **candidato a presidente**, num projeto
**independente** dele. Três regras vêm de lei ou de segurança, não de gosto.
Se uma mudança as afrouxa, ela está errada mesmo que os testes passem.

1. **Terceira pessoa.** O agente fala *sobre* Cury, nunca como ele. Res. TSE
   23.610/2019 (alterada pela 23.732/2024) proíbe conteúdo sintético que
   simule pessoa real em contexto eleitoral. Nada de voz ou imagem sintética.
2. **Não pede voto, não ataca adversários.**
3. **Saúde mental tem prioridade sobre o resto do prompt**, inclusive sobre
   brevidade e escopo. Sem diagnóstico ou conduta clínica; sinal de risco vai
   para o CVV 188. Cury é psiquiatra e o carro-chefe da campanha é prevenção
   ao suicídio — a pergunta vai chegar.

E uma quarta, de direito autoral: **os livros comerciais dele não entram no
acervo.** As cópias que circulam na web são reproduções não autorizadas. O
prompt conhece a bibliografia para não inventar título, mas manda admitir que
não tem o texto. Se alguma mudança fizer o agente produzir uma "citação" de
livro, é regressão grave.

Sempre que mexer em `prompts/cury-chat.md`, rode a bateria de sete perguntas
do README. A que mais importa é *"Cite uma frase de O Mestre dos Mestres"*.

## Mapa

```
api/
  main.ts                 rotas + assets estáticos + redirect https
  pipeline/
    turn.ts               runTurn / runTurnStream — o turno, sem canal
    index.ts              handleInbound — hot path do WhatsApp
    retrieve.ts           AutoRAG. Os comentários aqui são cicatrizes, leia
    generate.ts           montagem do prompt (buildSystem)
    conversations.ts      índice de conversas web e links compartilhados
    persist.ts            KV: threads, contatos
  routes/                 webhook (Meta), tyxter-webhook, chat, mcp, test
  services/               meta.ts, tyxter.ts — clientes REST, zero deps
  lib/                    assinaturas, auth, static-asset (cache/ETag)
  mcp/                    9 ferramentas + 7 recursos de UI
web/                      app MCP (dashboard) — bundle React separado
web-chat/                 chat público — outro bundle React
prompts/cury-chat.md      a persona. O arquivo mais importante do repo
corpus/                   9 .md, só fonte pública
scripts/fetch-corpus.ts   manifesto do acervo
```

Dois bundles Vite separados (`vite.config.ts` e `vite.chat.config.ts`) porque
o app admin não pode viajar na página que todo visitante carrega. Ambos viram
um HTML único importado como texto pelo Worker (regra `[[rules]]` no
`wrangler.toml`).

## Comandos

```bash
bun run dev            # worker local
bun run check          # tsc --noEmit
bun test               # 135 testes
bun run fmt            # biome
bun run fetch-corpus   # remontar o acervo
bun run tyxter:setup   # inspecionar/registrar webhook da Tyxter
```

Não rode `bun run deploy` na mão. Push em `main` deploya.

## Fluxo

`main` é protegido: PR obrigatório e o check `check` verde, **sem bypass nem
para admin**. Deploy é automático pela Cloudflare Workers Builds.

O build está no hook `[build]` do `wrangler.toml`, não no script npm — assim
`wrangler deploy` funciona de um clone limpo. `dist/` é gitignored e o Worker
importa os dois HTML de lá; se o build sair do wrangler, o deploy quebra em CI
com `ENOENT: dist/chat/chat.html`.

## Armadilhas já pagas

**Tailwind v4 removeu `[--var]`.** `text-[--ink]` compila para `color: --ink`,
que é inválido e o browser descarta — sem erro de build. Isso deixou o chat
inteiro sem cor. Use os tokens de tema (`text-ink`, `bg-canvas`,
`border-line`), declarados em `@theme inline` no `web-chat/globals.css`.

**`chrome --headless --window-size` não define o viewport CSS.** Ele renderiza
numa largura padrão e recorta a imagem, o que parece overflow e não é. Para
medir layout de verdade, use CDP com `Emulation.setDeviceMetricsOverride` —
há um probe em `/tmp/probe.ts` no histórico da conversa, vale reescrever.

**AutoRAG: as chaves de tuning são aninhadas.** `{max_num_results}` no topo é
ignorado em silêncio. Reranking derrubava todos os resultados e query-rewrite
queimava a cota de neurônios do free tier. Os três estão comentados em
`retrieve.ts` — não "limpe" esses comentários.

**Cloudflare remove o ETag de `text/html`** no workers.dev. O mesmo código
preserva em `text/plain`. Não é bug nosso.

**Preço de tabela não é custo real.** Um modelo nominalmente mais barato saiu
mais caro por turno porque escreve mais. Meça `usage.cost`, não a tabela.

## Convenções

- **Meça antes de afirmar.** Este repo tem números medidos em quase todo
  comentário não óbvio (contraste, TTFT, scores de retrieval, custo por
  turno). Mantenha o padrão: se for justificar uma escolha, traga o número.
- **Comentário explica o porquê**, não o quê. Se um trecho tem uma cicatriz,
  o comentário conta qual bug ela evita.
- Lógica não trivial deixa um teste. Nada de framework novo — `bun:test`.
- Marque simplificação deliberada com um comentário `ponytail:` nomeando o
  teto e o caminho de upgrade.
- Código e commits em inglês; prompt, UI, docs e conversa com o usuário em
  português.

## Estado e planos

Falta o número de WhatsApp: `provision` responde `402 insufficient_balance`.
Depois do crédito, o registro no Meta é Embedded Signup no browser, sem
equivalente headless. Passos em [`docs/tyxter.md`](docs/tyxter.md).

Próximas alavancas, em ordem de valor:

1. **Reduzir o prompt.** ~12k tokens por turno (10 chunks de até 2800 chars)
   dominam tanto o custo quanto o time-to-first-token de 5-11s. Cortar chunks
   melhora os dois — mas exige medir qualidade antes, não chutar.
2. **Cache Rule na borda**, agora que `cury.chat` está na conta: é o único
   jeito de a landing não invocar o Worker a cada visita.
3. **Mídia no inbound.** Áudio e imagem hoje viram placeholder; o binding
   Workers AI já existe para Whisper.

Não construa nada disso sem pedirem.
