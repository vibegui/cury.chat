import { useCallback, useEffect, useRef, useState } from "react";
import * as api from "./api.ts";
import type { ConversationMeta, Turn } from "./api.ts";

const AI_NOTICE =
	"Projeto independente. Não é a campanha, o Avante nem Augusto Cury. Respostas geradas por IA a partir de fontes públicas.";

export function App() {
	// `/s/<id>` is the read-only view. Routing is one string compare — a router
	// would be more code than the thing it routes.
	const shared = window.location.pathname.match(/^\/s\/([a-z0-9]+)/);
	return shared ? <SharedView shareId={shared[1]} /> : <ChatView />;
}

// -----------------------------------------------------------------------------

function ChatView() {
	const [conversations, setConversations] = useState<ConversationMeta[]>([]);
	const [activeId, setActiveId] = useState<string | undefined>();
	const [turns, setTurns] = useState<Turn[]>([]);
	const [draft, setDraft] = useState("");
	const [pending, setPending] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [sidebarOpen, setSidebarOpen] = useState(false);
	const [shareUrl, setShareUrl] = useState<string | null>(null);

	useEffect(() => {
		api
			.listConversations()
			.then(setConversations)
			.catch(() => {});
	}, []);

	const openConversation = useCallback(async (id: string) => {
		setActiveId(id);
		setSidebarOpen(false);
		setShareUrl(null);
		setError(null);
		const { turns } = await api.loadConversation(id);
		setTurns(turns);
	}, []);

	function newConversation() {
		setActiveId(undefined);
		setTurns([]);
		setShareUrl(null);
		setError(null);
		setSidebarOpen(false);
	}

	async function submit(e: React.FormEvent) {
		e.preventDefault();
		const text = draft.trim();
		if (!text || pending) return;

		// Optimistic: the person's own message should never wait on the network.
		setTurns((t) => [...t, { role: "user", content: text, ts: Date.now() }]);
		setDraft("");
		setPending(true);
		setError(null);

		try {
			const res = await api.send(text, activeId);
			setActiveId(res.conversationId);
			setTurns((t) => [
				...t,
				{ role: "assistant", content: res.reply, ts: Date.now(), citations: res.citations },
			]);
			setConversations((list) => [res.meta, ...list.filter((c) => c.id !== res.meta.id)]);
		} catch (err) {
			// Drop the optimistic turn: leaving it implies it was delivered.
			setTurns((t) => t.slice(0, -1));
			setDraft(text);
			setError(err instanceof Error ? err.message : "Falha ao enviar.");
		} finally {
			setPending(false);
		}
	}

	async function doShare() {
		if (!activeId) return;
		try {
			const shareId = await api.share(activeId);
			const url = `${window.location.origin}/s/${shareId}`;
			setShareUrl(url);
			await navigator.clipboard?.writeText(url).catch(() => {});
		} catch {
			setError("Não consegui criar o link.");
		}
	}

	async function remove(id: string) {
		await api.deleteConversation(id);
		setConversations((list) => list.filter((c) => c.id !== id));
		if (id === activeId) newConversation();
	}

	return (
		<div className="flex h-dvh bg-[--bg] text-[--ink]">
			{sidebarOpen && (
				<button
					type="button"
					aria-label="Fechar menu"
					className="fixed inset-0 z-20 bg-black/40 md:hidden"
					onClick={() => setSidebarOpen(false)}
				/>
			)}

			<aside
				className={`${
					sidebarOpen ? "translate-x-0" : "-translate-x-full"
				} fixed z-30 flex h-dvh w-72 flex-col border-r border-[--line] bg-[--surface] transition-transform md:relative md:translate-x-0`}
			>
				<div className="flex items-center justify-between px-4 py-4">
					<a href="/" className="font-extrabold tracking-tight no-underline text-[--ink]">
						cury.chat
					</a>
					<span className="text-[11px] font-semibold uppercase tracking-wider text-[--faint]">
						independente
					</span>
				</div>

				<div className="px-3">
					<button type="button" onClick={newConversation} className="btn-new">
						+ Nova conversa
					</button>
				</div>

				<nav className="mt-3 flex-1 overflow-y-auto px-2 pb-4">
					{conversations.length === 0 && (
						<p className="px-2 py-6 text-sm text-[--faint]">Nenhuma conversa ainda.</p>
					)}
					{conversations.map((c) => (
						<div key={c.id} className={`thread-row ${c.id === activeId ? "is-active" : ""}`}>
							<button type="button" className="thread-title" onClick={() => openConversation(c.id)}>
								{c.title}
							</button>
							<button
								type="button"
								aria-label={`Apagar ${c.title}`}
								className="thread-del"
								onClick={() => remove(c.id)}
							>
								×
							</button>
						</div>
					))}
				</nav>

				<p className="border-t border-[--line] px-4 py-3 text-[11px] leading-snug text-[--faint]">
					{AI_NOTICE}
				</p>
			</aside>

			<main className="flex min-w-0 flex-1 flex-col">
				<header className="flex items-center gap-3 border-b border-[--line] px-4 py-3">
					<button
						type="button"
						className="md:hidden text-xl leading-none"
						aria-label="Abrir conversas"
						onClick={() => setSidebarOpen(true)}
					>
						☰
					</button>
					<h1 className="min-w-0 flex-1 truncate text-sm font-semibold">
						{conversations.find((c) => c.id === activeId)?.title ?? "Nova conversa"}
					</h1>
					{activeId && (
						<button type="button" onClick={doShare} className="btn-ghost">
							Compartilhar
						</button>
					)}
				</header>

				{shareUrl && (
					<div className="notice">
						Link copiado — quem abrir vê a conversa em modo leitura:{" "}
						<a href={shareUrl}>{shareUrl}</a>
					</div>
				)}

				<Messages turns={turns} pending={pending} onPick={(q) => setDraft(q)} />

				{error && <div className="notice notice-error">{error}</div>}

				<form onSubmit={submit} className="composer">
					<textarea
						value={draft}
						onChange={(e) => setDraft(e.target.value)}
						onKeyDown={(e) => {
							if (e.key === "Enter" && !e.shiftKey) {
								e.preventDefault();
								submit(e as unknown as React.FormEvent);
							}
						}}
						rows={1}
						maxLength={2000}
						placeholder="Pergunte sobre as propostas de Augusto Cury…"
						className="composer-input"
					/>
					<button type="submit" disabled={pending || !draft.trim()} className="btn-send">
						{pending ? "…" : "Enviar"}
					</button>
				</form>
			</main>
		</div>
	);
}

