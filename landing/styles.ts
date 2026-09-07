// Folha de estilo compartilhada pela landing e pelas páginas de tópico.
//
// É um módulo TS, e não um .css, de propósito: o esbuild tem tratamento nativo
// de `.css` e ignora a regra `[[rules]] type = "Text"` do wrangler, de modo que
// o import chega como undefined em vez de string — e o Worker morre no start
// com "Cannot read properties of undefined". Um módulo exportando template
// string não tem essa ambiguidade.

export const STYLES = String.raw`/* Compartilhado pela landing e pelas páginas de tópico servidas pelo Worker.
   Tokens iguais aos do chat (web-chat/globals.css). */

:root {
    color-scheme: light;
    --canvas: oklch(0.985 0.003 250);
    --surface: oklch(1 0 0);
    --line: oklch(0.90 0.006 250);
    --ink: oklch(0.22 0.015 250);
    --ink-soft: oklch(0.45 0.012 250);
    --faint: oklch(0.55 0.010 250);
    --accent: oklch(0.36 0.075 250);
    --accent-ink: oklch(1 0 0);
    --accent-soft: oklch(0.95 0.020 250);
    --warn-bg: oklch(0.97 0.032 92);
    --warn-line: oklch(0.87 0.070 92);
    --ease: cubic-bezier(0.25, 1, 0.5, 1);
  }
  @media (prefers-color-scheme: dark) {
    :root {
      color-scheme: dark;
      --canvas: oklch(0.19 0.012 250);
      --surface: oklch(0.235 0.014 250);
      --line: oklch(0.33 0.016 250);
      --ink: oklch(0.96 0.004 250);
      --ink-soft: oklch(0.79 0.010 250);
      --faint: oklch(0.66 0.012 250);
      --accent: oklch(0.74 0.105 250);
      --accent-ink: oklch(0.18 0.030 250);
      --accent-soft: oklch(0.28 0.032 250);
      --warn-bg: oklch(0.27 0.045 92);
      --warn-line: oklch(0.42 0.070 92);
    }
  }

  * { box-sizing: border-box; margin: 0; padding: 0; }
  html { scroll-behavior: smooth; }
  body {
    font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    font-size: 17px; line-height: 1.65;
    color: var(--ink); background: var(--canvas);
    -webkit-font-smoothing: antialiased;
  }
  a { color: var(--accent); }
  :where(a, button):focus-visible { outline: 2px solid var(--accent); outline-offset: 3px; border-radius: 6px; }

  .wrap { max-width: 720px; margin: 0 auto; padding: 0 22px; }
  section { padding: 68px 0; }
  section + section { border-top: 1px solid var(--line); }

  header { padding: 22px 0; }
  .brand { display: flex; align-items: center; gap: 10px; font-weight: 800; letter-spacing: -0.3px; }
  .brand img { width: 30px; height: 30px; border-radius: 8px; }
  .brand span { color: var(--faint); font-weight: 600; font-size: 14px; letter-spacing: 0; }

  h1 {
    font-size: clamp(34px, 6.2vw, 54px); line-height: 1.06;
    letter-spacing: -1.5px; font-weight: 800; text-wrap: balance;
    margin-bottom: 20px;
  }
  h1 em { font-style: normal; color: var(--accent); }
  .lede { font-size: clamp(18px, 2.3vw, 20px); color: var(--ink-soft); max-width: 58ch; text-wrap: pretty; }

  h2 { font-size: 25px; font-weight: 750; letter-spacing: -0.5px; margin-bottom: 22px; text-wrap: balance; }
  h3 { font-size: 17px; font-weight: 700; margin-bottom: 4px; }

  .cta-row { display: flex; flex-wrap: wrap; gap: 12px; align-items: center; margin-top: 34px; }
  .cta {
    display: inline-flex; align-items: center; gap: 9px;
    background: var(--accent); color: var(--accent-ink); text-decoration: none;
    font-weight: 700; font-size: 17px; padding: 15px 28px; border-radius: 999px;
    transition: transform 150ms var(--ease);
  }
  .cta:hover { transform: translateY(-1px); }
  .cta-secondary {
    background: transparent; color: var(--accent);
    border: 1px solid var(--line);
  }
  .cta-secondary:hover { background: var(--accent-soft); }
  .cta-soon {
    display: inline-flex; align-items: center; gap: 9px;
    background: transparent; color: var(--faint);
    border: 1px dashed var(--line);
    font-weight: 650; font-size: 17px; padding: 15px 24px; border-radius: 999px;
    cursor: not-allowed;
  }
  .cta-soon b {
    font-size: 11px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.07em;
    border: 1px solid var(--line); border-radius: 999px; padding: 2px 8px; color: var(--faint);
  }
  .cta-note { display: block; margin-top: 13px; font-size: 14.5px; color: var(--faint); }

  .disclaimer {
    background: var(--warn-bg); border: 1px solid var(--warn-line);
    border-radius: 12px; padding: 18px 20px;
    font-size: 15.5px; line-height: 1.55; margin-top: 34px;
  }
  .disclaimer strong { display: block; margin-bottom: 4px; }

  /* Duas colunas de comportamento. O que o agente recusa é tão informativo
     quanto o que ele faz — e é o que distingue este projeto de um chatbot
     qualquer sobre um candidato. */
  .does { display: grid; gap: 34px 40px; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); }
  .does h3 { font-size: 14px; letter-spacing: -0.1px; color: var(--ink); margin-bottom: 12px; }
  .does ul { list-style: none; display: grid; gap: 11px; }
  .does li { font-size: 15.5px; color: var(--ink-soft); padding-left: 26px; position: relative; text-wrap: pretty; }
  .does li::before {
    position: absolute; left: 0; top: -1px; font-size: 15px; font-weight: 700;
  }
  .does .yes li::before { content: "→"; color: var(--accent); }
  .does .no li::before { content: "×"; color: var(--faint); }

  ul.sources { list-style: none; }
  ul.sources li { padding: 15px 0; border-bottom: 1px solid var(--line); }
  ul.sources li:last-child { border-bottom: none; }
  ul.sources .what { font-weight: 700; }
  ul.sources .meta { display: block; font-size: 14.5px; color: var(--ink-soft); margin-top: 2px; }
  .excluded {
    margin-top: 26px; font-size: 15px; color: var(--ink-soft);
    background: var(--accent-soft); border-radius: 12px; padding: 17px 19px; text-wrap: pretty;
  }

  dl.faq dt { font-weight: 700; margin-top: 22px; }
  dl.faq dt:first-child { margin-top: 0; }
  dl.faq dd { color: var(--ink-soft); font-size: 16px; text-wrap: pretty; }

  .help {
    border: 1px solid var(--line); background: var(--surface);
    border-radius: 12px; padding: 20px; font-size: 16px; text-wrap: pretty;
  }
  .help strong { color: var(--accent); }

  footer { border-top: 1px solid var(--line); padding: 34px 0 60px; font-size: 14.5px; color: var(--faint); }
  footer p + p { margin-top: 10px; }

  @media (prefers-reduced-motion: reduce) {
    html { scroll-behavior: auto; }
    * { transition-duration: 0.01ms !important; }
  }

/* ---- páginas de tópico --------------------------------------------------- */

.answer { margin-top: 30px; font-size: 17.5px; line-height: 1.72; text-wrap: pretty; }
.answer p + p { margin-top: 0.9em; }
.answer strong { font-weight: 680; }

.sources-block { margin-top: 22px; font-size: 13.5px; color: var(--faint); }
.sources-block > summary { cursor: pointer; list-style: none; display: inline-flex; gap: 6px; align-items: center; }
.sources-block > summary::-webkit-details-marker { display: none; }
.sources-block > summary::after { content: "▾"; font-size: 10px; transition: transform 150ms var(--ease); }
.sources-block[open] > summary::after { transform: rotate(180deg); }
.sources-block ul { list-style: none; margin-top: 10px; display: grid; gap: 6px; }
.sources-block li { color: var(--ink-soft); padding-left: 14px; position: relative; }
.sources-block li::before { content: "·"; position: absolute; left: 2px; }

ul.topic-list { list-style: none; display: grid; gap: 2px; }
ul.topic-list a {
  display: block; padding: 15px 16px; margin: 0 -16px; border-radius: 12px;
  text-decoration: none; color: inherit;
  transition: background 150ms var(--ease);
}
ul.topic-list a:hover { background: var(--accent-soft); }
ul.topic-list .what { display: block; font-weight: 700; color: var(--ink); }
ul.topic-list .meta { display: block; font-size: 14.5px; color: var(--ink-soft); margin-top: 2px; text-wrap: pretty; }

/* ---- /benchmark ---------------------------------------------------------- */

/* A tabela é o conteúdo desta página; num telefone ela rola na horizontal em
   vez de virar cartões empilhados, porque a comparação entre linhas é o que a
   pessoa veio ver e empilhar destrói exatamente isso. */
.table-wrap { margin: 26px -20px 0; padding: 0 20px; overflow-x: auto; }
table.bench {
  border-collapse: collapse; width: 100%; min-width: 720px;
  font-variant-numeric: tabular-nums; font-size: 14.5px;
}
table.bench th, table.bench td { padding: 11px 10px; text-align: left; }
table.bench thead th {
  font-size: 12px; font-weight: 700; color: var(--faint);
  border-bottom: 1px solid var(--line); white-space: nowrap;
}
table.bench thead tr.sub th { padding-top: 0; font-weight: 600; }
table.bench tbody tr { border-bottom: 1px solid var(--line); }
table.bench tbody tr:last-child { border-bottom: none; }
table.bench .num { text-align: right; font-variant-numeric: tabular-nums; }
table.bench .strong { font-weight: 750; color: var(--ink); }
table.bench .rank { color: var(--faint); width: 1%; padding-right: 0; }
table.bench .tier { color: var(--ink-soft); white-space: nowrap; font-size: 13.5px; }
table.bench .model { font-weight: 650; color: var(--ink); }
table.bench .slug { display: block; font-size: 12px; font-weight: 400; color: var(--faint); margin-top: 1px; }
table.bench tr.chosen { background: var(--accent-soft); }
table.bench tr.chosen td:first-child { border-radius: 8px 0 0 8px; }
table.bench tr.chosen td:last-child { border-radius: 0 8px 8px 0; }
.badge {
  font-size: 10.5px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.06em;
  color: var(--accent-ink); background: var(--accent); border-radius: 999px; padding: 2px 7px;
  vertical-align: 1px; white-space: nowrap;
}
.hf { font-weight: 750; color: oklch(0.55 0.16 25); cursor: help; }
@media (prefers-color-scheme: dark) { .hf { color: oklch(0.75 0.15 25); } }
.up { color: var(--accent); }
.down { color: var(--faint); }

.verdict {
  margin-top: 30px; padding: 20px 22px; border-radius: 14px;
  background: var(--surface); border: 1px solid var(--line);
  font-size: 16.5px; line-height: 1.6; text-wrap: pretty;
}
.verdict strong { display: block; margin-bottom: 5px; }

.footnote { margin-top: 14px; font-size: 14px; color: var(--faint); text-wrap: pretty; }
ul.limits { list-style: none; display: grid; gap: 10px; margin-top: 8px; }
ul.limits li { padding-left: 24px; position: relative; color: var(--ink-soft); text-wrap: pretty; }
ul.limits li::before { content: "×"; position: absolute; left: 4px; color: var(--faint); font-weight: 700; }

.qwrap h3 { margin-top: 20px; color: var(--ink); font-size: 13px; text-transform: uppercase; letter-spacing: 0.05em; }
ul.qlist { list-style: none; display: grid; gap: 14px; margin-top: 10px; }
ul.qlist li { display: grid; gap: 3px; }
ul.qlist .q { color: var(--ink); font-weight: 600; }
ul.qlist .e, ul.qlist .f { color: var(--faint); font-size: 13px; }

code { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 0.92em; }

a.brand { text-decoration: none; color: inherit; }
`;
