import { useState, useRef, useEffect, useCallback, useMemo } from "react";

// ─── Constants ────────────────────────────────────────────────────────────────

const MODELS = [
  { id: "claude-3-5-haiku-20241022", label: "Haiku 3.5",  short: "H3.5",  badge: "FASTEST",  in: 0.80,  out: 4.00,  ctx: 200000, thinking: false },
  { id: "claude-3-7-sonnet-20250219",  label: "Sonnet 3.7",   short: "S3.7",    badge: "BALANCED", in: 3.00,  out: 15.00, ctx: 200000, thinking: true  },
  { id: "claude-3-opus-20240229",           label: "Opus 3",   short: "O3",  badge: "SMARTEST", in: 15.00, out: 75.00, ctx: 200000, thinking: false  },
];

const BUILTIN_SKILLS = [
  { id: "concise",  icon: "⚡", label: "Concise",      prompt: "Be extremely concise. Answer in as few words as possible without losing accuracy. No filler, no preamble, no summary at the end." },
  { id: "coder",    icon: "🖥", label: "Coder",         prompt: "You are an expert software engineer. Write clean, idiomatic, well-commented code. Consider edge cases and error handling. Explain your reasoning briefly." },
  { id: "analyst",  icon: "📊", label: "Analyst",       prompt: "You are a senior data analyst. Structure every answer: (1) Define the problem, (2) Methodology, (3) Findings, (4) Recommendations. Be precise with numbers." },
  { id: "writer",   icon: "✍️", label: "Writer",        prompt: "You are a skilled editor and writer. Prioritize clarity, rhythm, and precision. Avoid passive voice, filler words, and unnecessary hedging." },
  { id: "socratic", icon: "🧠", label: "Socratic",      prompt: "Guide users to answers through questions rather than direct answers. Help them build understanding, not just get solutions." },
  { id: "blunt",    icon: "🎯", label: "Blunt",         prompt: "Be brutally honest and direct. Skip diplomatic softening. State the real answer without sugarcoating." },
  { id: "debug",    icon: "🐛", label: "Debugger",      prompt: "When shown code issues: reproduce → isolate → hypothesize → verify → fix. Walk through each step. Show the fixed code with explanation." },
  { id: "teacher",  icon: "📚", label: "Teacher",       prompt: "Explain from first principles. Use analogies. Build intuition over memorization. Check understanding. Celebrate progress." },
  { id: "security", icon: "🔐", label: "Security",      prompt: "You are a security-focused reviewer. Always highlight potential vulnerabilities, suggest hardening measures, and follow OWASP principles." },
  { id: "prd",      icon: "📋", label: "PM / PRD",      prompt: "You are a senior product manager. Frame answers around user value, business impact, and feasibility. Use structured PRD-style outputs when creating documents." },
];

const SYSTEM_PRESETS = [
  { id: "assistant", label: "Assistant",  prompt: "You are a helpful, accurate, and thoughtful AI assistant." },
  { id: "dev",       label: "Developer",  prompt: "You are an expert full-stack software engineer. Prioritize correctness, clean code, performance, and security. Always explain your reasoning. When writing code, include error handling and consider edge cases." },
  { id: "research",  label: "Researcher", prompt: "You are a rigorous research assistant. Always cite your reasoning. Acknowledge uncertainty, present multiple perspectives, and flag low-confidence claims with [uncertain]." },
  { id: "tutor",     label: "Tutor",      prompt: "You are a patient and encouraging tutor. Adapt to the student's level, use the Socratic method when appropriate, and provide concrete examples. Build understanding step by step." },
  { id: "custom",    label: "Custom",     prompt: "" },
];

const STARTER_PROMPTS = [
  "Explain this code and suggest improvements",
  "What are the tradeoffs between approaches A and B?",
  "Debug this issue step by step",
  "Write a technical breakdown of...",
  "Help me structure my thinking on...",
  "What's wrong with my approach?",
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

const calcCost = (inTok, outTok, modelId) => {
  const m = MODELS.find(x => x.id === modelId) || MODELS[0];
  return (inTok / 1e6) * m.in + (outTok / 1e6) * m.out;
};
const fmtCost = c => {
  if (c === 0) return "$0.0000";
  if (c < 0.0001) return "<$0.0001";
  if (c < 0.01) return `$${c.toFixed(4)}`;
  return `$${c.toFixed(3)}`;
};
const fmtNum = n => (n || 0).toLocaleString();
const genId = () => Math.random().toString(36).slice(2, 9) + Date.now().toString(36);
const fmtTime = ts => new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
const fmtDate = ts => new Date(ts).toLocaleDateString([], { month: "short", day: "numeric" });
const estimateTok = s => Math.ceil((s || "").length / 3.8);

// ─── Icons ────────────────────────────────────────────────────────────────────

const Ic = {
  Send:    () => <svg w="15" h="15" viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>,
  Stop:    () => <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><rect x="5" y="5" width="14" height="14" rx="2"/></svg>,
  Plus:    () => <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>,
  Trash:   () => <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6M9 6V4h6v2"/></svg>,
  Copy:    () => <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>,
  Edit:    () => <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>,
  Regen:   () => <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 11-2.12-9.36L23 10"/></svg>,
  Save:    () => <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>,
  Down:    () => <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>,
  Search:  () => <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>,
  Key:     () => <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 11-7.778 7.778 5.5 5.5 0 017.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4"/></svg>,
  X:       () => <svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>,
  Menu:    () => <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>,
  Chat:    () => <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>,
  Spark:   () => <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>,
  Info:    () => <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>,
};

// ─── Toggle switch ────────────────────────────────────────────────────────────

function Toggle({ on, onChange, disabled }) {
  return (
    <button onClick={() => !disabled && onChange(!on)}
      style={{
        width: 38, height: 20, borderRadius: 10, border: "none",
        background: on ? "#4a9eff" : "#1a2e44",
        cursor: disabled ? "not-allowed" : "pointer",
        position: "relative", transition: "background 0.2s", flexShrink: 0,
        opacity: disabled ? 0.4 : 1,
      }}>
      <div style={{
        position: "absolute", top: 2, left: on ? 20 : 2, width: 16, height: 16,
        borderRadius: "50%", background: "#fff", transition: "left 0.2s",
        boxShadow: "0 1px 4px #0005",
      }}/>
    </button>
  );
}

// ─── Slider field ─────────────────────────────────────────────────────────────

function Slider({ label, value, min, max, step, onChange, display, hint }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}>
        <span style={{ fontSize: 10.5, color: "#4a7090", fontWeight: 700, letterSpacing: "0.5px" }}>{label}</span>
        <span style={{ fontSize: 11, color: "#4a9eff", fontFamily: "monospace" }}>{display || value}</span>
      </div>
      <input type="range" min={min} max={max} step={step} value={value}
        onChange={e => onChange(parseFloat(e.target.value))}
        style={{ width: "100%", accentColor: "#4a9eff", cursor: "pointer", height: 3 }}
      />
      {hint && <div style={{ fontSize: 9.5, color: "#1e3050", marginTop: 2, fontFamily: "monospace" }}>{hint}</div>}
    </div>
  );
}

// ─── Message bubble ───────────────────────────────────────────────────────────

