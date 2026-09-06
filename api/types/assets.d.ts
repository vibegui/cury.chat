// wrangler's [[rules]] hand these to the Worker: `type = "Data"` yields an
// ArrayBuffer, `type = "Text"` a string. Neither has a declaration of its own
// (@types/bun covers .html and .md, which is why those need a cast instead).
declare module "*.png" {
	const content: ArrayBuffer;
	export default content;
}
declare module "*.svg" {
	const content: string;
	export default content;
}
