// Cacheable responses for the assets baked into the Worker bundle.
//
// What this does and does not buy, because it is easy to overestimate:
//
//   - `max-age` + `stale-while-revalidate` stops repeat visits from the same
//     browser (and any intermediary cache) from coming back at all. Real
//     saving, free.
//   - The ETag turns the revalidation that does happen into a 304 with an
//     empty body instead of re-sending the payload. The chat bundle is ~230 KB,
//     so this is the difference that matters on a phone.
//   - It does NOT stop the Worker from being invoked. On workers.dev every
//     request runs the script, headers or not. Skipping the invocation needs
//     the response served from Cloudflare's edge cache, which is a Cache Rule
//     on a real zone — available once cury.chat points at the account, not
//     before.
//
// Measured caveat on workers.dev: Cloudflare's HTML post-processing strips the
// ETag from `text/html` responses. The identical code path keeps it on
// `text/plain` (/llms.txt, /robots.txt), so conditional revalidation works
// there and not on / or /chat today. Left in place because it costs nothing
// and starts paying the moment the site sits on a zone where that
// post-processing is off.
//
// Bundle contents change only on deploy, so the ETag is computed once at module
// scope and lives as long as the isolate.

/** FNV-1a. Not a checksum for security — just a stable, sync content id. */
function contentTag(body: string): string {
	let hash = 0x811c9dc5;
	for (let i = 0; i < body.length; i++) {
		hash ^= body.charCodeAt(i);
		hash = Math.imul(hash, 0x01000193) >>> 0;
	}
	return `W/"${hash.toString(36)}-${body.length.toString(36)}"`;
}

export interface StaticAsset {
	body: string;
	contentType: string;
	cacheControl: string;
	etag: string;
}

export function staticAsset(body: string, contentType: string, cacheControl: string): StaticAsset {
	return { body, contentType, cacheControl, etag: contentTag(body) };
}

/**
 * `If-None-Match` may carry several tags, and a cache is allowed to weaken a
 * strong one, so compare against each entry with the `W/` prefix ignored.
 */
function matchesEtag(header: string | undefined, etag: string): boolean {
	if (!header) return false;
	if (header.trim() === "*") return true;
	const bare = etag.replace(/^W\//, "");
	return header.split(",").some((candidate) => candidate.trim().replace(/^W\//, "") === bare);
}

export function serveStatic(asset: StaticAsset, ifNoneMatch: string | undefined): Response {
	const headers = {
		"content-type": asset.contentType,
		"cache-control": asset.cacheControl,
		etag: asset.etag,
		vary: "Accept-Encoding",
	};
	// 304 must not carry a body, and must repeat the validators.
	if (matchesEtag(ifNoneMatch, asset.etag)) {
		return new Response(null, { status: 304, headers });
	}
	return new Response(asset.body, { status: 200, headers });
}

/**
 * Serve stale for a day while revalidating in the background, and for a week if
 * the origin is erroring. A landing page that is 30 seconds out of date is
 * fine; one that 500s because a deploy is mid-flight is not.
 */
export const CACHE_PAGE = "public, max-age=30, stale-while-revalidate=86400, stale-if-error=604800";

/** robots/llms/sitemap change on the order of months. */
export const CACHE_TEXT = "public, max-age=300, stale-while-revalidate=604800";
