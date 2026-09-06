import path from "node:path";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { viteSingleFile } from "vite-plugin-singlefile";

// One Vite build → one self-contained HTML (CSS + JS inlined). The Cloudflare
// Worker imports this file as text via wrangler.toml's [[rules]] type="Text"
// rule and serves it from every ui:// resource. The React app picks its view
// at runtime based on hostContext.toolInfo.tool.name (see web/router.tsx).
export default defineConfig({
	plugins: [react(), tailwindcss(), viteSingleFile()],
	resolve: {
		alias: {
			"@": path.resolve(__dirname, "./web"),
		},
	},
	build: {
		outDir: "dist/web",
		emptyOutDir: true,
		rollupOptions: {
			input: "index.html",
		},
	},
});
