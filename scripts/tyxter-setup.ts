#!/usr/bin/env bun
// Wire the deployed worker to Tyxter.
//
//   bun run tyxter:setup                       # inspect: key env, numbers, endpoints
//   bun run tyxter:setup <worker-url>          # register the inbound webhook
//   bun run tyxter:setup <worker-url> --test   # register (or reuse) then probe it
//
// Reads TYXTER_API_KEY from the environment — never a flag, never a file that
// gets committed. TYXTER_API_BASE_URL defaults to https://api.tyxter.com.
//
// The signing secret is returned exactly once, by the create call. This script
// prints it and stops; store it with:
//   bunx wrangler secret put TYXTER_WEBHOOK_SIGNING_SECRET

import { DEFAULT_TYXTER_BASE_URL, TyxterApi, TyxterError } from "../api/services/tyxter.ts";

// Only the events this worker acts on. Endpoints are not auto-subscribed to
// event types added later — widening the list is a PATCH.
const SUBSCRIBED_EVENTS = ["message.received"];

const apiKey = process.env.TYXTER_API_KEY;
if (!apiKey) {
	console.error("TYXTER_API_KEY is not set. Export it, then re-run.");
	process.exit(1);
}

const baseUrl = process.env.TYXTER_API_BASE_URL || DEFAULT_TYXTER_BASE_URL;
const args = process.argv.slice(2);
const wantsTest = args.includes("--test");
const workerUrl = args.find((a) => a.startsWith("http"));

const environment = apiKey.startsWith("tx_live_")
	? "production"
	: apiKey.startsWith("tx_sandbox_")
		? "sandbox"
		: "unknown";

const api = new TyxterApi({ apiKey, senderId: "", baseUrl });

function explain(err: unknown): string {
	if (err instanceof TyxterError) {
		return `${err.status} ${err.code}: ${err.message}`;
	}
	return String(err);
}

console.log(`Tyxter ${baseUrl} — key environment: ${environment}\n`);

// ---- Phone numbers ----------------------------------------------------------

try {
	const numbers = await api.listPhoneNumbers();
	if (numbers.length === 0) {
		console.log("Phone numbers: none.");
		console.log('  Provision one with POST /v1/phone-numbers/provision {"ddd":"11"}');
	}
	for (const n of numbers) {
		const registered = n.meta_phone_number_id
			? `Meta ${n.meta_phone_number_id} (WABA ${n.waba_id})`
			: "NOT registered with Meta";
		console.log(`Phone ${n.phone}  id=${n.id}  env=${n.environment}  ${n.status}  ${registered}`);
		if (!n.meta_phone_number_id) {
			console.log(
				"  → Registering with Meta is a browser-only step: https://tyxter.com/connect-whatsapp",
			);
		}
		if (n.environment === "sandbox") {
			console.log("  → Sandbox number: simulated only, it never reaches a real phone.");
		}
	}
} catch (err) {
	console.log(`Phone numbers: ${explain(err)}`);
}

// ---- Webhook endpoints ------------------------------------------------------

console.log("");
let endpointId: string | undefined;

try {
	const existing = await api.listWebhookEndpoints();
	for (const e of existing) {
		console.log(`Endpoint ${e.url}  id=${e.id}  ${e.status}  [${e.subscribed_events.join(", ")}]`);
	}
	if (existing.length === 0) console.log("Endpoints: none registered.");

	if (workerUrl) {
		const target = `${workerUrl.replace(/\/+$/, "")}/tyxter/webhook`;
		const match = existing.find((e) => e.url === target);

		if (match) {
			endpointId = match.id;
			console.log(`\nAlready registered: ${target}`);
			console.log("  The signing secret is only shown at creation. If you lost it, rotate:");
			console.log(`  POST /v1/webhook-endpoints/${match.id}/rotate-signing-secret`);
		} else {
			const created = await api.createWebhookEndpoint(
				target,
				SUBSCRIBED_EVENTS,
				"cury.chat inbound",
			);
			endpointId = created.id;
			console.log(`\nRegistered ${target}  id=${created.id}`);
			console.log("\n  Store this now — it is never shown again:\n");
			console.log(`  bunx wrangler secret put TYXTER_WEBHOOK_SIGNING_SECRET`);
			console.log(`  ${created.signing_secret}\n`);
		}
	} else {
		console.log("\nPass the worker URL to register the inbound webhook:");
		console.log("  bun run tyxter:setup https://cury-mcp.<sub>.workers.dev");
	}
} catch (err) {
	console.log(`Webhook endpoints: ${explain(err)}`);
}

// ---- Signed probe -----------------------------------------------------------

if (wantsTest && endpointId) {
	console.log("");
	try {
		const receipt = await api.testWebhookEndpoint(endpointId);
		console.log(`Probe queued: webhook_event_id=${receipt.webhook_event_id}`);
		console.log("  Poll GET /v1/webhook-events/{id} for the terminal status.");
		console.log("  A test delivery is terminal after attempt 1 — no retry either way.");
	} catch (err) {
		console.log(`Probe: ${explain(err)}`);
	}
}

console.log("\nScopes this integration needs:");
console.log("  messages:write   send replies");
console.log("  webhooks:write   register the inbound endpoint (this script)");
console.log("  sandbox:write    simulate inbound to open the 24h service window");
console.log("  phone_numbers:write, templates:write — only for the production number");