// -----------------------------------------------------------------------------

const SUGGESTIONS = [
	"Qual a proposta dele para a educação?",
	"O que é inteligência multifocal?",
	"O que ele propõe sobre saúde mental?",
	"O que é semipresidencialismo no plano dele?",
];

function Messages({
	turns,
	pending,
	onPick,
	readOnly,
}: {
	turns: Turn[];
	pending?: boolean;
	onPick?: (q: string) => void;
	readOnly?: boolean;
}) {
	const bottom = useRef<HTMLDivElement>(null);
	// biome-ignore lint/correctness/useExhaustiveDependencies: scroll on every append
	useEffect(() => {
		bottom.current?.scrollIntoView({ behavior: "smooth" });
	}, [turns.length, pending]);

	if (turns.length === 0 && !readOnly) {
		return (
			<div className="flex flex-1 flex-col items-center justify-center gap-6 px-6 text-center">
				<div>
					<h2 className="text-2xl font-extrabold tracking-tight">
						Pergunte o que Augusto Cury propõe
					</h2>
					<p className="mx-auto mt-2 max-w-md text-sm text-[--ink-soft]">
						Respostas ancoradas no plano de governo protocolado no TSE e em outros materiais
						públicos. Cada resposta diz de onde saiu.
					</p>
				</div>
				<div className="grid w-full max-w-lg gap-2 sm:grid-cols-2">
					{SUGGESTIONS.map((q) => (
						<button key={q} type="button" className="suggestion" onClick={() => onPick?.(q)}>
							{q}
						</button>
					))}
				</div>
			</div>
		);
	}

	return (
		<div className="flex-1 overflow-y-auto px-4 py-6">
			<div className="mx-auto flex max-w-2xl flex-col gap-5">
				{turns.map((t, i) => (
					<Bubble key={`${t.ts}-${i}`} turn={t} />
				))}
				{pending && <div className="typing">Consultando as fontes…</div>}
				<div ref={bottom} />
			</div>
		</div>
	);
}

