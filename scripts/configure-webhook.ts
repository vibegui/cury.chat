#!/usr/bin/env bun
// Configure the Meta WhatsApp webhook for your phone number, end-to-end,
// without touching the Meta Business Manager UI.
//
// Does three things in order:
//   1. Looks up the WhatsApp Business Account (WABA) id from the phone number.
//   2. Subscribes your Meta app to that WABA so it gets webhook events at all.
//      (Equivalent to the "Webhook fields → messages" toggle in the Meta UI.)
//   3. Sets a per-phone-number override callback URL pointing at your worker.
//      (Equivalent to the "Edit Callback URL" form in the Meta UI.)
//
// Endpoints used (same calls /Users/guilherme/Projects/mcps/whatsapp-management makes):
//   GET  /{PHONE_NUMBER_ID}?fields=whatsapp_business_account
//   POST /{WABA_ID}/subscribed_apps
//   POST /{PHONE_NUMBER_ID}  body { webhook_configuration: { override_callback_uri, verify_token } }
//
// Usage:
//   bun run scripts/configure-webhook.ts <worker-url>
//   bun run scripts/configure-webhook.ts https://cury-mcp.gui.workers.dev
//
//   # Revert to no override (Meta will fall back to the app-level webhook, if any):
//   bun run scripts/configure-webhook.ts --clear
//
// Reads creds from .dev.vars (gitignored) or env vars (CI):
//   META_ACCESS_TOKEN     — permanent system-user token
//   META_PHONE_NUMBER_ID  — the bound phone number id
//   META_VERIFY_TOKEN     — any string; same one the worker checks on GET /webhook
//   META_API_VERSION      — defaults to v23.0
//
// `bun run configure-webhook https://…` also works (see package.json).

import { readFile } from "node:fs/promises";
import { join } from "node:path";

interface MetaConfig {
	accessToken: string;
	phoneNumberId: string;
	verifyToken: string;
	apiVersion: string;
}

async function loadDevVars(): Promise<Record<string, string>> {
	const path = join(import.meta.dir, "..", ".dev.vars");
	try {
		const content = await readFile(path, "utf8");
		const vars: Record<string, string> = {};
		for (const line of content.split("\n")) {
			const trimmed = line.trim();
			if (!trimmed || trimmed.startsWith("#")) continue;
			const eq = trimmed.indexOf("=");
			if (eq < 0) continue;
			const key = trimmed.slice(0, eq).trim();
			let val = trimmed.slice(eq + 1).trim();
			if (val.startsWith('"') && val.endsWith('"')) val = val.slice(1, -1);
			vars[key] = val;
		}
		return vars;
	} catch {
		return {};
	}
}

async function metaFetch(cfg: MetaConfig, path: string, init?: RequestInit) {
	const url = `https://graph.facebook.com/${cfg.apiVersion}${path}`;
	const res = await fetch(url, {
		...init,
		headers: {
			Authorization: `Bearer ${cfg.accessToken}`,
			"Content-Type": "application/json",
			...(init?.headers ?? {}),
		},
	});
	const text = await res.text();
	let parsed: any;
	try {
		parsed = JSON.parse(text);
	} catch {
		parsed = text;
	}
	if (!res.ok) {
		throw new Error(`Meta API ${res.status} ${path}: ${JSON.stringify(parsed)}`);
	}
	return parsed;
}

async function getWabaId(cfg: MetaConfig): Promise<string | null> {
	// Some tokens don't have permission to traverse phone→WABA. Try a few paths
	// and return null if none work — the per-phone override still works on its
	// own as long as some app is already subscribed to the WABA (which is
	// usually the case for any phone that was previously receiving messages).
	const attempts = [
		`/${cfg.phoneNumberId}?fields=whatsapp_business_account{id,name}`,
		`/me/whatsapp_business_accounts`,
	];
	for (const path of attempts) {
		try {
			const res = await metaFetch(cfg, path);
			const waba = res?.whatsapp_business_account ?? res?.data?.[0];
			if (waba?.id) {
				console.log(`  WABA: ${waba.name ?? "(unnamed)"} (${waba.id})`);
				return waba.id;
			}
		} catch {
			/* try next */
		}
	}
	console.log("  (couldn't resolve WABA id from token — skipping app-subscribe step)");
	return null;
}

