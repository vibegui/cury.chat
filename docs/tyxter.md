# Tyxter — transporte de WhatsApp

Tyxter intermedia a WhatsApp Business Platform do Meta: a WABA é deles, a gente
fala REST com `api.tyxter.com`. Alternativa ao caminho direto (`api/services/meta.ts`),
que continua no repo como plano B.

Doc oficial: <https://tyxter.com/docs> · OpenAPI: <https://tyxter.com/docs/openapi.json>

## Como o ambiente é escolhido

Pelo **prefixo da chave**, não pela URL. `tx_sandbox_…` cai no sandbox,
`tx_live_…` em produção, os dois em `https://api.tyxter.com`. Chave apontada
para o ambiente errado responde `401`.

## Escopos

A chave é escopada. Sem o escopo a chamada volta `403 insufficient_scope` com o
nome exato do que falta.

| Escopo | Para quê |
|---|---|
| `messages:write` | Enviar as respostas do bot |
| `webhooks:write` | Registrar o endpoint de entrada (`bun run tyxter:setup`) |
| `sandbox:write` | Simular inbound e abrir a janela de 24h em teste |
| `messages:read` | Ler o payload cru de uma mensagem (`unknown`, `context` de template) |
| `phone_numbers:write` | Provisionar número — só produção |
| `templates:write` | Criar template — só se for falar fora da janela de 24h |

Para sondar o que uma chave tem sem criar nada, mande `POST` com corpo `{}`:
`403` = falta escopo, `400` = escopo existe e só a validação falhou.

## Peças no código

| Arquivo | Papel |
|---|---|
| `api/services/tyxter.ts` | Cliente REST. `sendText`, `sendTemplate`, `markRead`, números, endpoints de webhook |
| `api/lib/tyxter-signature.ts` | HMAC-SHA256 sobre `${timestamp}.${rawBody}`, tolerância de 5 min |
| `api/pipeline/normalize-tyxter.ts` | `message.received` → `NormalizedMessage` |
| `api/routes/tyxter-webhook.ts` | `POST /tyxter/webhook` |
| `scripts/tyxter-setup.ts` | `bun run tyxter:setup` |

`handleInbound` não conhece nenhum provedor: recebe uma mensagem já normalizada
e um `Transport` (`sendText` + `markRead`). Meta e Tyxter são dois chamadores
concretos da mesma função — sem factory, sem flag de configuração.

## Configuração

Vars em `wrangler.toml`:

```toml
TYXTER_API_BASE_URL = "https://api.tyxter.com"
TYXTER_PHONE_NUMBER_ID = "cmtpq24z5005g01pqssaix42d"
```

Secrets:

```bash
bunx wrangler secret put TYXTER_API_KEY
bunx wrangler secret put TYXTER_WEBHOOK_SIGNING_SECRET
```

`GET /` mostra `transports.tyxter: true` quando os dois estão presentes.

## Registrar o webhook

```bash
export TYXTER_API_KEY=...
bun run tyxter:setup                                             # inspeciona
bun run tyxter:setup https://cury-mcp.<sub>.workers.dev          # registra
bun run tyxter:setup https://cury-mcp.<sub>.workers.dev --test   # registra e sonda
```

O `signing_secret` **aparece uma única vez**, na resposta do `POST
/v1/webhook-endpoints`. Perdeu, só rotacionando
(`POST /v1/webhook-endpoints/{id}/rotate-signing-secret`).

O segredo é **por endpoint**, não por URL: a mesma URL registrada em dois
projetos ou ambientes recebe segredos diferentes.

## O que a Tyxter cobra do receptor

Vem da doc de webhooks e está tudo respeitado em `api/routes/tyxter-webhook.ts`:

- **2xx direto.** Tyxter não segue redirect; qualquer 3xx é tentativa falha.
- **10 segundos** por tentativa, cobrindo DNS, request e leitura do corpo da
  resposta. Por isso: ack primeiro, trabalho em `waitUntil`.
- **At-least-once, sem ordem garantida.** Dedupe pelo id do envelope
  (`tyxter-webhook-id`), não pelo id da mensagem — um resend do mesmo evento
  repete o envelope, e é justamente ele que não pode processar duas vezes.
- **Escada de retry fixa**: até 8 tentativas, a última ~32,7h depois da primeira.
- **20 falhas seguidas** desabilitam o endpoint (`disabled_reason:
  unhealthy_consecutive_failures`). Reabrir é `PATCH /v1/webhook-endpoints/{id}`
  com `status: "active"`.
- **Verificar sobre o corpo cru**, nunca sobre JSON reserializado.

## Janela de 24 horas

Texto livre só vale dentro da janela aberta por uma mensagem do cliente. Fora
dela a API responde `400 service_window_required` e exige template aprovado.

O bot é reativo — só responde quem falou com ele — então está sempre dentro da
janela. Por isso **nenhum template foi criado**. `sendTemplate` existe em
`api/services/tyxter.ts` para o dia em que houver disparo ativo, o que muda o
projeto de "responde quem procura" para "procura quem não pediu" — decisão de
produto, e com implicações eleitorais bem diferentes.

## Do número de sandbox ao número que toca no seu celular

O número `+5517902191929` (`id=cmtpq24z5005g01pqssaix42d`) está com
`environment: sandbox`, `meta_phone_number_id: null`, `waba_id: null`. Sandbox
**nunca alcança telefone real** — é simulação determinística.

Para um número que responde no WhatsApp de verdade:

1. Chave `tx_live_`.
2. **KYC**: declaração de veracidade no dashboard, Settings → Business identity.
   Auto-aprovada, sem dado bancário. Sem isso: `403 kyc_required`.
3. **Créditos BRL** na conta, senão `402`.
4. `POST /v1/phone-numbers/provision {"ddd":"11"}` — aluga da Salvy, ainda só no
   nível de operadora.
5. **Browser, obrigatório**: <https://tyxter.com/connect-whatsapp> → Embedded
   Signup do Meta. *"has no headless API equivalent."* Chamar `connect` antes
   disso responde `409 meta_registration_required`.
6. `GET /v1/phone-numbers/{id}` passa a devolver `meta_phone_number_id` e
   `waba_id`. Aí atualize `TYXTER_PHONE_NUMBER_ID` e registre o webhook de novo
   com a chave de produção — endpoints são por projeto **e** por ambiente.

Passos 1, 2, 3 e 5 são de pessoa, não de API.

## Isso não muda a exposição à política do Meta

A conta continua sendo uma WABA do Meta. A restrição a partidos, candidatos e
campanhas descrita em [`compliance.md`](compliance.md) vale no mesmo lugar —
Tyxter é o intermediário, não uma isenção.
