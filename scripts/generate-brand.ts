#!/usr/bin/env bun
// Generates the OG card and the favicon set from hand-written SVG.
//
//   bun run brand
//
// Outputs are committed. This runs on a laptop when the mark or the copy
// changes, not in CI — the Worker serves the bytes, so a build that could not
// reach sharp would be a deploy that could not reach the favicon.
//
// The mark is a quotation glyph, not a portrait. Two reasons: this is an
// independent project and putting the candidate's face on it would imply the
// opposite, and the product's actual promise is that every answer says where
// it came from. A quote mark is that promise.

import { writeFileSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";

const ROOT = join(import.meta.dir, "..");
const OUT = join(ROOT, "landing");

// Same tokens as web-chat/globals.css, resolved to hex because SVG renderers
// still disagree about oklch().
const NAVY = "#0d3a63";
const NAVY_DEEP = "#08243f";
const CANVAS = "#fbfaf8";
const INK = "#111820";
const INK_SOFT = "#5b6672";

/** The quote mark, drawn once and reused at every size. */
function glyph(color: string, scale = 1, dx = 0, dy = 0): string {
	const bar = (x: number) => `
    <path d="M${x} 74
             a30 30 0 0 1 30-30 h14 a8 8 0 0 1 8 8 v12 a8 8 0 0 1-8 8
             h-6 a10 10 0 0 0-10 10 v6 h16 a8 8 0 0 1 8 8 v30
             a8 8 0 0 1-8 8 h-36 a8 8 0 0 1-8-8 z" fill="${color}"/>`;
	return `<g transform="translate(${dx} ${dy}) scale(${scale})">${bar(28)}${bar(96)}</g>`;
}

function iconSvg(size: number): string {
	// The glyph is drawn on a 200-unit canvas; scale it to whatever is asked.
	const s = size / 200;
	return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <rect width="${size}" height="${size}" rx="${size * 0.22}" fill="${NAVY}"/>
  ${glyph(CANVAS, s * 1.0, size * 0.06, size * 0.09)}
</svg>`;
}

/**
 * The WhatsApp profile photo: same mark as the favicon, minus the rounded
 * corner. WhatsApp crops avatars to a circle, and a squircle inside a circle
 * loses its four corners and becomes a shape nobody drew. Full bleed instead,
 * glyph centred at 42% of the width so it clears the crop with room to spare.
 *
 * The glyph's bounding box on the 200-unit canvas is x 28..152, y 44..114:
 * centre (90, 79), 124 wide. That is where the scale and offset come from.
 */
function avatarSvg(size: number): string {
	const k = (size * 0.42) / 124;
	return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <rect width="${size}" height="${size}" fill="${NAVY}"/>
  ${glyph(CANVAS, k, size / 2 - 90 * k, size / 2 - 79 * k)}
</svg>`;
}

const OG_W = 1200;
const OG_H = 630;

function ogSvg(): string {
	return `<svg xmlns="http://www.w3.org/2000/svg" width="${OG_W}" height="${OG_H}" viewBox="0 0 ${OG_W} ${OG_H}">
  <defs>
    <linearGradient id="edge" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${NAVY}"/>
      <stop offset="1" stop-color="${NAVY_DEEP}"/>
    </linearGradient>
  </defs>

  <rect width="${OG_W}" height="${OG_H}" fill="${CANVAS}"/>
  <rect width="${OG_W}" height="14" fill="url(#edge)"/>

  <!-- One bar of the quote mark, scaled up until it bleeds off two edges. A
       shape that is half-visible reads as a deliberate crop; the same shape
       fully visible but clipped at an arbitrary point reads as a mistake.
       Low contrast so it never competes with the type. -->
  <g opacity="0.05">${glyph(NAVY, 4.6, 890, 236)}</g>

  <g transform="translate(84 116)">
    <rect width="60" height="60" rx="14" fill="${NAVY}"/>
    ${glyph(CANVAS, 0.3, 3, 5)}
    <text x="80" y="41" font-family="Helvetica, Arial, sans-serif" font-size="30"
          font-weight="700" fill="${INK}">cury.chat</text>
    <text x="228" y="41" font-family="Helvetica, Arial, sans-serif" font-size="19"
          font-weight="600" fill="${INK_SOFT}">projeto independente</text>
  </g>

  <text x="84" y="286" font-family="Helvetica, Arial, sans-serif" font-size="62"
        font-weight="700" fill="${INK}" letter-spacing="-1.6">Pergunte o que Augusto Cury</text>
  <text x="84" y="360" font-family="Helvetica, Arial, sans-serif" font-size="62"
        font-weight="700" fill="${INK}" letter-spacing="-1.6">propõe — e de onde isso vem.</text>

  <text x="84" y="430" font-family="Helvetica, Arial, sans-serif" font-size="27"
        fill="${INK_SOFT}">Respostas ancoradas no plano de governo protocolado no TSE.</text>

  <rect x="84" y="486" width="1032" height="1" fill="#e0dcd4"/>
  <text x="84" y="536" font-family="Helvetica, Arial, sans-serif" font-size="21"
        fill="${INK_SOFT}">Não é a campanha, o Avante nem Augusto Cury. Respostas geradas por IA.</text>
</svg>`;
}

// -----------------------------------------------------------------------------

const MAX_OG_BYTES = 300 * 1024; // WhatsApp silently drops the preview above this

const og = await sharp(Buffer.from(ogSvg())).png({ compressionLevel: 9, palette: true }).toBuffer();

if (og.byteLength > MAX_OG_BYTES) {
	throw new Error(
		`og.png is ${(og.byteLength / 1024).toFixed(0)} KB, over WhatsApp's ~300 KB ceiling`,
	);
}
writeFileSync(join(OUT, "og.png"), og);

// Modern browsers take the SVG; the .ico is for older ones and for the
// tab-strip favicon caches that never learned.
writeFileSync(join(OUT, "icon.svg"), iconSvg(200));

for (const [name, size] of [
	["apple-touch-icon.png", 180],
	["icon-192.png", 192],
	["icon-512.png", 512],
] as const) {
	writeFileSync(
		join(OUT, name),
		await sharp(Buffer.from(iconSvg(size)))
			.png({ compressionLevel: 9 })
			.toBuffer(),
	);
}

// sharp cannot write .ico, and a 32×32 PNG served as the icon works in every
// browser that matters. Kept as .png rather than pretending it is an .ico.
writeFileSync(
	join(OUT, "favicon-32.png"),
	await sharp(Buffer.from(iconSvg(32)))
		.png({ compressionLevel: 9 })
		.toBuffer(),
);

// 640×640: Meta's floor is 192×192 and 640 is what WhatsApp stores without
// resampling. Not served by the Worker — it is uploaded in the Tyxter panel.
writeFileSync(
	join(OUT, "whatsapp-profile.png"),
	await sharp(Buffer.from(avatarSvg(640)))
		.png({ compressionLevel: 9 })
		.toBuffer(),
);

console.log(`og.png            ${(og.byteLength / 1024).toFixed(0)} KB  ${OG_W}×${OG_H}`);
for (const f of [
	"icon.svg",
	"favicon-32.png",
	"apple-touch-icon.png",
	"icon-192.png",
	"icon-512.png",
	"whatsapp-profile.png",
]) {
	console.log(`${f.padEnd(18)}${(Bun.file(join(OUT, f)).size / 1024).toFixed(1)} KB`);
}