async function subscribeApp(cfg: MetaConfig, wabaId: string) {
	const res = await metaFetch(cfg, `/${wabaId}/subscribed_apps`, { method: "POST" });
	if (res?.success === false) {
		throw new Error(`Could not subscribe app to WABA ${wabaId}: ${JSON.stringify(res)}`);
	}
	console.log(`  ✓ App subscribed to WABA`);
}

async function setOverride(cfg: MetaConfig, workerUrl: string | null) {
	const callbackUrl = workerUrl ? `${workerUrl.replace(/\/+$/, "")}/webhook` : "";
	const body = {
		webhook_configuration: {
			override_callback_uri: callbackUrl,
			verify_token: workerUrl ? cfg.verifyToken : "",
		},
	};
	await metaFetch(cfg, `/${cfg.phoneNumberId}`, {
		method: "POST",
		body: JSON.stringify(body),
	});
	console.log(workerUrl ? `  ✓ Webhook override → ${callbackUrl}` : "  ✓ Webhook override cleared");
}

async function showCurrent(cfg: MetaConfig) {
	const res = await metaFetch(
		cfg,
		`/${cfg.phoneNumberId}?fields=display_phone_number,verified_name,webhook_configuration`,
	);
	console.log(`  Phone: ${res.display_phone_number ?? "?"} (${res.verified_name ?? "?"})`);
	// Write API uses `override_callback_uri`; read API returns it as `phone_number`. Yes, really.
	const wh = res.webhook_configuration;
	const override = wh?.phone_number || wh?.override_callback_uri;
	if (override) {
		console.log(`  Current override: ${override}`);
	} else {
		console.log(`  Current override: (none — falls back to app-level webhook)`);
	}
	if (wh?.application) console.log(`  App-level fallback: ${wh.application}`);
}

async function main() {
	const args = process.argv.slice(2);
	const clear = args.includes("--clear");
	const show = args.includes("--show");
	const workerUrl = args.find((a) => !a.startsWith("--"));

	if (!show && !clear && !workerUrl) {
		console.error("Usage:");
		console.error("  bun run scripts/configure-webhook.ts <worker-url>   # set webhook");
		console.error("  bun run scripts/configure-webhook.ts --clear        # clear override");
		console.error("  bun run scripts/configure-webhook.ts --show         # show current");
		process.exit(1);
	}

	const dev = await loadDevVars();
	const cfg: MetaConfig = {
		accessToken: process.env.META_ACCESS_TOKEN || dev.META_ACCESS_TOKEN || "",
		phoneNumberId: process.env.META_PHONE_NUMBER_ID || dev.META_PHONE_NUMBER_ID || "",
		verifyToken: process.env.META_VERIFY_TOKEN || dev.META_VERIFY_TOKEN || "",
		apiVersion: process.env.META_API_VERSION || dev.META_API_VERSION || "v23.0",
	};

	const missing: string[] = [];
	if (!cfg.accessToken) missing.push("META_ACCESS_TOKEN");
	if (!cfg.phoneNumberId) missing.push("META_PHONE_NUMBER_ID");
	if (!show && !clear && !cfg.verifyToken) missing.push("META_VERIFY_TOKEN");
	if (missing.length > 0) {
		console.error(`Missing: ${missing.join(", ")}`);
		console.error("Set them in .dev.vars (see .dev.vars.example) or pass via env.");
		process.exit(1);
	}

	if (show) {
		await showCurrent(cfg);
		return;
	}

	console.log(`Phone number id: ${cfg.phoneNumberId}`);

	const wabaId = await getWabaId(cfg);
	if (wabaId) await subscribeApp(cfg, wabaId);
	await setOverride(cfg, clear ? null : workerUrl!);

	console.log("");
	console.log("Done. Verifying current state:");
	await showCurrent(cfg);
	console.log("");
	console.log("Test it:");
	console.log("  1. wrangler tail   # in another terminal");
	console.log("  2. Send a WhatsApp message to your bound number");
	console.log("  3. Watch the tail for `turn ok`");
}

main().catch((err) => {
	console.error(err.message ?? err);
	process.exit(2);
});
