# WhatsApp / Meta setup

There are two ways to wire up the webhook: a one-shot script (recommended) or
the Meta Business Manager UI. The script is faster and reversible.

Either way, you need four pieces of info first:

| What | Where to get it | Goes into |
|---|---|---|
| **Phone Number ID** | <https://business.facebook.com> → Settings (gear) → WhatsApp Accounts → your account → your number | `wrangler.toml` `META_PHONE_NUMBER_ID` |
| **Permanent Access Token** | See §1 below — system user token | `wrangler secret put META_ACCESS_TOKEN` |
| **App Secret** | <https://developers.facebook.com/apps/> → your app → Settings → Basic → Show next to "App Secret" | `wrangler secret put META_APP_SECRET` |
| **Verify Token** | Pick any random string (a UUID works) | `wrangler secret put META_VERIFY_TOKEN` |

Same four values also go into `.dev.vars` (gitignored) so the configure-webhook
script can read them.

---

## §1. Generate a permanent access token (the one you'll actually use)

The token shown on the Developer dashboard's "API Setup" panel is a **24-hour
temporary** one. For a production bot you want a **System User token** that
never expires.

> **<https://business.facebook.com/settings/system-users>**

Steps:

1. Open the URL above. (Alternative path: <https://business.facebook.com> → click the gear icon ⚙ → **System Users**.)
2. If you don't have a system user yet: **Add** → give it a name like "cury-bot" → **Admin** role.
3. Click your system user → **Add Assets** → select your **WhatsApp Account** → check **Full control** (or at minimum: messages + management) → Save.
4. Same panel → **Generate New Token**.
5. App: select the Meta app you'll use for WhatsApp.
6. Token expiration: **Never**.
7. Permissions: tick at least
   - `whatsapp_business_messaging` (send/receive)
   - `whatsapp_business_management` (configure webhook)
   - `business_management` (read WABA metadata)
8. **Generate Token** → copy it immediately, Meta only shows it once.

Then:

```bash
wrangler secret put META_ACCESS_TOKEN
# paste the token
```

Same token into `.dev.vars`:

```
META_ACCESS_TOKEN=EAAG…
```

---

## §2. Configure the webhook — recommended (scripted)

After you've deployed the worker (`bun run deploy` printed a URL) and filled in
`.dev.vars`:

```bash
# Set the webhook to point at your worker:
bun run configure-webhook https://cury-mcp.<your-subdomain>.workers.dev

# See current config:
bun run configure-webhook --show

# Remove the override (revert to whatever app-level webhook, if any):
bun run configure-webhook --clear
```

What this does, via the Graph API (no UI clicks needed):

1. Looks up your phone number's WhatsApp Business Account (WABA).
2. Subscribes your app to that WABA so it receives webhook events.
   (Equivalent to "Webhook fields → messages" in the Meta UI.)
3. Sets a per-phone-number **override callback URL** pointing at your worker's
   `/webhook` route. (Equivalent to "Edit Callback URL" in the Meta UI.)

The override URL trumps any app-level webhook config, so multiple bots on the
same Meta app can each route their own number to their own worker.

Smoke test:

```bash
# In one terminal:
wrangler tail

# Then send a WhatsApp message to your bound number from any other phone.
# Within a few seconds the tail should show:
#   turn ok { threadId: '...', ms: 4120, model: 'google/gemini-3.5-flash', ... }
```

---

## §3. Configure the webhook — fallback (Meta UI)

If you can't run the script (e.g. CI without bun) or you want to look at it in
the dashboard, the exact page is:

> **<https://developers.facebook.com/apps/>** → your app → left sidebar **WhatsApp → Configuration**
>
> Direct URL pattern (replace `<APP_ID>` with your app's numeric id):
> `https://developers.facebook.com/apps/<APP_ID>/whatsapp-business/wa-settings/`

In the **Webhook** panel on that page:

1. Click **Edit** next to "Callback URL".
2. **Callback URL**: `https://cury-mcp.<your-subdomain>.workers.dev/webhook`
3. **Verify token**: paste the same string you saved as `META_VERIFY_TOKEN`.
4. **Verify and save** — Meta hits your worker's `GET /webhook`; a 200 with the
   right challenge means the webhook is registered.

In the **Webhook fields** sub-panel (same page):

5. Click **Manage**.
6. Subscribe to at least **`messages`** (inbound user messages — required).
   Optionally `message_template_status_update` if you also send templates.

---

## Troubleshooting

**`Meta API 400 /<phone-id>: (#100) Param webhook_configuration...`**
The phone number id in `.dev.vars` is wrong, or your access token doesn't have
the `whatsapp_business_management` scope. Re-check §1.

**`Meta API 200 but webhook still empty in dashboard`**
Run `bun run configure-webhook --show`. If `override_callback_uri` is correct,
Meta has it — the dashboard sometimes caches the old value for a minute or two.

**Meta verification fails when saving via UI**
The `META_VERIFY_TOKEN` secret in your worker doesn't match the value you typed
into Meta's form. They must be byte-identical. Reset:
`wrangler secret put META_VERIFY_TOKEN` and re-save the form.

**No messages arrive even though `--show` looks right**
Two usual culprits: (a) the Meta app is still in "Development" mode — flip to
Live in App Settings → Basic; (b) the phone number isn't in the system user's
asset list — go back to §1 step 3 and add it.

**Messages arrive but no reply**
`wrangler tail` and look for errors. Common: `OPENROUTER_API_KEY is not set`
(run `wrangler secret put OPENROUTER_API_KEY`), or `Meta sendText 401` (your
access token expired or lost a scope — regenerate via §1).