function Bubble({ turn }: { turn: Turn }) {
	const isUser = turn.role === "user";
	const sources = [...new Set((turn.citations ?? []).map((c) => c.source))].slice(0, 4);

	return (
		<div className={isUser ? "row-user" : "row-bot"}>
			<div className={isUser ? "bubble-user" : "bubble-bot"}>
				{renderMarkdownish(turn.content)}
				{sources.length > 0 && (
					<div className="sources">
						<span>Fontes:</span>
						{sources.map((s) => (
							<span key={s} className="chip">
								{s}
							</span>
						))}
					</div>
				)}
			</div>
		</div>
	);
}

/**
 * The model emits light markdown (**bold**, paragraphs). A full markdown
 * renderer is a dependency and an XSS surface for three constructs, so this
 * splits on paragraphs and bolds inline — no `dangerouslySetInnerHTML`.
 */
function renderMarkdownish(text: string) {
	return text.split(/\n{2,}/).map((para, i) => (
		// biome-ignore lint/suspicious/noArrayIndexKey: paragraphs are positional
		<p key={i} className="whitespace-pre-wrap">
			{para.split(/(\*\*[^*]+\*\*)/g).map((part, j) =>
				part.startsWith("**") && part.endsWith("**") ? (
					// biome-ignore lint/suspicious/noArrayIndexKey: fragments are positional
					<strong key={j}>{part.slice(2, -2)}</strong>
				) : (
					part
				),
			)}
		</p>
	));
}

// -----------------------------------------------------------------------------

function SharedView({ shareId }: { shareId: string }) {
	const [state, setState] = useState<
		{ status: "loading" } | { status: "ok"; title: string; turns: Turn[] } | { status: "gone" }
	>({ status: "loading" });

	useEffect(() => {
		api
			.loadShared(shareId)
			.then((r) => setState({ status: "ok", ...r }))
			.catch(() => setState({ status: "gone" }));
	}, [shareId]);

	if (state.status === "loading") {
		return <div className="p-10 text-center text-sm text-[--faint]">Carregando…</div>;
	}
	if (state.status === "gone") {
		return (
			<div className="p-10 text-center">
				<h1 className="text-xl font-bold">Conversa não encontrada</h1>
				<p className="mt-2 text-sm text-[--ink-soft]">
					O link pode ter expirado. <a href="/chat">Começar uma conversa</a>
				</p>
			</div>
		);
	}

	return (
		<div className="flex h-dvh flex-col bg-[--bg] text-[--ink]">
			<header className="border-b border-[--line] px-4 py-3">
				<div className="mx-auto flex max-w-2xl items-center gap-3">
					<a href="/" className="font-extrabold tracking-tight no-underline text-[--ink]">
						cury.chat
					</a>
					<span className="badge-ro">somente leitura</span>
					<h1 className="min-w-0 flex-1 truncate text-sm text-[--ink-soft]">{state.title}</h1>
				</div>
			</header>

			<Messages turns={state.turns} readOnly />

			<footer className="border-t border-[--line] px-4 py-4 text-center">
				<p className="mx-auto max-w-2xl text-xs text-[--faint]">{AI_NOTICE}</p>
				<a href="/chat" className="btn-cta mt-3">
					Fazer minhas perguntas
				</a>
			</footer>
		</div>
	);
}
