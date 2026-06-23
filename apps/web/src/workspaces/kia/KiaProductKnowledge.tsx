import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { api, ApiError } from '../../api/client';

const RED = '#BB162B';
const TOPICS = [
  'Telluride towing capacity',
  'EV9 range & charging',
  'Sportage Hybrid MPG',
  'How do I reset the maintenance light?',
  'K4 trim levels',
  'Current Kia incentives to highlight',
];

interface Msg { role: 'user' | 'assistant'; content: string }

export function KiaProductKnowledge() {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, busy]);

  async function send(text: string) {
    const t = text.trim();
    if (!t || busy) return;
    const next: Msg[] = [...messages, { role: 'user', content: t }];
    setMessages(next);
    setInput('');
    setBusy(true);
    setError(null);
    try {
      const { reply } = await api.askKia(next);
      setMessages([...next, { role: 'assistant', content: reply }]);
    } catch (e) {
      setError(e instanceof ApiError ? (e.status === 503 ? 'Claude isn’t configured yet — an API key needs to be set on the server.' : e.message) : 'Request failed');
    } finally {
      setBusy(false);
    }
  }
  function onKey(e: KeyboardEvent<HTMLInputElement>) { if (e.key === 'Enter') { e.preventDefault(); void send(input); } }

  return (
    <div style={{ maxWidth: 860, color: '#eceef0', animation: 'fadeIn .25s ease' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
        <div>
          <h2 style={{ margin: '0 0 4px', fontSize: 19, fontWeight: 700, color: '#fff' }}>Product Knowledge</h2>
          <p style={{ margin: '0 0 14px', fontSize: 12.5, color: '#9aa0a8' }}>
            Claude-powered specs, trims, incentives, and troubleshooting. <span style={{ color: '#e07a86', fontFamily: "'IBM Plex Mono', monospace", fontSize: 11 }}>Sonnet</span>
          </p>
        </div>
        {messages.length > 0 && <button onClick={() => { setMessages([]); setError(null); }} style={{ background: 'none', border: 'none', color: '#9aa0a8', fontSize: 11.5, cursor: 'pointer' }}>Clear</button>}
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 14 }}>
        {TOPICS.map((t) => (
          <button key={t} onClick={() => void send(t)} disabled={busy} style={{ fontSize: 11.5, color: '#e6c4c8', background: 'rgba(187,22,43,.08)', border: '1px solid #3a2329', borderRadius: 16, padding: '7px 13px', cursor: busy ? 'default' : 'pointer' }}>
            {t}
          </button>
        ))}
      </div>

      <div style={{ background: '#15171b', border: '1px solid #2a2d33', borderRadius: 11, overflow: 'hidden', display: 'flex', flexDirection: 'column', height: 460 }}>
        <div ref={scrollRef} style={{ flex: 1, overflowY: 'auto', padding: 18, display: 'flex', flexDirection: 'column', gap: 12 }}>
          {messages.length === 0 && !busy && (
            <div style={{ alignSelf: 'flex-start', maxWidth: '84%', padding: '11px 13px', borderRadius: 10, background: 'rgba(28,31,37,.85)', border: '1px solid #2c2f36' }}>
              <div style={{ fontSize: 9.5, color: '#e07a86', letterSpacing: '0.4px', textTransform: 'uppercase', marginBottom: 4 }}>Claude</div>
              <div style={{ fontSize: 12.5, color: '#e6e8ea', lineHeight: 1.55 }}>Ask me anything about the Kia lineup — specs, towing/payload, EV range & charging, trims, incentives, or troubleshooting. Tap a topic above or type a question.</div>
            </div>
          )}
          {messages.map((m, i) => (
            <div key={i} style={{ alignSelf: m.role === 'user' ? 'flex-end' : 'flex-start', maxWidth: '84%' }}>
              {m.role === 'assistant' && <div style={{ fontSize: 9.5, color: '#e07a86', letterSpacing: '0.4px', textTransform: 'uppercase', marginBottom: 4 }}>Claude</div>}
              <div style={{ fontSize: 12.5, lineHeight: 1.6, whiteSpace: 'pre-wrap', padding: '11px 13px', borderRadius: 10, color: m.role === 'user' ? '#fff' : '#e6e8ea', background: m.role === 'user' ? RED : 'rgba(28,31,37,.85)', border: m.role === 'user' ? 'none' : '1px solid #2c2f36' }}>
                {m.content}
              </div>
            </div>
          ))}
          {busy && <div style={{ alignSelf: 'flex-start', color: '#9aa0a8', fontSize: 12, fontStyle: 'italic' }}>Claude is thinking…</div>}
          {error && <div style={{ color: '#ffb4ab', fontSize: 12.5, background: 'rgba(239,84,104,.1)', border: '1px solid rgba(239,84,104,.4)', borderRadius: 8, padding: '9px 11px' }}>{error}</div>}
        </div>
        <div style={{ padding: '13px 15px', borderTop: '1px solid #25282e', display: 'flex', gap: 9 }}>
          <input value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={onKey} placeholder="Ask about a model, spec, or incentive…" style={{ flex: 1, background: '#0e0f12', border: '1px solid #2c2f36', borderRadius: 7, padding: '11px 13px', color: '#e6e8ea', fontSize: 12.5, outline: 'none' }} />
          <button onClick={() => void send(input)} disabled={busy || !input.trim()} style={{ border: 'none', background: 'linear-gradient(180deg,#BB162B,#8d0f20)', color: '#fff', fontWeight: 600, fontSize: 13, padding: '0 18px', borderRadius: 7, cursor: busy || !input.trim() ? 'default' : 'pointer', opacity: busy || !input.trim() ? 0.5 : 1 }}>Send</button>
        </div>
      </div>
    </div>
  );
}
