import { useEffect, useState, type CSSProperties } from 'react';
import { api, ApiError } from '../../api/client';
import type { TeamDeck } from '../../api/types';
import type { Theme } from '../../theme/themes';
import { accentGradient } from '../../theme/themes';
import { useResponsive } from '../../hooks/useMediaQuery';
import { useAuth } from '../../auth/AuthContext';
import { TeamStudyGame } from './TeamStudyGame';

// The Team Study Games hub: a team's own quizzes. Any member builds a deck
// (AI-generated from a topic, or from an uploaded file); the whole team plays it
// with the same mechanics as the Series 65 game. The public demo sees this
// read-only, plus one neutral sample deck it can play.
const MAX_FILE_CHARS = 100_000;

export function TeamStudyDecks({ theme }: { theme: Theme }) {
  const { isPhone } = useResponsive();
  const { user } = useAuth();
  const readOnly = !!user?.isDemo;
  const accentGrad = accentGradient(theme);
  const muted = '#a99ff0';

  const [decks, setDecks] = useState<TeamDeck[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [playing, setPlaying] = useState<string | null>(null);
  const [composerOpen, setComposerOpen] = useState(false);

  useEffect(() => {
    let alive = true;
    api
      .studyDecks()
      .then((r) => {
        if (alive) {
          setDecks(r.decks);
          setLoading(false);
        }
      })
      .catch(() => {
        if (alive) {
          setLoadError(true);
          setLoading(false);
        }
      });
    return () => {
      alive = false;
    };
  }, []);

  async function remove(id: string) {
    try {
      const r = await api.deleteStudyDeck(id);
      setDecks(r.decks);
    } catch {
      /* best-effort */
    }
  }

  if (playing) {
    return <TeamStudyGame theme={theme} deckId={playing} onBack={() => setPlaying(null)} />;
  }

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', color: '#eef3ff', animation: 'fadeIn .25s ease' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', marginBottom: 16 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 19, fontWeight: 700, color: '#fff' }}>Team Study Games</h2>
          <p style={{ margin: '5px 0 0', fontSize: 12.5, color: muted }}>
            Your team’s own quizzes. Everyone on your team can play them and climb the leaderboard.
          </p>
        </div>
        {!readOnly && (
          <button onClick={() => setComposerOpen((v) => !v)} style={primaryBtn(theme, accentGrad)}>
            {composerOpen ? 'Close' : '✦ New study game'}
          </button>
        )}
      </div>

      {composerOpen && !readOnly && (
        <DeckComposer
          theme={theme}
          onCreated={(decks, newId) => {
            setDecks(decks);
            setComposerOpen(false);
            setPlaying(newId);
          }}
        />
      )}

      {loading ? (
        <div style={{ ...card(theme), color: muted, fontSize: 13 }}>Loading your team’s study games…</div>
      ) : loadError ? (
        <div style={{ ...card(theme), color: '#ffb4ab', fontSize: 13 }}>
          Couldn’t load your team’s study games. Try again in a moment.
        </div>
      ) : decks.length === 0 ? (
        <div style={{ ...card(theme), textAlign: 'center' }}>
          <div style={{ fontSize: 28, marginBottom: 8 }}>🎓</div>
          <div style={{ fontSize: 14, fontWeight: 700, color: '#fff', marginBottom: 6 }}>No study games yet</div>
          <div style={{ fontSize: 12.5, color: muted, maxWidth: 420, margin: '0 auto', lineHeight: 1.55 }}>
            {readOnly
              ? 'A team builds its own study games here — AI-generated from a topic, or from an uploaded file.'
              : 'Build your first one: have AI generate questions from a topic, or upload a text file of your own questions or notes.'}
          </div>
          {!readOnly && (
            <button onClick={() => setComposerOpen(true)} style={{ ...primaryBtn(theme, accentGrad), marginTop: 16 }}>
              ✦ New study game
            </button>
          )}
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: isPhone ? '1fr' : '1fr 1fr', gap: 12 }}>
          {decks.map((d) => (
            <DeckCard
              key={d.id}
              deck={d}
              theme={theme}
              muted={muted}
              readOnly={readOnly}
              canDelete={!readOnly && (d.createdBy === user?.id || user?.roles.includes('admin') === true)}
              onPlay={() => setPlaying(d.id)}
              onDelete={() => remove(d.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function DeckCard({
  deck,
  theme,
  muted,
  readOnly,
  canDelete,
  onPlay,
  onDelete,
}: {
  deck: TeamDeck;
  theme: Theme;
  muted: string;
  readOnly: boolean;
  canDelete: boolean;
  onPlay: () => void;
  onDelete: () => void;
}) {
  const [confirm, setConfirm] = useState(false);
  const sourceLabel = deck.source === 'ai_topic' ? 'AI-generated' : deck.source === 'upload' ? 'From a file' : 'Sample';
  return (
    <div style={card(theme)}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
        <h3 style={{ margin: 0, fontSize: 15.5, fontWeight: 700, color: '#fff', lineHeight: 1.3 }}>{deck.name}</h3>
        <span style={{ flex: 'none', fontSize: 9.5, fontWeight: 700, letterSpacing: '0.5px', textTransform: 'uppercase', color: theme.accent, border: `1px solid ${theme.accent}`, borderRadius: 5, padding: '2px 6px' }}>
          {sourceLabel}
        </span>
      </div>
      {deck.description && (
        <p style={{ margin: '6px 0 0', fontSize: 12, color: '#d7ccff', lineHeight: 1.5, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
          {deck.description}
        </p>
      )}
      <div style={{ fontSize: 11, color: muted, marginTop: 8 }}>
        {deck.questionCount} question{deck.questionCount === 1 ? '' : 's'}
        {deck.categories.length > 0 && ` · ${deck.categories.slice(0, 3).join(' · ')}`}
        {deck.createdByName && ` · by ${deck.createdByName}`}
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
        <button onClick={onPlay} disabled={deck.questionCount === 0} style={{ ...primaryBtn(theme, accentGradient(theme)), minHeight: 38, opacity: deck.questionCount === 0 ? 0.6 : 1 }}>
          Play
        </button>
        {canDelete && !confirm && (
          <button onClick={() => setConfirm(true)} style={ghostBtn(theme)}>
            Delete
          </button>
        )}
        {canDelete && confirm && (
          <>
            <button onClick={onDelete} style={{ ...ghostBtn(theme), borderColor: '#ef5468', color: '#ff9a9a' }}>
              Confirm delete
            </button>
            <button onClick={() => setConfirm(false)} style={ghostBtn(theme)}>
              Cancel
            </button>
          </>
        )}
        {readOnly && <span style={{ fontSize: 11, color: muted, alignSelf: 'center' }}>Demo · progress isn’t saved</span>}
      </div>
    </div>
  );
}

type Mode = 'ai' | 'file';

function DeckComposer({
  theme,
  onCreated,
}: {
  theme: Theme;
  onCreated: (decks: TeamDeck[], newId: string) => void;
}) {
  const accentGrad = accentGradient(theme);
  const muted = '#a99ff0';
  const [mode, setMode] = useState<Mode>('ai');
  const [name, setName] = useState('');
  const [topic, setTopic] = useState('');
  const [instructions, setInstructions] = useState('');
  const [count, setCount] = useState(15);
  const [text, setText] = useState('');
  const [fileName, setFileName] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = () => {
      const raw = typeof reader.result === 'string' ? reader.result : '';
      setText(raw.slice(0, MAX_FILE_CHARS));
      if (!name.trim()) setName(file.name.replace(/\.[^.]+$/, ''));
    };
    reader.readAsText(file);
  }

  const canSubmit =
    !busy && name.trim().length > 0 && (mode === 'ai' ? topic.trim().length > 0 : text.trim().length > 0);

  async function submit() {
    if (!canSubmit) return;
    setBusy(true);
    setError(null);
    try {
      const res =
        mode === 'ai'
          ? await api.generateStudyDeck({
              name: name.trim(),
              topic: topic.trim(),
              instructions: instructions.trim() || undefined,
              count,
            })
          : await api.importStudyDeck({
              name: name.trim(),
              text,
              instructions: instructions.trim() || undefined,
              count,
            });
      onCreated(res.decks, res.deck.id);
    } catch (e) {
      setError(
        e instanceof ApiError
          ? e.status === 503
            ? 'AI isn’t configured yet — an API key needs to be set on the server.'
            : e.message
          : 'Could not build the study game. Please try again.',
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ ...card(theme), marginBottom: 14 }}>
      <div style={{ display: 'inline-flex', border: `1px solid ${theme.navBorder}`, borderRadius: 999, overflow: 'hidden', marginBottom: 12 }}>
        {(['ai', 'file'] as const).map((m) => (
          <button
            key={m}
            onClick={() => setMode(m)}
            style={{
              fontSize: 11.5,
              fontWeight: 600,
              padding: '7px 15px',
              cursor: 'pointer',
              border: 'none',
              background: mode === m ? theme.accent : 'transparent',
              color: mode === m ? theme.accentText : muted,
            }}
          >
            {m === 'ai' ? 'Generate with AI' : 'Upload a file'}
          </button>
        ))}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Study game name — e.g. “Chart Patterns”"
          maxLength={120}
          disabled={busy}
          style={field(theme)}
        />

        {mode === 'ai' ? (
          <>
            <input
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              placeholder="Topic — e.g. “Candlestick reversal patterns”"
              maxLength={200}
              disabled={busy}
              style={field(theme)}
            />
            <textarea
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
              placeholder="Optional: extra instructions (difficulty, focus areas, style)…"
              maxLength={2000}
              rows={2}
              disabled={busy}
              style={{ ...field(theme), resize: 'vertical', minHeight: 52, fontFamily: 'inherit' }}
            />
          </>
        ) : (
          <>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
              <label style={{ ...ghostBtn(theme), display: 'inline-flex', alignItems: 'center', cursor: 'pointer' }}>
                Choose a text file
                <input type="file" accept=".txt,.md,.csv,text/*" onChange={onFile} disabled={busy} style={{ display: 'none' }} />
              </label>
              {fileName && <span style={{ fontSize: 12, color: muted }}>{fileName}</span>}
            </div>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value.slice(0, MAX_FILE_CHARS))}
              placeholder="…or paste your questions or study notes here. AI turns them into a quiz."
              rows={5}
              disabled={busy}
              style={{ ...field(theme), resize: 'vertical', minHeight: 110, fontFamily: 'inherit' }}
            />
            <textarea
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
              placeholder="Optional: instructions for how to build the quiz from this material…"
              maxLength={2000}
              rows={2}
              disabled={busy}
              style={{ ...field(theme), resize: 'vertical', minHeight: 52, fontFamily: 'inherit' }}
            />
          </>
        )}

        <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <label style={{ fontSize: 12, color: muted, display: 'inline-flex', alignItems: 'center', gap: 8 }}>
            {mode === 'ai' ? 'Number of questions' : 'Max questions'}
            <input
              type="number"
              min={1}
              max={50}
              value={count}
              onChange={(e) => setCount(Math.max(1, Math.min(50, Number(e.target.value) || 1)))}
              disabled={busy}
              style={{ ...field(theme), width: 72, padding: '7px 10px' }}
            />
          </label>
          <button onClick={submit} disabled={!canSubmit} style={{ ...primaryBtn(theme, accentGrad), opacity: canSubmit ? 1 : 0.6 }}>
            {busy ? 'Building…' : '✦ Build with AI'}
          </button>
        </div>
        <div style={{ fontSize: 11, color: muted, lineHeight: 1.5 }}>
          AI writes the questions and answer key — review them before your team relies on them.
        </div>
        {error && <div style={{ fontSize: 12, color: '#ffb4ab' }}>{error}</div>}
      </div>
    </div>
  );
}

export function card(theme: Theme): CSSProperties {
  return {
    background: 'linear-gradient(180deg,rgba(40,30,72,.5),rgba(28,20,54,.55))',
    border: `1px solid ${theme.navBorder}`,
    borderRadius: 14,
    padding: '18px 18px',
  };
}

function field(theme: Theme): CSSProperties {
  return {
    background: 'rgba(10,8,26,.6)',
    border: `1px solid ${theme.navBorder}`,
    borderRadius: 8,
    color: '#fff',
    fontSize: 13,
    padding: '9px 12px',
    outline: 'none',
    boxSizing: 'border-box',
  };
}

function primaryBtn(theme: Theme, grad: string): CSSProperties {
  return {
    border: 'none',
    background: grad,
    color: theme.accentText,
    fontSize: 13,
    fontWeight: 700,
    padding: '11px 18px',
    borderRadius: 8,
    cursor: 'pointer',
    minHeight: 44,
  };
}

function ghostBtn(theme: Theme): CSSProperties {
  return {
    border: `1px solid ${theme.navBorder}`,
    background: 'rgba(255,255,255,.05)',
    color: '#cdbcff',
    fontSize: 13,
    fontWeight: 600,
    padding: '11px 16px',
    borderRadius: 8,
    cursor: 'pointer',
    minHeight: 44,
  };
}
