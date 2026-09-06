# Skills shipped with cury-mcp

Two Claude Code skills that ship with this repo. They live here (in the project) so they're versioned alongside the code they describe, but they're designed to be installed independently — copy a skill's folder into `~/.claude/skills/` and it's available globally.

| Skill | Purpose |
|---|---|
| [`whatsapp-bot-fork`](whatsapp-bot-fork/SKILL.md) | Take the user from "I want a bot about X" to a deployed Cloudflare Worker reachable from WhatsApp |
| [`whatsapp-bot-operate`](whatsapp-bot-operate/SKILL.md) | Day-2 ops for an already-deployed bot — live-edit prompt, inspect threads, add corpus, send proactive messages, switch models |

## Installing locally

```bash
# Per-skill:
cp -r .claude/skills/whatsapp-bot-fork ~/.claude/skills/
cp -r .claude/skills/whatsapp-bot-operate ~/.claude/skills/

# Or symlink so they stay in sync with this repo:
ln -s "$PWD/.claude/skills/whatsapp-bot-fork" ~/.claude/skills/whatsapp-bot-fork
ln -s "$PWD/.claude/skills/whatsapp-bot-operate" ~/.claude/skills/whatsapp-bot-operate
```

After install, `claude` (or Claude Code) loads them on next session start. Triggers are documented in each skill's `description` frontmatter.

## Publishing

These skills are MIT-licensed alongside the rest of the repo. Anyone forking can either:

- Pick the skills up by installing them into their own `~/.claude/skills/` (see above), then run them against their fork
- Repurpose as the foundation for their own template skills — change the template URL, persona examples, and provider defaults

## Companion docs

The skills delegate detailed how-to content to:

- [`../../README.md`](../../README.md) — architecture, deploy, troubleshooting
- [`../../docs/deploy.md`](../../docs/deploy.md) — step-by-step Cloudflare setup
- [`../../docs/whatsapp-setup.md`](../../docs/whatsapp-setup.md) — Meta credentials walkthrough
- [`../../docs/customizing.md`](../../docs/customizing.md) — fork checklist