function MsgBubble({ msg, isLast, onRegenerate, onEdit }) {
  const [copied, setCopied] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editText, setEditText] = useState(msg.content);
  const [showThinking, setShowThinking] = useState(false);
  const isUser = msg.role === "user";

  const copy = () => {
    navigator.clipboard.writeText(msg.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  };

  const commitEdit = () => {
    const t = editText.trim();
    if (t && t !== msg.content) onEdit(msg.id, t);
    setEditing(false);
  };

  return (
    <div style={{
      display: "flex", flexDirection: isUser ? "row-reverse" : "row",
      gap: 10, alignItems: "flex-start", marginBottom: 20,
      animation: "fadeUp 0.18s ease-out",
    }}>
      {/* Avatar */}
      <div style={{
        width: 28, height: 28, borderRadius: "50%", flexShrink: 0, marginTop: 2,
        background: isUser
          ? "linear-gradient(135deg, #e8a87c 0%, #e8625e 100%)"
          : "linear-gradient(135deg, #4a9eff 0%, #7c5cfc 100%)",
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: 11, fontWeight: 800, color: "#fff",
        boxShadow: isUser ? "0 0 10px #e8625e30" : "0 0 10px #4a9eff30",
      }}>
        {isUser ? "D" : "C"}
      </div>

      <div style={{ maxWidth: "78%", minWidth: 0, flex: "0 1 auto" }}>
        {/* Thinking block */}
        {msg.thinking && (
          <div style={{ marginBottom: 5 }}>
            <button onClick={() => setShowThinking(s => !s)} style={{
              background: "none", border: "1px solid #1a2e3a", borderRadius: 6,
              padding: "3px 9px", color: "#2a5070", cursor: "pointer",
              fontSize: 10.5, display: "flex", alignItems: "center", gap: 5, fontFamily: "inherit",
            }}>
              💭 {showThinking ? "Hide" : "Show"} thinking ({fmtNum(Math.ceil(msg.thinking.length / 4))} tok)
            </button>
            {showThinking && (
              <div style={{
                marginTop: 4, background: "#080f1a", border: "1px solid #1a2a38",
                borderRadius: 8, padding: "8px 12px", fontSize: 11.5,
                color: "#2a5070", fontFamily: "monospace", lineHeight: 1.6,
                whiteSpace: "pre-wrap", maxHeight: 200, overflowY: "auto",
              }}>
                {msg.thinking}
              </div>
            )}
          </div>
        )}

        {/* Edit mode */}
        {editing ? (
          <div>
            <textarea value={editText} onChange={e => setEditText(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); commitEdit(); } if (e.key === "Escape") setEditing(false); }}
              autoFocus
              style={{
                width: "100%", background: "#0c1828", border: "1px solid #4a9eff",
                borderRadius: 10, padding: "10px 13px", color: "#c8d8ec",
                fontSize: 13.5, lineHeight: 1.65, resize: "vertical",
                fontFamily: "inherit", minHeight: 70, outline: "none",
              }}
            />
            <div style={{ display: "flex", gap: 6, marginTop: 5 }}>
              <button onClick={commitEdit} style={{ background: "#4a9eff", border: "none", borderRadius: 6, padding: "5px 12px", color: "#fff", fontSize: 11.5, cursor: "pointer", fontFamily: "inherit", fontWeight: 600 }}>Save & Resend</button>
              <button onClick={() => setEditing(false)} style={{ background: "#1a2a3a", border: "none", borderRadius: 6, padding: "5px 12px", color: "#5a7090", fontSize: 11.5, cursor: "pointer", fontFamily: "inherit" }}>Cancel</button>
            </div>
          </div>
        ) : (
          <div style={{
            background: isUser ? "#172030" : "#0e1828",
            border: `1px solid ${isUser ? "#253545" : "#162535"}`,
            borderRadius: isUser ? "14px 3px 14px 14px" : "3px 14px 14px 14px",
            padding: "11px 14px",
            color: "#c8d8ec", lineHeight: 1.7,
            whiteSpace: "pre-wrap", wordBreak: "break-word",
            fontFamily: isUser ? "'Syne', sans-serif" : "'Fira Code', monospace",
            fontSize: isUser ? 13.5 : 13,
          }}>
            {msg.content}
            {msg.streaming && (
              <span style={{
                display: "inline-block", width: 7, height: 13,
                background: "#4a9eff", marginLeft: 3, verticalAlign: "text-bottom",
                animation: "blink 0.6s steps(1) infinite", borderRadius: 1,
              }}/>
            )}
          </div>
        )}

        {/* Meta + actions */}
        {!msg.streaming && !editing && (
          <div style={{
            display: "flex", alignItems: "center", gap: 6, marginTop: 3,
            justifyContent: isUser ? "flex-end" : "flex-start",
          }}>
            {msg.timestamp && (
              <span style={{ fontSize: 9.5, color: "#1a3050", fontFamily: "monospace" }}>{fmtTime(msg.timestamp)}</span>
            )}
            {msg.tokens && (
              <span style={{ fontSize: 9.5, color: "#1e3555", fontFamily: "monospace" }}>
                {fmtNum(msg.tokens.in)}↑ {fmtNum(msg.tokens.out)}↓ · {fmtCost(msg.cost)}
              </span>
            )}
            <span style={{ flexGrow: 1 }}/>
            {[
              { icon: copied ? <span style={{fontSize:10}}>✓</span> : <Ic.Copy/>, fn: copy, tip: "Copy", color: copied ? "#4a9eff" : null },
              isUser && { icon: <Ic.Edit/>, fn: () => setEditing(true), tip: "Edit & resend" },
              !isUser && isLast && { icon: <Ic.Regen/>, fn: onRegenerate, tip: "Regenerate" },
            ].filter(Boolean).map((btn, i) => (
              <button key={i} onClick={btn.fn} title={btn.tip}
                style={{
                  background: "none", border: "none",
                  color: btn.color || "#1e3555", cursor: "pointer",
                  padding: "2px 4px", borderRadius: 4, display: "flex", alignItems: "center",
                  transition: "color 0.15s",
                }}
                onMouseEnter={e => e.currentTarget.style.color = "#4a9eff"}
                onMouseLeave={e => e.currentTarget.style.color = btn.color || "#1e3555"}
              >{btn.icon}</button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Main App ─────────────────────────────────────────────────────────────────

export default function App() {
  // ── Core ──
  const [apiKey, setApiKey]     = useState("");
  const [showKey, setShowKey]   = useState(false);
  const [conversations, setConversations] = useState([]);
  const [activeChatId, setActiveChatId]   = useState(null);
  const [input, setInput]       = useState("");
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState(null);
  const [storageReady, setStorageReady] = useState(false);
  const abortRef = useRef(null);

  // ── Config ──
  const [model, setModel]               = useState(MODELS[0].id);
  const [temperature, setTemperature]   = useState(0.7);
  const [maxTokens, setMaxTokens]       = useState(1024);
  const [topP, setTopP]                 = useState(1.0);
  const [systemPrompt, setSystemPrompt] = useState(SYSTEM_PRESETS[0].prompt);
  const [activeSkills, setActiveSkills] = useState([]);
  const [customSkills, setCustomSkills] = useState([]);
  const [webSearch, setWebSearch]       = useState(false);
  const [thinking, setThinking]         = useState(false);
  const [thinkBudget, setThinkBudget]   = useState(8000);

  // ── UI ──
  const [sidebar, setSidebar]           = useState(true);
  const [configOpen, setConfigOpen]     = useState(true);
  const [configTab, setConfigTab]       = useState("model");
  const [searchQ, setSearchQ]           = useState("");
  const [renamingId, setRenamingId]     = useState(null);
  const [renameText, setRenameText]     = useState("");
  const [modal, setModal]               = useState(null); // "skill" | "export" | "shortcuts"
  const [newSkill, setNewSkill]         = useState({ icon: "🔧", label: "", prompt: "" });
  const inputRef = useRef(null);
  const bottomRef = useRef(null);

  // ── Storage bootstrap ──────────────────────────────────────────────────────

  useEffect(() => {
    (async () => {
      const load = async (key, fallback) => {
        try { const r = await window.storage.get(key); return r ? JSON.parse(r.value) : fallback; }
        catch { return fallback; }
      };
      const key  = await load("apiKey", "");
      const convs = await load("conversations", []);
      const cfg  = await load("config", {});
      if (typeof key === "string") setApiKey(key);
      if (Array.isArray(convs)) {
        setConversations(convs);
        if (convs.length) setActiveChatId(convs[0].id);
      }
      if (cfg.model)         setModel(cfg.model);
      if (cfg.temperature != null) setTemperature(cfg.temperature);
      if (cfg.maxTokens)     setMaxTokens(cfg.maxTokens);
      if (cfg.topP != null)  setTopP(cfg.topP);
      if (cfg.systemPrompt)  setSystemPrompt(cfg.systemPrompt);
      if (cfg.activeSkills)  setActiveSkills(cfg.activeSkills);
      if (cfg.customSkills)  setCustomSkills(cfg.customSkills);
      if (cfg.webSearch != null) setWebSearch(cfg.webSearch);
      setStorageReady(true);
    })();
  }, []);

  const persist = useCallback(async (key, val) => {
    if (!storageReady) return;
    try { await window.storage.set(key, JSON.stringify(val)); } catch {}
  }, [storageReady]);

  const persistConvs = useCallback((convs) => persist("conversations", convs), [persist]);

  const persistConfig = useCallback((patch = {}) => {
    persist("config", { model, temperature, maxTokens, topP, systemPrompt, activeSkills, customSkills, webSearch, ...patch });
  }, [model, temperature, maxTokens, topP, systemPrompt, activeSkills, customSkills, webSearch, persist]);

  // ── Derived ────────────────────────────────────────────────────────────────

  const activeChat    = useMemo(() => conversations.find(c => c.id === activeChatId), [conversations, activeChatId]);
  const allSkills     = useMemo(() => [...BUILTIN_SKILLS, ...customSkills], [customSkills]);
  const selModel      = useMemo(() => MODELS.find(m => m.id === model) || MODELS[0], [model]);

  const effectiveSystem = useCallback(() => {
    const skillTexts = activeSkills.map(id => allSkills.find(s => s.id === id)?.prompt).filter(Boolean);
    return [systemPrompt, ...skillTexts].filter(Boolean).join("\n\n");
  }, [systemPrompt, activeSkills, allSkills]);

  const ctxUsed = useMemo(() => {
    if (!activeChat) return 0;
    return estimateTok(effectiveSystem()) + activeChat.messages.reduce((a, m) => a + estimateTok(m.content), 0);
  }, [activeChat, effectiveSystem]);

  const ctxPct = Math.min(100, (ctxUsed / selModel.ctx) * 100);

  const sessionStats = useMemo(() => {
    if (!activeChat) return { in: 0, out: 0, cost: 0, msgs: 0 };
    return activeChat.messages.reduce((a, m) => ({
      in: a.in + (m.tokens?.in || 0),
      out: a.out + (m.tokens?.out || 0),
      cost: a.cost + (m.cost || 0),
      msgs: a.msgs + 1,
    }), { in: 0, out: 0, cost: 0, msgs: 0 });
  }, [activeChat]);

  const allTimeStats = useMemo(() => conversations.reduce((a, c) => ({
    msgs:   a.msgs + c.messages.length,
    cost:   a.cost + c.messages.reduce((x, m) => x + (m.cost || 0), 0),
    tokens: a.tokens + c.messages.reduce((x, m) => x + (m.tokens?.in || 0) + (m.tokens?.out || 0), 0),
  }), { msgs: 0, cost: 0, tokens: 0 }), [conversations]);

  const displayedMsgs = useMemo(() => {
    if (!activeChat) return [];
    if (!searchQ) return activeChat.messages;
    const q = searchQ.toLowerCase();
    return activeChat.messages.filter(m => m.content.toLowerCase().includes(q));
  }, [activeChat, searchQ]);

  // ── Scroll ─────────────────────────────────────────────────────────────────

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [displayedMsgs.length]);

  // ── Conversation CRUD ──────────────────────────────────────────────────────

  const newChat = useCallback(() => {
    const chat = { id: genId(), title: "New Chat", messages: [], createdAt: Date.now() };
    const updated = [chat, ...conversations];
    setConversations(updated);
    setActiveChatId(chat.id);
    persistConvs(updated);
    setError(null);
  }, [conversations, persistConvs]);

  const deleteChat = useCallback((id, e) => {
    e?.stopPropagation();
    const updated = conversations.filter(c => c.id !== id);
    setConversations(updated);
    persistConvs(updated);
    if (activeChatId === id) setActiveChatId(updated[0]?.id || null);
  }, [conversations, activeChatId, persistConvs]);

  const mutateConvs = useCallback((chatId, fn) => {
    setConversations(prev => {
      const updated = prev.map(c => c.id === chatId ? fn(c) : c);
      persistConvs(updated);
      return updated;
    });
  }, [persistConvs]);

  // ── Send to API ────────────────────────────────────────────────────────────

  const sendToApi = useCallback(async (chatId, displayMsgsBefore, apiMsgs) => {
    if (!apiKey.trim()) { setError("Enter your Anthropic API key in the Config panel."); return; }
    setLoading(true); setError(null);

    const asstId = genId();
    const asstPlaceholder = { id: asstId, role: "assistant", content: "", streaming: true, timestamp: Date.now() };

    // Set state to displayMsgsBefore + placeholder
    setConversations(prev => {
      const updated = prev.map(c => c.id === chatId
        ? { ...c, messages: [...displayMsgsBefore, asstPlaceholder] }
        : c
      );
      return updated; // don't persist yet (streaming)
    });

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const sys = effectiveSystem();
      const body = {
        model,
        max_tokens: maxTokens,
        temperature: thinking ? 1 : temperature,
        stream: true,
        messages: apiMsgs,
      };
      if (sys) body.system = sys;
      if (topP < 1.0) body.top_p = topP;
      if (webSearch) body.tools = [{ type: "web_search_20250305", name: "web_search" }];
      if (thinking && selModel.thinking) body.thinking = { type: "enabled", budget_tokens: thinkBudget };

      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
          "anthropic-dangerous-direct-browser-access": "true",
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        throw new Error(e?.error?.message || `API error ${res.status}`);
      }

      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let txt = "", thinkTxt = "", buf = "";
      let inTok = 0, outTok = 0;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop() || "";
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const raw = line.slice(6).trim();
          if (raw === "[DONE]") continue;
          try {
            const ev = JSON.parse(raw);
            if (ev.type === "content_block_delta") {
              if (ev.delta?.type === "text_delta")    { txt += ev.delta.text; }
              if (ev.delta?.type === "thinking_delta") { thinkTxt += ev.delta.thinking; }
            }
            if (ev.type === "message_start" && ev.message?.usage) inTok = ev.message.usage.input_tokens;
            if (ev.type === "message_delta" && ev.usage)           outTok = ev.usage.output_tokens;
            // Stream partial text
            if (ev.delta?.type === "text_delta" || ev.delta?.type === "thinking_delta") {
              setConversations(prev => prev.map(c => c.id === chatId
                ? { ...c, messages: c.messages.map(m => m.id === asstId ? { ...m, content: txt, thinking: thinkTxt || undefined } : m) }
                : c
              ));
            }
          } catch {}
        }
      }

      const cost = calcCost(inTok, outTok, model);
      const final = { streaming: false, content: txt, cost, tokens: { in: inTok, out: outTok }, thinking: thinkTxt || undefined };

      setConversations(prev => {
        const updated = prev.map(c => c.id === chatId
          ? { ...c, messages: c.messages.map(m => m.id === asstId ? { ...m, ...final } : m) }
          : c
        );
        persistConvs(updated);
        return updated;
      });

    } catch (e) {
      if (e.name === "AbortError") {
        // Finalize stopped stream
        setConversations(prev => {
          const updated = prev.map(c => c.id === chatId
            ? { ...c, messages: c.messages.map(m => m.id === asstId ? { ...m, streaming: false, content: (m.content || "") + " ·· [stopped]" } : m) }
            : c
          );
          persistConvs(updated);
          return updated;
        });
      } else {
        setConversations(prev => prev.map(c => c.id === chatId
          ? { ...c, messages: c.messages.filter(m => m.id !== asstId) }
          : c
        ));
        setError(e.message);
      }
    } finally {
      setLoading(false);
      abortRef.current = null;
    }
  }, [apiKey, model, maxTokens, temperature, topP, thinking, thinkBudget, webSearch, selModel, effectiveSystem, persistConvs]);

  // ── User actions ───────────────────────────────────────────────────────────

  const send = useCallback(async () => {
    const text = input.trim();
    if (!text || loading) return;

    let chatId = activeChatId;
    let currentConvs = conversations;

    // Create chat if none active
    if (!chatId) {
      const chat = { id: genId(), title: text.slice(0, 50), messages: [], createdAt: Date.now() };
      currentConvs = [chat, ...conversations];
      chatId = chat.id;
      setConversations(currentConvs);
      setActiveChatId(chatId);
    }

    setInput("");
    inputRef.current && (inputRef.current.style.height = "auto");

    const userMsg = { id: genId(), role: "user", content: text, timestamp: Date.now() };
    const chatMsgs = currentConvs.find(c => c.id === chatId)?.messages || [];
    const newMsgs  = [...chatMsgs, userMsg];

    // Auto-title on first message
    if (chatMsgs.length === 0) {
      setConversations(prev => prev.map(c => c.id === chatId ? { ...c, title: text.slice(0, 50) + (text.length > 50 ? "…" : "") } : c));
    }

    const apiMsgs = newMsgs.map(m => ({ 
      role: m.role, 
      content: m.content ? m.content : (m.thinking ? "*(Thinking process)*" : " ")
    }));

    await sendToApi(chatId, newMsgs, apiMsgs);
  }, [input, loading, activeChatId, conversations, sendToApi]);

  const regenerate = useCallback(() => {
    if (!activeChat || loading) return;
    const msgs = activeChat.messages;
    if (msgs.length < 2) return;
    const withoutLast = msgs.slice(0, -1); // remove last assistant
    const apiMsgs = withoutLast.map(m => ({ role: m.role, content: m.content ? m.content : (m.thinking ? "*(Thinking process)*" : " ") }));
    sendToApi(activeChatId, withoutLast, apiMsgs);
  }, [activeChat, activeChatId, loading, sendToApi]);

  const editMessage = useCallback((msgId, newContent) => {
    if (!activeChat) return;
    const idx = activeChat.messages.findIndex(m => m.id === msgId);
    if (idx < 0) return;
    const newUserMsg = { id: genId(), role: "user", content: newContent, timestamp: Date.now() };
    const before = activeChat.messages.slice(0, idx);
    const newMsgs = [...before, newUserMsg];
    const apiMsgs = newMsgs.map(m => ({ role: m.role, content: m.content ? m.content : (m.thinking ? "*(Thinking process)*" : " ") }));
    sendToApi(activeChatId, newMsgs, apiMsgs);
  }, [activeChat, activeChatId, sendToApi]);

  // ── Skills ─────────────────────────────────────────────────────────────────

  const toggleSkill = (id) => {
    const updated = activeSkills.includes(id) ? activeSkills.filter(s => s !== id) : [...activeSkills, id];
    setActiveSkills(updated);
    persistConfig({ activeSkills: updated });
  };

  const addCustomSkill = () => {
    if (!newSkill.label.trim() || !newSkill.prompt.trim()) return;
    const s = { ...newSkill, id: genId(), label: newSkill.label.trim(), prompt: newSkill.prompt.trim(), builtin: false };
    const updated = [...customSkills, s];
    setCustomSkills(updated);
    persistConfig({ customSkills: updated });
    setNewSkill({ icon: "🔧", label: "", prompt: "" });
    setModal(null);
  };

  const deleteSkill = (id) => {
    const updated = customSkills.filter(s => s.id !== id);
    setCustomSkills(updated);
    setActiveSkills(prev => prev.filter(s => s !== id));
    persistConfig({ customSkills: updated });
  };

  // ── Export ─────────────────────────────────────────────────────────────────

  const exportChat = (fmt) => {
    if (!activeChat) return;
    let content, filename, type;
    if (fmt === "json") {
      content = JSON.stringify({ ...activeChat, exportedAt: new Date().toISOString() }, null, 2);
      filename = `${activeChat.title}.json`;
      type = "application/json";
    } else {
      const lines = [
        `# ${activeChat.title}`,
        `*Model: ${model} | Created: ${fmtDate(activeChat.createdAt)} | Cost: ${fmtCost(sessionStats.cost)}*`,
        "", "---", "",
      ];
      activeChat.messages.forEach(m => {
        lines.push(`### ${m.role === "user" ? "You" : "Claude"} — ${fmtTime(m.timestamp || 0)}`);
        lines.push(m.content);
        if (m.tokens) lines.push(`\n> ${fmtNum(m.tokens.in)}↑ ${fmtNum(m.tokens.out)}↓ · ${fmtCost(m.cost)}`);
        lines.push("");
      });
      content = lines.join("\n");
      filename = `${activeChat.title}.md`;
      type = "text/markdown";
    }
    const url = URL.createObjectURL(new Blob([content], { type }));
    Object.assign(document.createElement("a"), { href: url, download: filename }).click();
    URL.revokeObjectURL(url);
    setModal(null);
  };

  // ── Keyboard ───────────────────────────────────────────────────────────────

  const handleKey = (e) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }
  };

  useEffect(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") { e.preventDefault(); newChat(); }
      if ((e.metaKey || e.ctrlKey) && e.key === "/") { e.preventDefault(); setConfigOpen(s => !s); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [newChat]);

  // ── Render helpers ─────────────────────────────────────────────────────────

  const TabBtn = ({ id, label, icon }) => (
    <button onClick={() => setConfigTab(id)} style={{
      background: configTab === id ? "#0c1e38" : "none",
      border: `1px solid ${configTab === id ? "#4a9eff44" : "transparent"}`,
      color: configTab === id ? "#4a9eff" : "#3a5570",
      borderRadius: 5, padding: "3px 7px", fontSize: 10.5, cursor: "pointer",
      fontFamily: "inherit", fontWeight: 600, letterSpacing: "0.3px",
      transition: "all 0.15s", whiteSpace: "nowrap",
    }}>{icon} {label}</button>
  );

  const Section = ({ title, children }) => (
    <div style={{ marginBottom: 18 }}>
      <div style={{ fontSize: 9.5, color: "#2a4060", fontWeight: 700, letterSpacing: "0.8px", marginBottom: 9, paddingBottom: 5, borderBottom: "1px solid #0c1e30" }}>{title}</div>
      {children}
    </div>
  );

  // ── Main render ────────────────────────────────────────────────────────────

  return (
    <div style={{ height: "100vh", display: "flex", background: "#07111e", fontFamily: "'Syne', 'Segoe UI', sans-serif", color: "#c8d8ec", overflow: "hidden" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Syne:wght@400;600;700;800&family=Fira+Code:wght@400;500&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        ::-webkit-scrollbar { width: 4px; height: 4px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: #1a2e44; border-radius: 2px; }
        ::-webkit-scrollbar-thumb:hover { background: #2a4060; }
        @keyframes fadeUp { from { opacity:0; transform:translateY(7px); } to { opacity:1; transform:translateY(0); } }
        @keyframes blink  { 0%,100%{opacity:1} 50%{opacity:0} }
        @keyframes spin   { to{ transform:rotate(360deg) } }
        @keyframes pulse  { 0%,100%{opacity:.4} 50%{opacity:1} }
        input:focus, textarea:focus, select:focus, button:focus { outline: none; }
        .conv-item { padding: 7px 10px; cursor: pointer; border-left: 2px solid transparent; display: flex; align-items: center; gap: 6px; transition: all 0.1s; }
        .conv-item:hover { background: #0c1e30 !important; }
        .conv-item.active { background: #0c1e30 !important; border-left-color: #4a9eff !important; }
        .skill-btn:hover { border-color: #4a9eff !important; color: #7ac4ff !important; }
        .model-btn:hover { border-color: #4a9eff88 !important; }
        .icon-btn { background: none; border: none; cursor: pointer; color: #1e3555; padding: 3px; border-radius: 4px; display: flex; align-items: center; transition: color 0.15s; }
        .icon-btn:hover { color: #4a9eff !important; }
        .starter-btn:hover { border-color: #4a9eff44 !important; color: #4a9eff !important; }
        input[type=range] { cursor: pointer; }
      `}</style>

      {/* ════════════════ SIDEBAR ════════════════ */}
      {sidebar && (
        <div style={{
          width: 220, background: "#09131f", borderRight: "1px solid #0e1e2e",
          display: "flex", flexDirection: "column", flexShrink: 0,
        }}>
          {/* Header */}
          <div style={{ padding: "12px 10px 10px", borderBottom: "1px solid #0e1e2e" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
              <div style={{ width: 26, height: 26, borderRadius: 8, background: "linear-gradient(135deg,#4a9eff,#7c5cfc)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 800, color: "#fff", boxShadow: "0 0 10px #4a9eff30" }}>C</div>
              <span style={{ fontWeight: 800, fontSize: 13.5, letterSpacing: "-0.5px" }}>Claude Chat</span>
            </div>
            <button onClick={newChat} style={{
              width: "100%", background: "#4a9eff18", border: "1px solid #4a9eff33",
              borderRadius: 7, padding: "7px 10px", color: "#4a9eff",
              cursor: "pointer", fontSize: 11.5, fontFamily: "inherit",
              display: "flex", alignItems: "center", gap: 6, fontWeight: 700,
              transition: "all 0.15s",
            }}
              onMouseEnter={e => e.currentTarget.style.background = "#4a9eff28"}
              onMouseLeave={e => e.currentTarget.style.background = "#4a9eff18"}
            >
              <Ic.Plus/> New Chat <span style={{ marginLeft: "auto", fontSize: 9, color: "#2a6090", fontFamily: "monospace" }}>⌘K</span>
            </button>
          </div>

          {/* Conversation list */}
          <div style={{ flex: 1, overflowY: "auto", padding: "4px 0" }}>
            {conversations.length === 0 ? (
              <div style={{ padding: "24px 12px", textAlign: "center", color: "#1a3050", fontSize: 11.5, lineHeight: 1.6 }}>
                No chats yet.<br/>Press ⌘K or<br/>click New Chat.
              </div>
            ) : conversations.map(conv => (
              <div key={conv.id}
                className={`conv-item${conv.id === activeChatId ? " active" : ""}`}
                onClick={() => { setActiveChatId(conv.id); setError(null); }}
              >
                <span style={{ color: "#2a4060", flexShrink: 0 }}><Ic.Chat/></span>
                {renamingId === conv.id ? (
                  <input value={renameText}
                    onChange={e => setRenameText(e.target.value)}
                    onBlur={() => { mutateConvs(conv.id, c => ({ ...c, title: renameText || c.title })); setRenamingId(null); }}
                    onKeyDown={e => { if (e.key === "Enter") { mutateConvs(conv.id, c => ({ ...c, title: renameText || c.title })); setRenamingId(null); } if (e.key === "Escape") setRenamingId(null); }}
                    style={{ flex: 1, background: "#0c2040", border: "1px solid #4a9eff", borderRadius: 3, color: "#c8d8ec", fontSize: 11, padding: "1px 5px", fontFamily: "inherit", outline: "none" }}
                    autoFocus onClick={e => e.stopPropagation()}
                  />
                ) : (
                  <span
                    style={{ flex: 1, fontSize: 11.5, color: conv.id === activeChatId ? "#a0c0de" : "#3a5870", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                    onDoubleClick={e => { e.stopPropagation(); setRenamingId(conv.id); setRenameText(conv.title); }}
                    title="Double-click to rename"
                  >{conv.title}</span>
                )}
                <button className="icon-btn" onClick={e => deleteChat(conv.id, e)} style={{ flexShrink: 0, opacity: 0.5 }}
                  onMouseEnter={e => { e.currentTarget.style.color="#e87070"; e.currentTarget.style.opacity=1; }}
                  onMouseLeave={e => { e.currentTarget.style.color="#1e3555"; e.currentTarget.style.opacity=0.5; }}
                ><Ic.X/></button>
              </div>
            ))}
          </div>

          {/* Sidebar footer */}
          <div style={{ padding: "8px 10px", borderTop: "1px solid #0e1e2e" }}>
            <div style={{ fontSize: 9.5, color: "#1a3050", fontFamily: "monospace", marginBottom: 2 }}>
              {conversations.length} chats · {fmtNum(allTimeStats.msgs)} msgs
            </div>
            <div style={{ fontSize: 9.5, color: "#1e3555", fontFamily: "monospace" }}>
              All-time cost: {fmtCost(allTimeStats.cost)}
            </div>
          </div>
        </div>
      )}

      {/* ════════════════ MAIN AREA ════════════════ */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", minWidth: 0 }}>

        {/* Top bar */}
        <div style={{ height: 48, background: "#09131f", borderBottom: "1px solid #0e1e2e", display: "flex", alignItems: "center", padding: "0 12px", gap: 8, flexShrink: 0 }}>
          <button className="icon-btn" onClick={() => setSidebar(s => !s)} style={{ color: sidebar ? "#4a9eff" : "#2a4060", padding: "4px 5px" }}><Ic.Menu/></button>

          <div style={{ flex: 1, overflow: "hidden" }}>
            <span style={{ fontSize: 12.5, fontWeight: 600, color: "#6090b0", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {activeChat?.title || "Claude Chat"}
            </span>
          </div>

          {/* Search */}
          <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
            <div style={{ position: "absolute", left: 8, color: "#2a4060", pointerEvents: "none" }}><Ic.Search/></div>
            <input value={searchQ} onChange={e => setSearchQ(e.target.value)}
              placeholder="Search messages…"
              style={{ background: "#0c1828", border: "1px solid #1a2e44", borderRadius: 7, color: "#8ab0cc", fontSize: 11, padding: "4px 10px 4px 24px", fontFamily: "inherit", width: 150 }}
              onFocus={e => e.target.style.borderColor="#2a4e70"}
              onBlur={e => e.target.style.borderColor="#1a2e44"}
            />
            {searchQ && <button onClick={() => setSearchQ("")} className="icon-btn" style={{ position: "absolute", right: 6 }}><Ic.X/></button>}
          </div>

          {/* Actions */}
          {activeChat && (
            <button onClick={() => setModal("export")}
              style={{ background: "none", border: "1px solid #1a2e44", borderRadius: 6, padding: "4px 8px", color: "#3a5570", cursor: "pointer", display: "flex", alignItems: "center", gap: 4, fontSize: 11, fontFamily: "inherit", transition: "all 0.15s" }}
              onMouseEnter={e => { e.currentTarget.style.borderColor="#4a9eff44"; e.currentTarget.style.color="#4a9eff"; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor="#1a2e44"; e.currentTarget.style.color="#3a5570"; }}
            ><Ic.Down/> Export</button>
          )}

          <button onClick={() => setConfigOpen(s => !s)}
            style={{ background: configOpen ? "#0c1e38" : "none", border: `1px solid ${configOpen ? "#4a9eff44" : "#1a2e44"}`, borderRadius: 6, padding: "4px 8px", color: configOpen ? "#4a9eff" : "#3a5570", cursor: "pointer", display: "flex", alignItems: "center", gap: 4, fontSize: 11, fontFamily: "inherit", transition: "all 0.15s" }}
          >⚙ Config <span style={{ fontSize: 9, color: "#2a4060", fontFamily: "monospace" }}>⌘/</span></button>
        </div>

        {/* Context bar */}
        <div style={{ height: 2, background: "#07111e", flexShrink: 0 }}>
          <div title={`Context: ${ctxPct.toFixed(1)}% (${fmtNum(ctxUsed)} / ${fmtNum(selModel.ctx)} tokens)`} style={{
            height: "100%", width: `${ctxPct}%`, transition: "width 0.6s ease",
            background: ctxPct > 85 ? "#e87070" : ctxPct > 60 ? "#e8b070" : "#4a9eff",
            borderRadius: "0 1px 1px 0",
          }}/>
        </div>

        {/* Messages */}
        <div style={{ flex: 1, overflowY: "auto", padding: "24px 5% 10px" }}>
          <div style={{ maxWidth: 800, margin: "0 auto" }}>

            {/* Empty state */}
            {!activeChat && (
              <div style={{ textAlign: "center", marginTop: 80, animation: "fadeUp 0.3s ease-out" }}>
                <div style={{ fontSize: 44, marginBottom: 14, opacity: 0.2 }}>◈</div>
                <div style={{ fontSize: 17, fontWeight: 700, color: "#1e3555", marginBottom: 6 }}>No chat selected</div>
                <div style={{ fontSize: 12, color: "#122030" }}>Press ⌘K or click New Chat in the sidebar</div>
              </div>
            )}

            {activeChat && activeChat.messages.length === 0 && (
              <div style={{ textAlign: "center", marginTop: 60, animation: "fadeUp 0.3s ease-out" }}>
                <div style={{ fontSize: 38, marginBottom: 14, opacity: 0.15 }}>◈</div>
                <div style={{ fontSize: 14, fontWeight: 700, color: "#2a4060", marginBottom: 4 }}>New conversation</div>
                <div style={{ fontSize: 11.5, color: "#1a3050", marginBottom: 24 }}>
                  {selModel.label} · temp {temperature} · {fmtNum(maxTokens)} max tok
                  {activeSkills.length > 0 && ` · ${activeSkills.length} skill${activeSkills.length > 1 ? "s" : ""} active`}
                  {webSearch && " · 🔍 web"}
                  {thinking && " · 💭 thinking"}
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6, justifyContent: "center", maxWidth: 480, margin: "0 auto" }}>
                  {STARTER_PROMPTS.map(s => (
                    <button key={s} className="starter-btn" onClick={() => { setInput(s); inputRef.current?.focus(); }}
                      style={{ background: "#090f1a", border: "1px solid #142030", color: "#2a4862", borderRadius: 7, padding: "6px 11px", fontSize: 11.5, cursor: "pointer", fontFamily: "inherit", transition: "all 0.15s" }}
                    >{s}</button>
                  ))}
                </div>
              </div>
            )}

            {searchQ && displayedMsgs.length === 0 && activeChat && (
              <div style={{ textAlign: "center", padding: "40px 0", color: "#2a4060", fontSize: 13 }}>
                No messages matching <strong>"{searchQ}"</strong>
              </div>
            )}

            {displayedMsgs.map((msg, i) => (
              <MsgBubble
                key={msg.id}
                msg={msg}
                isLast={i === displayedMsgs.length - 1}
                onRegenerate={regenerate}
                onEdit={editMessage}
              />
            ))}

            {/* Error */}
            {error && (
              <div style={{ background: "#160c0c", border: "1px solid #4a1515", borderRadius: 10, padding: "10px 14px", color: "#e87070", fontSize: 12.5, marginBottom: 12, display: "flex", alignItems: "center", gap: 8 }}>
                <Ic.Info/> <span style={{ flex: 1 }}>{error}</span>
                <button className="icon-btn" onClick={() => setError(null)} style={{ color: "#4a2020" }}><Ic.X/></button>
              </div>
            )}
            <div ref={bottomRef}/>
          </div>
        </div>

        {/* Input */}
        <div style={{ background: "#09131f", borderTop: "1px solid #0e1e2e", padding: "10px 5% 12px", flexShrink: 0 }}>
          <div style={{ maxWidth: 800, margin: "0 auto" }}>

            {/* Active skills strip */}
            {activeSkills.length > 0 && (
              <div style={{ display: "flex", gap: 5, marginBottom: 7, flexWrap: "wrap" }}>
                {activeSkills.map(sid => {
                  const sk = allSkills.find(s => s.id === sid);
                  return sk ? (
                    <span key={sid} style={{ background: "#09183a", border: "1px solid #1a3e60", color: "#4a9eff", borderRadius: 4, padding: "2px 7px", fontSize: 10.5, display: "flex", alignItems: "center", gap: 3 }}>
                      {sk.icon} {sk.label}
                      <button onClick={() => toggleSkill(sid)} style={{ background: "none", border: "none", color: "#2a5070", cursor: "pointer", padding: "0 0 0 3px", fontSize: 12, lineHeight: 1, display: "flex", alignItems: "center" }}><Ic.X/></button>
                    </span>
                  ) : null;
                })}
              </div>
            )}

            <div style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
              <div style={{ flex: 1, position: "relative" }}>
                <textarea ref={inputRef} value={input}
                  onChange={e => setInput(e.target.value)}
                  onKeyDown={handleKey}
                  disabled={loading}
                  placeholder={activeChat ? "Message… (↵ send · ⇧↵ newline)" : "Create a chat first with ⌘K"}
                  rows={1}
                  style={{
                    width: "100%", background: "#0b1828", border: "1px solid #1a2e44",
                    borderRadius: 10, padding: "10px 12px", color: "#c8d8ec",
                    fontSize: 13.5, resize: "none", fontFamily: "inherit",
                    lineHeight: 1.55, minHeight: 44, maxHeight: 160,
                    caretColor: "#4a9eff", transition: "border-color 0.2s",
                    opacity: loading ? 0.7 : 1,
                  }}
                  onInput={e => { e.target.style.height = "auto"; e.target.style.height = Math.min(e.target.scrollHeight, 160) + "px"; }}
                  onFocus={e => e.target.style.borderColor = "#2a4e70"}
                  onBlur={e => e.target.style.borderColor = "#1a2e44"}
                />
                {input.length > 10 && (
                  <div style={{ position: "absolute", bottom: 5, right: 10, fontSize: 9, color: "#1a3050", fontFamily: "monospace", pointerEvents: "none" }}>
                    ~{fmtNum(estimateTok(input))} tok
                  </div>
                )}
              </div>

              {loading ? (
                <button onClick={() => abortRef.current?.abort()} title="Stop generation" style={{
                  width: 44, height: 44, background: "#1e0808", border: "1px solid #5a2020",
                  borderRadius: 10, cursor: "pointer", color: "#e87070",
                  display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
                  transition: "all 0.15s",
                }}
                  onMouseEnter={e => e.currentTarget.style.background="#2e1010"}
                  onMouseLeave={e => e.currentTarget.style.background="#1e0808"}
                >
                  <Ic.Stop/>
                </button>
              ) : (
                <button onClick={send} disabled={!input.trim()} style={{
                  width: 44, height: 44, background: "#4a9eff",
                  border: "none", borderRadius: 10,
                  cursor: input.trim() ? "pointer" : "not-allowed",
                  color: "#fff", display: "flex", alignItems: "center", justifyContent: "center",
                  flexShrink: 0, opacity: input.trim() ? 1 : 0.3,
                  transition: "all 0.15s", boxShadow: input.trim() ? "0 2px 12px #4a9eff33" : "none",
                }}
                  onMouseEnter={e => { if (input.trim()) e.currentTarget.style.background="#3d8ae0"; }}
                  onMouseLeave={e => e.currentTarget.style.background="#4a9eff"}
                >
                  <Ic.Send/>
                </button>
              )}
            </div>

            {/* Footer status */}
            <div style={{ marginTop: 5, display: "flex", justifyContent: "space-between", fontSize: 9.5, color: "#1a3050", fontFamily: "monospace" }}>
              <span>
                {selModel.label}
                {webSearch && " · 🔍"}{thinking && " · 💭"}
                {activeSkills.length > 0 && ` · ${activeSkills.length}sk`}
                {" · "}{fmtCost(calcCost(0, 1000, model))} /1k out
              </span>
              <span style={{ color: ctxPct > 80 ? "#e87070" : "#1a3050" }}>
                ctx {ctxPct.toFixed(1)}% · {fmtNum(ctxUsed)} tok
                {activeChat && sessionStats.msgs > 0 && ` · session ${fmtCost(sessionStats.cost)}`}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* ════════════════ CONFIG PANEL ════════════════ */}
      {configOpen && (
        <div style={{
          width: 280, background: "#09131f", borderLeft: "1px solid #0e1e2e",
          display: "flex", flexDirection: "column", flexShrink: 0, overflow: "hidden",
          animation: "fadeUp 0.15s ease-out",
        }}>
          {/* API Key */}
          <div style={{ padding: "12px 12px 10px", borderBottom: "1px solid #0e1e2e" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 6 }}>
              <Ic.Key/>
              <span style={{ fontSize: 10, color: "#4a7090", fontWeight: 700, letterSpacing: "0.6px" }}>ANTHROPIC API KEY</span>
              {apiKey && <span style={{ marginLeft: "auto", fontSize: 9, color: "#2a7040", background: "#0a1e15", border: "1px solid #1a3025", padding: "1px 5px", borderRadius: 3 }}>✓ SAVED</span>}
            </div>
            <div style={{ display: "flex", gap: 5 }}>
              <input type={showKey ? "text" : "password"} value={apiKey}
                onChange={e => { setApiKey(e.target.value); persist("apiKey", e.target.value); }}
                placeholder="sk-ant-api03-…"
                style={{ flex: 1, background: "#07111e", border: "1px solid #1a2e44", borderRadius: 6, padding: "5px 8px", color: "#90b8d8", fontSize: 11, fontFamily: "monospace" }}
              />
              <button onClick={() => setShowKey(s => !s)} style={{ background: "#0c1e30", border: "1px solid #1a2e44", color: "#3a5570", cursor: "pointer", borderRadius: 5, padding: "4px 7px", fontSize: 10, fontFamily: "inherit", transition: "all 0.15s" }}>
                {showKey ? "hide" : "show"}
              </button>
            </div>
            <div style={{ marginTop: 4, fontSize: 9, color: "#1a2e44" }}>Stored in browser · for personal use only</div>
          </div>

          {/* Tab buttons */}
          <div style={{ padding: "8px 10px 6px", borderBottom: "1px solid #0e1e2e", display: "flex", flexWrap: "wrap", gap: 3 }}>
            <TabBtn id="model"  label="Model"  icon="🤖"/>
            <TabBtn id="params" label="Params" icon="🎛"/>
            <TabBtn id="skills" label="Skills" icon="⚡"/>
            <TabBtn id="system" label="System" icon="📝"/>
            <TabBtn id="tools"  label="Tools"  icon="🔧"/>
            <TabBtn id="stats"  label="Stats"  icon="📊"/>
          </div>

          {/* Tab content */}
          <div style={{ flex: 1, overflowY: "auto", padding: "14px 12px" }}>

            {/* ── MODEL ── */}
            {configTab === "model" && (
              <>
                <Section title="SELECT MODEL">
                  <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                    {MODELS.map(m => (
                      <button key={m.id} className="model-btn" onClick={() => { setModel(m.id); persistConfig({ model: m.id }); }}
                        style={{
                          background: model === m.id ? "#0a1e38" : "#06101a",
                          border: `1px solid ${model === m.id ? "#4a9eff" : "#1a2e44"}`,
                          borderRadius: 8, padding: "9px 11px", cursor: "pointer",
                          display: "flex", justifyContent: "space-between", alignItems: "center",
                          transition: "all 0.15s", fontFamily: "inherit", textAlign: "left",
                        }}
                      >
                        <div>
                          <div style={{ fontSize: 13, fontWeight: 700, color: model === m.id ? "#c8d8ec" : "#3a5570" }}>{m.label}</div>
                          <div style={{ fontSize: 9.5, color: "#2a4060", fontFamily: "monospace", marginTop: 1 }}>${m.in}↑ ${m.out}↓ per M tok</div>
                        </div>
                        <div style={{ textAlign: "right" }}>
                          <div style={{ fontSize: 9, background: model === m.id ? "#0c2040" : "#0a1828", color: "#4a9eff", padding: "2px 6px", borderRadius: 3, fontWeight: 700, letterSpacing: "0.3px" }}>{m.badge}</div>
                          {m.thinking && <div style={{ fontSize: 8.5, color: "#2a5070", marginTop: 2 }}>thinking ✓</div>}
                        </div>
                      </button>
                    ))}
                  </div>
                </Section>

                <Section title="COST CALCULATOR">
                  <div style={{ background: "#06101a", border: "1px solid #1a2e44", borderRadius: 8, padding: "10px 11px", fontFamily: "monospace" }}>
                    {[["1k in + 500 out", calcCost(1000, 500, model)], ["1k in + 2k out", calcCost(1000, 2000, model)], ["10k in + 2k out", calcCost(10000, 2000, model)], ["100k in + 5k out", calcCost(100000, 5000, model)]].map(([label, cost]) => (
                      <div key={label} style={{ display: "flex", justifyContent: "space-between", padding: "3px 0", borderBottom: "1px solid #0c1e2e", fontSize: 10.5 }}>
                        <span style={{ color: "#2a4060" }}>{label}</span>
                        <span style={{ color: "#4a9eff" }}>{fmtCost(cost)}</span>
                      </div>
                    ))}
                  </div>
                </Section>
              </>
            )}

            {/* ── PARAMS ── */}
            {configTab === "params" && (
              <>
                <Section title="GENERATION PARAMETERS">
                  <Slider label="TEMPERATURE" value={temperature} min={0} max={1} step={0.05}
                    onChange={v => { setTemperature(v); persistConfig({ temperature: v }); }}
                    hint="0 = deterministic · 1 = creative"
                  />
                  <Slider label="TOP P" value={topP} min={0.05} max={1} step={0.05}
                    onChange={v => { setTopP(v); persistConfig({ topP: v }); }}
                    hint="nucleus sampling (leave at 1 normally)"
                  />
                  <Slider label="MAX TOKENS" value={maxTokens} min={256} max={8192} step={256}
                    onChange={v => { setMaxTokens(v); persistConfig({ maxTokens: v }); }}
                    display={fmtNum(maxTokens)}
                    hint="max response length"
                  />
                  {thinking && selModel.thinking && (
                    <Slider label="THINKING BUDGET" value={thinkBudget} min={1000} max={20000} step={1000}
                      onChange={v => setThinkBudget(v)}
                      display={fmtNum(thinkBudget)}
                      hint="tokens for reasoning"
                    />
                  )}
                </Section>

                <Section title="ESTIMATED COST / EXCHANGE">
                  <div style={{ background: "#06101a", border: "1px solid #1a2e44", borderRadius: 7, padding: "9px 11px", fontFamily: "monospace" }}>
                    <div style={{ fontSize: 10, color: "#2a4060", marginBottom: 4 }}>~1k input + {fmtNum(maxTokens)} output</div>
                    <div style={{ fontSize: 16, color: "#4a9eff", fontWeight: 600 }}>{fmtCost(calcCost(1000, maxTokens, model))}</div>
                    <div style={{ fontSize: 9, color: "#1a3050", marginTop: 3 }}>vs ~$0.08/msg on Claude.ai Pro</div>
                  </div>
                </Section>
              </>
            )}

            {/* ── SKILLS ── */}
            {configTab === "skills" && (
              <>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                  <span style={{ fontSize: 9.5, color: "#2a4060", fontWeight: 700, letterSpacing: "0.8px" }}>BEHAVIOR SKILLS</span>
                  <button onClick={() => setModal("skill")} style={{
                    background: "#0a1e38", border: "1px solid #1a3e60", color: "#4a9eff",
                    borderRadius: 5, padding: "3px 8px", fontSize: 10, cursor: "pointer",
                    fontFamily: "inherit", display: "flex", alignItems: "center", gap: 3,
                  }}><Ic.Plus/> Custom</button>
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: 3, marginBottom: 12 }}>
                  {allSkills.map(sk => {
                    const on = activeSkills.includes(sk.id);
                    return (
                      <div key={sk.id} style={{ display: "flex", alignItems: "center", gap: 5 }}>
                        <button className="skill-btn" onClick={() => toggleSkill(sk.id)} style={{
                          flex: 1, background: on ? "#0a1e38" : "#06101a",
                          border: `1px solid ${on ? "#4a9eff" : "#1a2e44"}`,
                          color: on ? "#4a9eff" : "#3a5570",
                          borderRadius: 6, padding: "6px 9px", cursor: "pointer",
                          fontSize: 11.5, display: "flex", alignItems: "center", gap: 6,
                          fontFamily: "inherit", transition: "all 0.15s", textAlign: "left",
                        }}>
                          {sk.icon} <span style={{ fontWeight: 600 }}>{sk.label}</span>
                          {!sk.builtin && <span style={{ marginLeft: "auto", fontSize: 9, color: "#2a5070" }}>custom</span>}
                        </button>
                        {!sk.builtin && (
                          <button className="icon-btn" onClick={() => deleteSkill(sk.id)} style={{ color: "#2a3a50" }}
                            onMouseEnter={e => e.currentTarget.style.color="#e87070"}
                            onMouseLeave={e => e.currentTarget.style.color="#2a3a50"}
                          ><Ic.Trash/></button>
                        )}
                      </div>
                    );
                  })}
                </div>

                {activeSkills.length > 0 && (
                  <div style={{ background: "#04090f", border: "1px solid #0e1e2e", borderRadius: 7, padding: "8px 10px" }}>
                    <div style={{ fontSize: 9, color: "#1a3050", fontWeight: 700, letterSpacing: "0.6px", marginBottom: 5 }}>INJECTED SKILL PROMPT</div>
                    <div style={{ fontSize: 10.5, color: "#1a3c58", fontFamily: "monospace", lineHeight: 1.55, maxHeight: 90, overflowY: "auto", whiteSpace: "pre-wrap" }}>
                      {activeSkills.map(id => allSkills.find(s => s.id === id)?.prompt).filter(Boolean).join("\n\n")}
                    </div>
                  </div>
                )}
              </>
            )}

            {/* ── SYSTEM PROMPT ── */}
            {configTab === "system" && (
              <>
                <Section title="PRESETS">
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                    {SYSTEM_PRESETS.filter(p => p.id !== "custom").map(p => (
                      <button key={p.id} onClick={() => { setSystemPrompt(p.prompt); persistConfig({ systemPrompt: p.prompt }); }}
                        style={{
                          background: systemPrompt === p.prompt ? "#0a1e38" : "#06101a",
                          border: `1px solid ${systemPrompt === p.prompt ? "#4a9eff44" : "#1a2e44"}`,
                          color: systemPrompt === p.prompt ? "#4a9eff" : "#3a5570",
                          borderRadius: 5, padding: "3px 9px", fontSize: 11, cursor: "pointer",
                          fontFamily: "inherit", transition: "all 0.15s",
                        }}
                        onMouseEnter={e => { if (systemPrompt !== p.prompt) e.currentTarget.style.borderColor="#4a9eff33"; }}
                        onMouseLeave={e => { if (systemPrompt !== p.prompt) e.currentTarget.style.borderColor="#1a2e44"; }}
                      >{p.label}</button>
                    ))}
                  </div>
                </Section>

                <Section title="SYSTEM PROMPT">
                  <textarea value={systemPrompt}
                    onChange={e => { setSystemPrompt(e.target.value); persistConfig({ systemPrompt: e.target.value }); }}
                    rows={8}
                    style={{
                      width: "100%", background: "#06101a", border: "1px solid #1a2e44",
                      borderRadius: 7, color: "#a8c8e8", fontSize: 11.5, lineHeight: 1.6,
                      padding: "9px 10px", resize: "vertical", fontFamily: "monospace",
                    }}
                    onFocus={e => e.target.style.borderColor="#2a4e70"}
                    onBlur={e => e.target.style.borderColor="#1a2e44"}
                  />
                  <div style={{ fontSize: 10, color: "#1a3050", marginTop: 4, fontFamily: "monospace", textAlign: "right" }}>
                    ~{fmtNum(estimateTok(systemPrompt))} tokens
                  </div>
                </Section>

                {activeSkills.length > 0 && (
                  <Section title="EFFECTIVE SYSTEM (with skills)">
                    <div style={{ background: "#04090f", border: "1px solid #0e1e2e", borderRadius: 7, padding: "8px 10px", fontSize: 10.5, color: "#1a3c58", fontFamily: "monospace", lineHeight: 1.55, maxHeight: 100, overflowY: "auto", whiteSpace: "pre-wrap" }}>
                      {effectiveSystem()}
                    </div>
                  </Section>
                )}
              </>
            )}

            {/* ── TOOLS ── */}
            {configTab === "tools" && (
              <>
                <Section title="TOOLS & FEATURES">
                  {[
                    {
                      label: "Web Search", icon: "🔍", desc: "Claude searches the web for current information",
                      on: webSearch, set: (v) => { setWebSearch(v); persistConfig({ webSearch: v }); },
                    },
                    {
                      label: "Extended Thinking", icon: "💭",
                      desc: selModel.thinking ? `Claude reasons step-by-step before answering (${fmtNum(thinkBudget)} tok budget)` : "Requires Sonnet or Opus model",
                      on: thinking && selModel.thinking, set: (v) => setThinking(v),
                      disabled: !selModel.thinking,
                    },
                  ].map(tool => (
                    <div key={tool.label} style={{
                      background: "#06101a", border: `1px solid ${tool.on ? "#1a3e60" : "#1a2e44"}`,
                      borderRadius: 8, padding: "10px 12px", marginBottom: 8,
                      opacity: tool.disabled ? 0.45 : 1,
                    }}>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
                        <span style={{ fontSize: 12.5, fontWeight: 700, color: tool.on ? "#c8d8ec" : "#3a5570" }}>{tool.icon} {tool.label}</span>
                        <Toggle on={tool.on} onChange={tool.set} disabled={tool.disabled}/>
                      </div>
                      <div style={{ fontSize: 10.5, color: "#2a4060", lineHeight: 1.5 }}>{tool.desc}</div>
                    </div>
                  ))}
                </Section>

                {thinking && selModel.thinking && (
                  <Section title="THINKING SETTINGS">
                    <Slider label="THINKING BUDGET" value={thinkBudget} min={1000} max={20000} step={1000}
                      onChange={v => setThinkBudget(v)}
                      display={fmtNum(thinkBudget) + " tok"}
                      hint={`≈ ${fmtCost(calcCost(0, thinkBudget, model))} cost for reasoning alone`}
                    />
                    <div style={{ fontSize: 10.5, color: "#2a4060", background: "#06101a", border: "1px solid #1a2e44", borderRadius: 7, padding: "8px 10px", lineHeight: 1.55 }}>
                      Temperature is locked to 1.0 when thinking is enabled. Top-p may still be used.
                    </div>
                  </Section>
                )}

                <Section title="KEYBOARD SHORTCUTS">
                  {[["⌘K", "New chat"], ["⌘/", "Toggle config"], ["↵", "Send message"], ["⇧↵", "Newline"]].map(([k, v]) => (
                    <div key={k} style={{ display: "flex", justifyContent: "space-between", padding: "4px 0", borderBottom: "1px solid #0a1828" }}>
                      <span style={{ fontSize: 11, color: "#2a4060" }}>{v}</span>
                      <kbd style={{ fontSize: 10, background: "#0a1828", border: "1px solid #1a2e44", color: "#3a6080", borderRadius: 4, padding: "1px 6px", fontFamily: "monospace" }}>{k}</kbd>
                    </div>
                  ))}
                </Section>
              </>
            )}

            {/* ── STATS ── */}
            {configTab === "stats" && (
              <>
                <Section title="CURRENT CHAT">
                  {[
                    ["Messages",      fmtNum(sessionStats.msgs)],
                    ["Input tokens",  fmtNum(sessionStats.in)],
                    ["Output tokens", fmtNum(sessionStats.out)],
                    ["Total cost",    fmtCost(sessionStats.cost)],
                    ["Avg cost/msg",  sessionStats.msgs > 0 ? fmtCost(sessionStats.cost / sessionStats.msgs) : "—"],
                    ["Context used",  `${ctxPct.toFixed(1)}% (${fmtNum(ctxUsed)} tok)`],
                  ].map(([l, v]) => (
                    <div key={l} style={{ display: "flex", justifyContent: "space-between", padding: "5px 0", borderBottom: "1px solid #0a1828" }}>
                      <span style={{ fontSize: 11.5, color: "#3a5570" }}>{l}</span>
                      <span style={{ fontSize: 11, color: "#4a9eff", fontFamily: "monospace", fontWeight: 600 }}>{v}</span>
                    </div>
                  ))}
                </Section>

                <Section title="ALL TIME">
                  {[
                    ["Total chats",   fmtNum(conversations.length)],
                    ["Total messages", fmtNum(allTimeStats.msgs)],
                    ["Total tokens",  fmtNum(allTimeStats.tokens)],
                    ["Total cost",    fmtCost(allTimeStats.cost)],
                  ].map(([l, v]) => (
                    <div key={l} style={{ display: "flex", justifyContent: "space-between", padding: "5px 0", borderBottom: "1px solid #0a1828" }}>
                      <span style={{ fontSize: 11.5, color: "#2a4060" }}>{l}</span>
                      <span style={{ fontSize: 11, color: "#3a6080", fontFamily: "monospace" }}>{v}</span>
                    </div>
                  ))}
                </Section>

                {/* Clear / Danger zone */}
                <Section title="DANGER ZONE">
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    {activeChat && (
                      <button onClick={() => { if (confirm("Clear messages in this chat?")) mutateConvs(activeChatId, c => ({ ...c, messages: [] })); }}
                        style={{ background: "#160c0c", border: "1px solid #3a1515", color: "#6a2020", borderRadius: 7, padding: "7px 10px", cursor: "pointer", fontFamily: "inherit", fontSize: 11.5, display: "flex", alignItems: "center", gap: 5, transition: "all 0.15s" }}
                        onMouseEnter={e => { e.currentTarget.style.borderColor="#5a2020"; e.currentTarget.style.color="#e87070"; }}
                        onMouseLeave={e => { e.currentTarget.style.borderColor="#3a1515"; e.currentTarget.style.color="#6a2020"; }}
                      ><Ic.Trash/> Clear current chat</button>
                    )}
                    <button onClick={() => { if (confirm("Delete ALL conversations? This cannot be undone.")) { setConversations([]); setActiveChatId(null); persistConvs([]); } }}
                      style={{ background: "#160c0c", border: "1px solid #3a1515", color: "#6a2020", borderRadius: 7, padding: "7px 10px", cursor: "pointer", fontFamily: "inherit", fontSize: 11.5, display: "flex", alignItems: "center", gap: 5, transition: "all 0.15s" }}
                      onMouseEnter={e => { e.currentTarget.style.borderColor="#5a2020"; e.currentTarget.style.color="#e87070"; }}
                      onMouseLeave={e => { e.currentTarget.style.borderColor="#3a1515"; e.currentTarget.style.color="#6a2020"; }}
                    ><Ic.Trash/> Delete all chats</button>
                  </div>
                </Section>
              </>
            )}
          </div>
        </div>
      )}

      {/* ════════════════ MODALS ════════════════ */}

      {/* Skill creator */}
      {modal === "skill" && (
        <div style={{ position: "fixed", inset: 0, background: "#000b", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200 }} onClick={() => setModal(null)}>
          <div style={{ background: "#0b1422", border: "1px solid #1a2e44", borderRadius: 14, padding: 24, width: 400, animation: "fadeUp 0.15s ease-out" }} onClick={e => e.stopPropagation()}>
            <div style={{ fontWeight: 700, fontSize: 15, color: "#8ab0cc", marginBottom: 18 }}>Create Custom Skill</div>

            <div style={{ marginBottom: 13 }}>
              <label style={{ fontSize: 10, color: "#4a7090", display: "block", marginBottom: 6, fontWeight: 700, letterSpacing: "0.5px" }}>ICON</label>
              <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
                {["🔧","🚀","💡","🎨","📈","🔬","⚙️","🗺","🌐","🎯","🧩","🤝","💬","🔁","🧪"].map(ic => (
                  <button key={ic} onClick={() => setNewSkill(s => ({...s, icon: ic}))} style={{
                    background: newSkill.icon === ic ? "#0a1e38" : "#06101a",
                    border: `1px solid ${newSkill.icon === ic ? "#4a9eff" : "#1a2e44"}`,
                    borderRadius: 6, padding: "4px 7px", fontSize: 16, cursor: "pointer",
                  }}>{ic}</button>
                ))}
              </div>
            </div>

            <div style={{ marginBottom: 13 }}>
              <label style={{ fontSize: 10, color: "#4a7090", display: "block", marginBottom: 5, fontWeight: 700, letterSpacing: "0.5px" }}>SKILL NAME</label>
              <input value={newSkill.label} onChange={e => setNewSkill(s => ({...s, label: e.target.value}))}
                placeholder="e.g. Hebrew Translator"
                style={{ width: "100%", background: "#06101a", border: "1px solid #1a2e44", borderRadius: 7, padding: "8px 10px", color: "#c8d8ec", fontSize: 13, fontFamily: "inherit" }}
              />
            </div>

            <div style={{ marginBottom: 18 }}>
              <label style={{ fontSize: 10, color: "#4a7090", display: "block", marginBottom: 5, fontWeight: 700, letterSpacing: "0.5px" }}>INSTRUCTION PROMPT</label>
              <textarea value={newSkill.prompt} onChange={e => setNewSkill(s => ({...s, prompt: e.target.value}))}
                placeholder="e.g. Always respond in Hebrew. Translate any English input to Hebrew before answering. Use formal register."
                rows={4}
                style={{ width: "100%", background: "#06101a", border: "1px solid #1a2e44", borderRadius: 7, padding: "9px 10px", color: "#c8d8ec", fontSize: 12, fontFamily: "monospace", resize: "vertical", lineHeight: 1.6 }}
              />
            </div>

            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={addCustomSkill} disabled={!newSkill.label.trim() || !newSkill.prompt.trim()}
                style={{ flex: 1, background: "#4a9eff", border: "none", borderRadius: 8, padding: "10px", color: "#fff", fontSize: 13, cursor: "pointer", fontFamily: "inherit", fontWeight: 700, opacity: !newSkill.label.trim() || !newSkill.prompt.trim() ? 0.4 : 1, transition: "opacity 0.15s" }}>
                Create Skill
              </button>
              <button onClick={() => setModal(null)} style={{ background: "#1a2e44", border: "none", borderRadius: 8, padding: "10px 14px", color: "#6090b0", fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Export modal */}
      {modal === "export" && (
        <div style={{ position: "fixed", inset: 0, background: "#000b", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200 }} onClick={() => setModal(null)}>
          <div style={{ background: "#0b1422", border: "1px solid #1a2e44", borderRadius: 14, padding: 24, width: 320, animation: "fadeUp 0.15s ease-out" }} onClick={e => e.stopPropagation()}>
            <div style={{ fontWeight: 700, fontSize: 15, color: "#8ab0cc", marginBottom: 5 }}>Export Conversation</div>
            <div style={{ fontSize: 12, color: "#2a4060", marginBottom: 18 }}>{activeChat?.title} · {sessionStats.msgs} messages</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
              {[
                { fmt: "md",   label: "Markdown (.md)",  sub: "Human-readable, good for notes/sharing" },
                { fmt: "json", label: "JSON (.json)",     sub: "Full data with tokens & cost metadata" },
              ].map(opt => (
                <button key={opt.fmt} onClick={() => exportChat(opt.fmt)} style={{
                  background: "#06101a", border: "1px solid #1a3e60",
                  borderRadius: 9, padding: "11px 13px", cursor: "pointer",
                  fontFamily: "inherit", textAlign: "left", display: "flex", alignItems: "center", gap: 10,
                  transition: "all 0.15s",
                }}
                  onMouseEnter={e => e.currentTarget.style.borderColor="#4a9eff44"}
                  onMouseLeave={e => e.currentTarget.style.borderColor="#1a3e60"}
                >
                  <Ic.Down/>
                  <div>
                    <div style={{ fontSize: 12.5, fontWeight: 600, color: "#4a9eff" }}>{opt.label}</div>
                    <div style={{ fontSize: 10.5, color: "#2a5070", marginTop: 2 }}>{opt.sub}</div>
                  </div>
                </button>
              ))}
              <button onClick={() => setModal(null)} style={{ background: "#1a2e44", border: "none", borderRadius: 8, padding: "9px", color: "#6090b0", fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
