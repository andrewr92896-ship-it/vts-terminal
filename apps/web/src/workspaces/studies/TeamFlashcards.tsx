import { useEffect, useState, type CSSProperties } from 'react';
import { api, ApiError } from '../../api/client';
import type { Flashcard, FlashcardInput, TeamFlashcardSet, TeamFlashcardSetDetail } from '../../api/types';
import type { Theme } from '../../theme/themes';
import { accentGradient } from '../../theme/themes';
import { useResponsive } from '../../hooks/useMediaQuery';
import { useAuth } from '../../auth/AuthContext';
import { card } from './TeamStudyDecks';
import { FlashcardSetPlayer } from './FlashcardSetPlayer';

// The Team Flashcards hub: a team's own term/definition sets. Any member builds
// a set — typed in by hand, AI-generated from a topic, or from an uploaded file
// — and the whole team studies it with the auto-rotate flashcard player. This is
// the generic, self-serve replacement for the old built-in vocabulary deck.
const MAX_FILE_CHARS = 100_000;
const muted = '#a99ff0';

export function TeamFlashcards({ theme }: { theme: Theme }) {
  const { isPhone } = useResponsive();
  const { user } = useAuth();
  const readOnly = !!user?.isDemo;
  const accentGrad = accentGradient(theme);

  const [sets, setSets] = useState<TeamFlashcardSet[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [playing, setPlaying] = useState<string | null>(null);
  const [composerOpen, setComposerOpen] = useState(false);

  useEffect(() => {
    let alive = true;
    api
      .studyFlashcardSets()
      .then((r) => {
        if (alive) {
          setSets(r.sets);
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
      const r = await api.deleteFlashcardSet(id);
      setSets(r.sets);
    } catch {
      /* best-effort */
    }
  }

  if (playing) {
    return <SetPlayer theme={theme} setId={playing} readOnly={readOnly} onBack={() => setPlaying(null)} />;
  }

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', color: '#eef3ff', animation: 'fadeIn .25s ease' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', marginBottom: 16 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 19, fontWeight: 700, color: '#fff' }}>Team Flashcards</h2>
          <p style={{ margin: '5px 0 0', fontSize: 12.5, color: muted }}>
            Your team’s own flashcard sets. Study any set with auto-rotate, topic filters, and “Ask VTS AI”.
          </p>
        </div>
        {!readOnly && (
          <button onClick={() => setComposerOpen((v) => !v)} style={primaryBtn(theme, accentGrad)}>
            {composerOpen ? 'Close' : '✦ New flashcard set'}
          </button>
        )}
      </div>

      {composerOpen && !readOnly && (
        <SetComposer
          theme={theme}
          onCreated={(sets, newId) => {
            setSets(sets);
            setComposerOpen(false);
            setPlaying(newId);
          }}
        />
      )}

      {loading ? (
        <div style={{ ...card(theme), color: muted, fontSize: 13 }}>Loading your team’s flashcard sets…</div>
      ) : loadError ? (
        <div style={{ ...card(theme), color: '#ffb4ab', fontSize: 13 }}>
          Couldn’t load your team’s flashcard sets. Try again in a moment.
        </div>
      ) : sets.length === 0 ? (
        <div style={{ ...card(theme), textAlign: 'center' }}>
          <div style={{ fontSize: 28, marginBottom: 8 }}>🃏</div>
          <div style={{ fontSize: 14, fontWeight: 700, color: '#fff', marginBottom: 6 }}>No flashcard sets yet</div>
          <div style={{ fontSize: 12.5, color: muted, maxWidth: 440, margin: '0 auto', lineHeight: 1.55 }}>
            {readOnly
              ? 'A team builds its own flashcard sets here — typed in, AI-generated from a topic, or from an uploaded file.'
              : 'Build your first one: type the cards in, have AI generate them from a topic, or upload a text file of terms.'}
          </div>
          {!readOnly && (
            <button onClick={() => setComposerOpen(true)} style={{ ...primaryBtn(theme, accentGrad), marginTop: 16 }}>
              ✦ New flashcard set
            </button>
          )}
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: isPhone ? '1fr' : '1fr 1fr', gap: 12 }}>
          {sets.map((s) => (
            <SetCard
              key={s.id}
              set={s}
              theme={theme}
              readOnly={readOnly}
              canDelete={!readOnly && (s.createdBy === user?.id || user?.roles.includes('admin') === true)}
              onStudy={() => setPlaying(s.id)}
              onDelete={() => remove(s.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function SetCard({
  set,
  theme,
  readOnly,
  canDelete,
  onStudy,
  onDelete,
}: {
  set: TeamFlashcardSet;
  theme: Theme;
  readOnly: boolean;
  canDelete: boolean;
  onStudy: () => void;
  onDelete: () => void;
}) {
  const [confirm, setConfirm] = useState(false);
  const sourceLabel =
    set.source === 'ai_topic' ? 'AI-generated' : set.source === 'upload' ? 'From a file' : set.source === 'sample' ? 'Sample' : 'Typed in';
  return (
    <div style={card(theme)}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
        <h3 style={{ margin: 0, fontSize: 15.5, fontWeight: 700, color: '#fff', lineHeight: 1.3 }}>{set.name}</h3>
        <span style={{ flex: 'none', fontSize: 9.5, fontWeight: 700, letterSpacing: '0.5px', textTransform: 'uppercase', color: theme.accent, border: `1px solid ${theme.accent}`, borderRadius: 5, padding: '2px 6px' }}>
          {sourceLabel}
        </span>
      </div>
      {set.description && (
        <p style={{ margin: '6px 0 0', fontSize: 12, color: '#d7ccff', lineHeight: 1.5, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
          {set.description}
        </p>
      )}
      <div style={{ fontSize: 11, color: muted, marginTop: 8 }}>
        {set.cardCount} card{set.cardCount === 1 ? '' : 's'}
        {set.topics.length > 0 && ` · ${set.topics.slice(0, 3).join(' · ')}`}
        {set.createdByName && ` · by ${set.createdByName}`}
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
        <button onClick={onStudy} disabled={set.cardCount === 0} style={{ ...primaryBtn(theme, accentGradient(theme)), minHeight: 38, opacity: set.cardCount === 0 ? 0.6 : 1 }}>
          Study
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

// Loads the full set (cards) then hands off to the auto-rotate player.
function SetPlayer({ theme, setId, readOnly, onBack }: { theme: Theme; setId: string; readOnly: boolean; onBack: () => void }) {
  const [set, setSet] = useState<TeamFlashcardSetDetail | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let alive = true;
    api
      .studyFlashcardSet(setId)
      .then((r) => {
        if (alive) setSet(r.set);
      })
      .catch(() => {
        if (alive) setError(true);
      });
    return () => {
      alive = false;
    };
  }, [setId]);

  return (
    <div style={{ maxWidth: 940, margin: '0 auto', color: '#eef3ff', animation: 'fadeIn .25s ease' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', marginBottom: 16 }}>
        <div style={{ minWidth: 0 }}>
          <button onClick={onBack} style={{ ...ghostBtn(theme), marginBottom: 8 }}>‹ All sets</button>
          <h2 style={{ margin: 0, fontSize: 19, fontWeight: 700, color: '#fff' }}>{set?.name ?? 'Flashcards'}</h2>
          {set && (
            <p style={{ margin: '5px 0 0', fontSize: 12.5, color: muted }}>
              {set.cardCount} card{set.cardCount === 1 ? '' : 's'}
              {set.topics.length > 0 && ` · ${set.topics.length} topic${set.topics.length === 1 ? '' : 's'}`}
            </p>
          )}
        </div>
      </div>
      {error ? (
        <div style={{ ...card(theme), color: '#ffb4ab', fontSize: 13 }}>Couldn’t load that set. Try again in a moment.</div>
      ) : !set ? (
        <div style={{ ...card(theme), color: muted, fontSize: 13 }}>Loading cards…</div>
      ) : (
        <FlashcardSetPlayer theme={theme} setId={set.id} name={set.name} cards={set.cards} readOnly={readOnly} embedded />
      )}
    </div>
  );
}

type Mode = 'manual' | 'ai' | 'file';

function errorText(e: unknown): string {
  if (e instanceof ApiError) {
    if (e.status === 503) return 'AI isn’t configured yet — an API key needs to be set on the server.';
    return e.message;
  }
  return 'Could not build the flashcard set. Please try again.';
}

type Row = { term: string; def: string; topic: string };

function SetComposer({
  theme,
  onCreated,
}: {
  theme: Theme;
  onCreated: (sets: TeamFlashcardSet[], newId: string) => void;
}) {
  const accentGrad = accentGradient(theme);
  const [mode, setMode] = useState<Mode>('manual');
  const [name, setName] = useState('');
  const [topic, setTopic] = useState('');
  const [instructions, setInstructions] = useState('');
  const [count, setCount] = useState(20);
  const [fileText, setFileText] = useState('');
  const [fileName, setFileName] = useState<string | null>(null);
  // Hand-typed rows.
  const [rows, setRows] = useState<Row[]>([
    { term: '', def: '', topic: '' },
    { term: '', def: '', topic: '' },
    { term: '', def: '', topic: '' },
  ]);
  // Cards AI produced from the uploaded file, awaiting confirmation.
  const [preview, setPreview] = useState<Flashcard[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function switchMode(m: Mode) {
    setMode(m);
    setPreview(null);
    setError(null);
  }

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    setPreview(null);
    setError(null);
    const reader = new FileReader();
    reader.onload = () => {
      const raw = typeof reader.result === 'string' ? reader.result : '';
      setFileText(raw.slice(0, MAX_FILE_CHARS));
      if (!name.trim()) setName(file.name.replace(/\.[^.]+$/, ''));
    };
    reader.readAsText(file);
  }

  // ---- Type them in: build directly from the rows, no AI. ----
  const filledRows = rows.filter((r) => r.term.trim() && r.def.trim());
  const canBuildManual = !busy && name.trim().length > 0 && filledRows.length > 0;
  async function buildManual() {
    if (!canBuildManual) return;
    setBusy(true);
    setError(null);
    try {
      const cards: FlashcardInput[] = filledRows.map((r) => ({
        term: r.term.trim(),
        def: r.def.trim(),
        topic: r.topic.trim() || null,
      }));
      const res = await api.createFlashcardSet({ name: name.trim(), source: 'manual', cards });
      onCreated(res.sets, res.set.id);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }

  // ---- AI from a topic: builds and saves in one step. ----
  const canBuildAi = !busy && name.trim().length > 0 && topic.trim().length > 0;
  async function buildAi() {
    if (!canBuildAi) return;
    setBusy(true);
    setError(null);
    try {
      const res = await api.generateFlashcardSet({
        name: name.trim(),
        topic: topic.trim(),
        instructions: instructions.trim() || undefined,
        count,
      });
      onCreated(res.sets, res.set.id);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }

  // ---- Upload a file: AI formats the cards, the author reviews, then confirms. ----
  const canGenerate = !busy && fileText.trim().length > 0;
  async function generatePreview() {
    if (!canGenerate) return;
    setBusy(true);
    setError(null);
    try {
      const res = await api.previewFlashcardSet({ text: fileText, instructions: instructions.trim() || undefined });
      setPreview(res.cards);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }

  const canConfirm = !busy && name.trim().length > 0 && !!preview && preview.length > 0;
  async function confirmCreate() {
    if (!canConfirm || !preview) return;
    setBusy(true);
    setError(null);
    try {
      const res = await api.createFlashcardSet({
        name: name.trim(),
        source: 'upload',
        cards: preview.map((c) => ({ term: c.term, def: c.def, topic: c.topic })),
      });
      onCreated(res.sets, res.set.id);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }

  // The review screen after AI formatted an uploaded file's cards.
  if (mode === 'file' && preview) {
    return (
      <div style={{ ...card(theme), marginBottom: 14 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div>
            <h3 style={{ margin: 0, fontSize: 15.5, fontWeight: 700, color: '#fff' }}>Review the cards</h3>
            <p style={{ margin: '5px 0 0', fontSize: 12.5, color: muted, lineHeight: 1.5 }}>
              AI formatted {preview.length} card{preview.length === 1 ? '' : 's'} from your file. Check them, then create the set.
            </p>
          </div>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Set name — e.g. “Options Greeks”"
            maxLength={120}
            disabled={busy}
            style={field(theme)}
          />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 380, overflowY: 'auto', paddingRight: 4 }}>
            {preview.map((c) => (
              <div key={c.seq} style={{ border: `1px solid ${theme.navBorder}`, borderRadius: 10, padding: '11px 13px', background: 'rgba(10,8,26,.4)' }}>
                {c.topic && (
                  <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '0.4px', textTransform: 'uppercase', color: theme.accent, marginBottom: 4 }}>{c.topic}</div>
                )}
                <div style={{ fontSize: 13.5, color: '#fff', fontWeight: 700, lineHeight: 1.35 }}>{c.term}</div>
                <div style={{ fontSize: 12.5, color: '#d7ccff', lineHeight: 1.5, marginTop: 4 }}>{c.def}</div>
              </div>
            ))}
          </div>
          {error && <div style={{ fontSize: 12, color: '#ffb4ab' }}>{error}</div>}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button onClick={confirmCreate} disabled={!canConfirm} style={{ ...primaryBtn(theme, accentGrad), opacity: canConfirm ? 1 : 0.6 }}>
              {busy ? 'Creating…' : 'Create flashcard set'}
            </button>
            <button onClick={() => { setPreview(null); setError(null); }} disabled={busy} style={ghostBtn(theme)}>
              Back
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ ...card(theme), marginBottom: 14 }}>
      <div style={{ display: 'inline-flex', border: `1px solid ${theme.navBorder}`, borderRadius: 999, overflow: 'hidden', marginBottom: 12, flexWrap: 'wrap' }}>
        {(['manual', 'ai', 'file'] as const).map((m) => (
          <button
            key={m}
            onClick={() => switchMode(m)}
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
            {m === 'manual' ? 'Type them in' : m === 'ai' ? 'Generate with AI' : 'Upload a file'}
          </button>
        ))}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Set name — e.g. “Options Greeks”"
          maxLength={120}
          disabled={busy}
          style={field(theme)}
        />

        {mode === 'manual' ? (
          <>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {rows.map((r, idx) => (
                <div key={idx} style={{ border: `1px solid ${theme.navBorder}`, borderRadius: 10, padding: 10, display: 'flex', flexDirection: 'column', gap: 8, background: 'rgba(10,8,26,.35)' }}>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <input
                      value={r.term}
                      onChange={(e) => setRows((prev) => prev.map((x, i) => (i === idx ? { ...x, term: e.target.value } : x)))}
                      placeholder="Term"
                      maxLength={300}
                      disabled={busy}
                      style={{ ...field(theme), flex: '2 1 200px' }}
                    />
                    <input
                      value={r.topic}
                      onChange={(e) => setRows((prev) => prev.map((x, i) => (i === idx ? { ...x, topic: e.target.value } : x)))}
                      placeholder="Topic (optional)"
                      maxLength={60}
                      disabled={busy}
                      style={{ ...field(theme), flex: '1 1 120px' }}
                    />
                  </div>
                  <textarea
                    value={r.def}
                    onChange={(e) => setRows((prev) => prev.map((x, i) => (i === idx ? { ...x, def: e.target.value } : x)))}
                    placeholder="Definition"
                    maxLength={2000}
                    rows={2}
                    disabled={busy}
                    style={{ ...field(theme), resize: 'vertical', minHeight: 48, fontFamily: 'inherit' }}
                  />
                  {rows.length > 1 && (
                    <button
                      onClick={() => setRows((prev) => prev.filter((_, i) => i !== idx))}
                      disabled={busy}
                      style={{ ...ghostBtn(theme), alignSelf: 'flex-start', minHeight: 34, padding: '6px 12px', color: '#ff9a9a' }}
                    >
                      Remove card
                    </button>
                  )}
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
              <button onClick={() => setRows((prev) => [...prev, { term: '', def: '', topic: '' }])} disabled={busy} style={ghostBtn(theme)}>
                + Add card
              </button>
              <button onClick={buildManual} disabled={!canBuildManual} style={{ ...primaryBtn(theme, accentGrad), opacity: canBuildManual ? 1 : 0.6 }}>
                {busy ? 'Creating…' : `Create set (${filledRows.length})`}
              </button>
            </div>
            <div style={{ fontSize: 11, color: muted, lineHeight: 1.5 }}>
              Type each card’s term and definition. Topic is optional — add topics to enable the study-time topic filter.
            </div>
          </>
        ) : mode === 'ai' ? (
          <>
            <input
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              placeholder="Topic — e.g. “Options Greeks”"
              maxLength={200}
              disabled={busy}
              style={field(theme)}
            />
            <textarea
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
              placeholder="Optional: extra instructions (focus areas, difficulty, style)…"
              maxLength={2000}
              rows={2}
              disabled={busy}
              style={{ ...field(theme), resize: 'vertical', minHeight: 52, fontFamily: 'inherit' }}
            />
            <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
              <label style={{ fontSize: 12, color: muted, display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                Number of cards
                <input
                  type="number"
                  min={1}
                  max={60}
                  value={count}
                  onChange={(e) => setCount(Math.max(1, Math.min(60, Number(e.target.value) || 1)))}
                  disabled={busy}
                  style={{ ...field(theme), width: 72, padding: '7px 10px' }}
                />
              </label>
              <button onClick={buildAi} disabled={!canBuildAi} style={{ ...primaryBtn(theme, accentGrad), opacity: canBuildAi ? 1 : 0.6 }}>
                {busy ? 'Building…' : '✦ Build with AI'}
              </button>
            </div>
            <div style={{ fontSize: 11, color: muted, lineHeight: 1.5 }}>AI writes the term/definition cards — study them right after.</div>
          </>
        ) : (
          <>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
              <label style={{ ...ghostBtn(theme), display: 'inline-flex', alignItems: 'center', cursor: 'pointer', opacity: busy ? 0.6 : 1 }}>
                {fileName ? 'Choose a different file' : 'Choose a text file'}
                <input type="file" accept=".txt,.md,.csv,text/*" onChange={onFile} disabled={busy} style={{ display: 'none' }} />
              </label>
              {fileName && <span style={{ fontSize: 12, color: muted }}>{fileName}</span>}
            </div>
            <textarea
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
              placeholder="Optional: instructions for how to build the cards from this material…"
              maxLength={2000}
              rows={2}
              disabled={busy}
              style={{ ...field(theme), resize: 'vertical', minHeight: 52, fontFamily: 'inherit' }}
            />
            <button onClick={generatePreview} disabled={!canGenerate} style={{ ...primaryBtn(theme, accentGrad), alignSelf: 'flex-start', opacity: canGenerate ? 1 : 0.6 }}>
              {busy ? 'Reading your file…' : '✦ Generate'}
            </button>
            <div style={{ fontSize: 11, color: muted, lineHeight: 1.5 }}>
              Upload a text file (a glossary, notes, or “term - definition” lines) and AI formats the cards. You review them before the set is created.
            </div>
          </>
        )}

        {error && <div style={{ fontSize: 12, color: '#ffb4ab' }}>{error}</div>}
      </div>
    </div>
  );
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
