import path from "node:path";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { viteSingleFile } from "vite-plugin-singlefile";

// Second, separate build: the public web chat. Same single-file trick as the
// MCP admin app (vite.config.ts) — CSS and JS inlined into one HTML that the
// Worker imports as text and serves from /chat and /s/:shareId.
//
// It is its own config rather than a second entry in the main build because the
// two apps share nothing: different output dir, different root element, and the
// admin bundle must not ship in the page every visitor loads.
export default defineConfig({
	plugins: [react(), tailwindcss(), viteSingleFile()],
	resolve: { alias: { "@": path.resolve(__dirname, "./web-chat") } },
	build: {
		outDir: "dist/chat",
		emptyOutDir: true,
		rollupOptions: { input: "chat.html" },
	},
});
