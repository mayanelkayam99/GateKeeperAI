// frontend/src/components/RemediationChat.jsx
import { useState, useRef, useEffect } from "react";
import { Bot, Send, Zap } from "lucide-react";

const STARTER_PROMPTS = [
    "What exactly is the vulnerability here?",
    "Give me the exact commands to switch to the safe alternative.",
    "Show me a before/after code diff for the migration.",
    "What breaking changes should I watch out for?",
];

export default function RemediationChat({ scanId, packageName, status }) {
    const [messages, setMessages] = useState([]);
    const [input, setInput] = useState("");
    const [streaming, setStreaming] = useState(false);
    const bottomRef = useRef(null);

    useEffect(() => {
        bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [messages]);

    async function send(text) {
        const userMsg = text || input.trim();
        if (!userMsg || streaming) return;
        const priorHistory = messages;
        setMessages((prev) => [...prev, { role: "user", content: userMsg }]);
        setInput("");
        setStreaming(true);
        setMessages((prev) => [...prev, { role: "assistant", content: "" }]);

        try {
            const res = await fetch("/api/chat/", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ scan_id: scanId, message: userMsg, history: priorHistory }),
            });
            const reader = res.body.getReader();
            const decoder = new TextDecoder();
            let accumulated = "";
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                for (const line of decoder.decode(value).split("\n")) {
                    if (!line.startsWith("data: ")) continue;
                    const payload = line.slice(6);
                    if (payload === "[DONE]") break;
                    try {
                        accumulated += JSON.parse(payload).token;
                        setMessages((prev) => {
                            const updated = [...prev];
                            updated[updated.length - 1] = { role: "assistant", content: accumulated };
                            return updated;
                        });
                    } catch (_) { }
                }
            }
        } catch {
            setMessages((prev) => {
                const u = [...prev];
                u[u.length - 1] = { role: "assistant", content: "⚠️ Connection error. Please try again." };
                return u;
            });
        } finally {
            setStreaming(false);
        }
    }

    const isBlocked = status === "BLOCKED";
    const borderColor = isBlocked ? "border-red-500/30" : "border-amber-500/30";
    const headerBg = isBlocked ? "bg-red-950/30" : "bg-amber-950/30";
    const accentText = isBlocked ? "text-red-400" : "text-amber-400";
    const sendBg = isBlocked
        ? "bg-red-600 hover:bg-red-500"
        : "bg-amber-600 hover:bg-amber-500";

    return (
        <div
            className={`mt-6 flex flex-col rounded-xl border ${borderColor} bg-surface-900 overflow-hidden`}
            style={{ minHeight: "420px" }}
        >
            {/* Header */}
            <div className={`flex items-center gap-3 px-4 py-3 border-b ${borderColor} ${headerBg}`}>
                <Bot className={`h-5 w-5 ${accentText}`} />
                <div className="flex-1">
                    <p className="text-sm font-semibold text-slate-200 flex items-center gap-1.5">
                        Remediation Co-Pilot
                        <Zap className={`h-3 w-3 ${accentText}`} />
                    </p>
                    <p className="text-xs text-slate-500">
                        Context-aware for{" "}
                        <span className="font-mono text-slate-400">{packageName}</span>
                    </p>
                </div>
                {streaming && (
                    <span className="flex items-center gap-1 text-xs text-slate-500">
                        <span className="h-1.5 w-1.5 rounded-full bg-slate-500 animate-pulse inline-block" />
                        Thinking…
                    </span>
                )}
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {messages.length === 0 && (
                    <div className="space-y-2 pt-1">
                        <p className="text-xs text-slate-500 text-center">
                            Ask anything about this blocked package or how to migrate.
                        </p>
                        {STARTER_PROMPTS.map((p) => (
                            <button
                                key={p}
                                onClick={() => send(p)}
                                className="w-full text-left text-xs text-slate-400 bg-surface-800/60
                           hover:bg-surface-700/80 border border-surface-600 rounded-lg
                           px-3 py-2.5 transition-all"
                            >
                                {p}
                            </button>
                        ))}
                    </div>
                )}
                {messages.map((msg, i) => (
                    <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                        {msg.role === "assistant" && (
                            <Bot className={`h-4 w-4 mr-2 mt-1 shrink-0 ${accentText}`} />
                        )}
                        <div
                            className={`max-w-[85%] rounded-xl px-3.5 py-2.5 text-xs leading-relaxed whitespace-pre-wrap ${msg.role === "user"
                                    ? "bg-slate-700 text-slate-100 rounded-tr-sm"
                                    : "bg-surface-800 text-slate-200 border border-surface-600 rounded-tl-sm"
                                }`}
                        >
                            {msg.content ||
                                (streaming && i === messages.length - 1 ? (
                                    <span className="inline-block w-1.5 h-3 bg-slate-400 animate-pulse rounded-sm align-middle" />
                                ) : "")}
                        </div>
                    </div>
                ))}
                <div ref={bottomRef} />
            </div>

            {/* Input */}
            <div className="border-t border-surface-600/60 px-3 py-3 flex gap-2">
                <input
                    className="flex-1 text-xs bg-surface-800 border border-surface-600 rounded-lg
                     px-3 py-2 text-slate-200 placeholder-slate-500 focus:outline-none
                     focus:ring-1 focus:ring-slate-500 disabled:opacity-40"
                    placeholder="Ask about this vulnerability or migration…"
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && send()}
                    disabled={streaming}
                />
                <button
                    onClick={() => send()}
                    disabled={streaming || !input.trim()}
                    className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg
                      text-white transition-all disabled:opacity-40 disabled:cursor-not-allowed ${sendBg}`}
                >
                    <Send className="h-3.5 w-3.5" />
                </button>
            </div>
        </div>
    );
}