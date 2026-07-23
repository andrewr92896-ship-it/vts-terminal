import { useEffect, useState, type CSSProperties } from 'react';
import { api, ApiError } from '../../api/client';
import type { DeckQuestion, TeamDeck } from '../../api/types';
import type { Theme } from '../../theme/themes';
import { accentGradient } from '../../theme/themes';
import { useResponsive } from '../../hooks/useMediaQuery';
import { useAuth } from '../../auth/AuthContext';
import { EditableText, EditableRich } from '../../copy/SiteCopy';
import { DeckEditor } from './DeckEditor';
import { downloadCsv, parseQuestionsCsv, questionsToCsv, questionTemplateCsv } from './studyCsv';

// The team study-game *maker*, shown in Study Creation. Any member builds a deck
// (AI-generated from a topic, or from an uploaded file) and manages the team's
// games here; the games themselves are *played* in the Study Game section. The
// public demo sees this read-only.
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
  const [composerOpen, setComposerOpen] = useState(false);
  const [combineOpen, setCombineOpen] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);

  const isAdmin = user?.roles.includes('admin') === true;
  const canManage = (d: TeamDeck) => !readOnly && (d.createdBy === user?.id || isAdmin);

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

  // The editor takes over the whole section while open.
  if (editing) {
    return (
      <DeckEditor
        theme={theme}
        deckId={editing}
        onClose={(updated) => {
          if (updated) setDecks(updated);
          setEditing(null);
        }}
      />
    );
  }

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', color: '#eef3ff', animation: 'fadeIn .25s ease' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', marginBottom: 16 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 19, fontWeight: 700, color: '#fff' }}>
            <EditableText id="studydecks.title" text="Team Study Games" />
          </h2>
          <p style={{ margin: '5px 0 0', fontSize: 12.5, color: muted }}>
            <EditableRich
              id="studydecks.subtitle"
              text="Build and edit your team’s own quizzes here — play them from the **Study Game** section."
            />
          </p>
        </div>
        {!readOnly && (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {decks.length >= 2 && (
              <button onClick={() => setCombineOpen((v) => !v)} style={ghostBtn(theme)}>
                {combineOpen ? 'Close' : '⧉ Combine games'}
              </button>
            )}
            <button onClick={() => setComposerOpen((v) => !v)} style={primaryBtn(theme, accentGrad)}>
              {composerOpen ? 'Close' : '✦ New study game'}
            </button>
          </div>
        )}
      </div>

      {combineOpen && !readOnly && (
        <CombineGames
          theme={theme}
          decks={decks}
          onCancel={() => setCombineOpen(false)}
          onCombined={(updated, newId) => {
            setDecks(updated);
            setCombineOpen(false);
            setEditing(newId);
          }}
        />
      )}

      {composerOpen && !readOnly && (
        <DeckComposer
          theme={theme}
          onCreated={(decks, newId) => {
            setDecks(decks);
            setComposerOpen(false);
            // Creation and editing live here; playing lives in the Study Game
            // section. Open the new game in the editor so the author can refine it.
            setEditing(newId);
          }}
        />
      )}

      {loading ? (
        <div style={{ ...card(theme), color: muted, fontSize: 13 }}>
          <EditableText id="studydecks.loading" text="Loading your team’s study games…" />
        </div>
      ) : loadError ? (
        <div style={{ ...card(theme), color: '#ffb4ab', fontSize: 13 }}>
          <EditableText id="studydecks.error" text="Couldn’t load your team’s study games. Try again in a moment." />
        </div>
      ) : decks.length === 0 ? (
        <div style={{ ...card(theme), textAlign: 'center' }}>
          <div style={{ fontSize: 28, marginBottom: 8 }}>🎓</div>
          <div style={{ fontSize: 14, fontWeight: 700, color: '#fff', marginBottom: 6 }}>
            <EditableText id="studydecks.empty_title" text="No study games yet" />
          </div>
          <div style={{ fontSize: 12.5, color: muted, maxWidth: 420, margin: '0 auto', lineHeight: 1.55 }}>
            {readOnly
              ? <EditableText id="studydecks.empty_ro" text="A team builds its own study games here — AI-generated from a topic, or from an uploaded file." />
              : <EditableText id="studydecks.empty_rw" text="Build your first one: have AI generate questions from a topic, or upload a text file of your own questions or notes." />}
          </div>
          {!readOnly && (
            <button onClick={() => setComposerOpen(true)} style={{ ...primaryBtn(theme, accentGrad), marginTop: 16 }}>
              <EditableText id="studydecks.empty_btn" text="✦ New study game" />
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
              canManage={canManage(d)}
              onEdit={() => setEditing(d.id)}
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
  canManage,
  onEdit,
  onDelete,
}: {
  deck: TeamDeck;
  theme: Theme;
  muted: string;
  canManage: boolean;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const [confirm, setConfirm] = useState(false);
  const [exporting, setExporting] = useState(false);
  // Built-in example games are code-owned: locked from editing/removal (the
  // server enforces this too), so hide those controls and label them clearly.
  const locked = deck.source === 'baked_in';
  const sourceLabel =
    deck.source === 'ai_topic'
      ? 'AI-generated'
      : deck.source === 'upload'
        ? 'From a file'
        : deck.source === 'merged'
          ? 'Combined'
          : locked
            ? 'Built-in'
            : 'Sample';

  // Export the game to a CSV the team can edit in a spreadsheet and re-import.
  // Fetches the full question set (the list only carries a count).
  async function exportCsv() {
    if (exporting) return;
    setExporting(true);
    try {
      const { deck: full } = await api.studyDeck(deck.id);
      downloadCsv(full.name, questionsToCsv(full.questions));
    } catch {
      /* best-effort */
    } finally {
      setExporting(false);
    }
  }

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
      <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap', alignItems: 'center' }}>
        {canManage && !locked && !confirm && (
          <button onClick={onEdit} style={{ ...primaryBtn(theme, accentGradient(theme)), minHeight: 38 }}>
            Edit
          </button>
        )}
        {canManage && !locked && !confirm && (
          <button onClick={() => setConfirm(true)} style={ghostBtn(theme)}>
            Delete
          </button>
        )}
        {locked && (
          <span style={{ fontSize: 11, color: muted, alignSelf: 'center' }}>
            <EditableText id="studydecks.builtin_note" text="Built-in example — always available" />
          </span>
        )}
        {canManage && confirm && (
          <>
            <button onClick={onDelete} style={{ ...ghostBtn(theme), borderColor: '#ef5468', color: '#ff9a9a' }}>
              Confirm delete
            </button>
            <button onClick={() => setConfirm(false)} style={ghostBtn(theme)}>
              Cancel
            </button>
          </>
        )}
        {!confirm && deck.questionCount > 0 && (
          <button onClick={exportCsv} disabled={exporting} style={{ ...ghostBtn(theme), opacity: exporting ? 0.6 : 1 }}>
            {exporting ? <EditableText id="studydecks.exporting" text="Exporting…" /> : <EditableText id="studydecks.export_csv" text="⭳ Export CSV" />}
          </button>
        )}
        {!canManage && !locked && !confirm && (
          <span style={{ fontSize: 11, color: muted, alignSelf: 'center' }}>Play it in the Study Game section</span>
        )}
      </div>
    </div>
  );
}

// Combine several games into one new game holding all their questions.
function CombineGames({
  theme,
  decks,
  onCancel,
  onCombined,
}: {
  theme: Theme;
  decks: TeamDeck[];
  onCancel: () => void;
  onCombined: (decks: TeamDeck[], newId: string) => void;
}) {
  const accentGrad = accentGradient(theme);
  const muted = '#a99ff0';
  const [name, setName] = useState('');
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [tagSource, setTagSource] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function toggle(id: string) {
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
  const totalQs = decks.filter((d) => picked.has(d.id)).reduce((s, d) => s + d.questionCount, 0);
  const canCombine = !busy && name.trim().length > 0 && picked.size >= 1;

  async function combine() {
    if (!canCombine) return;
    setBusy(true);
    setError(null);
    try {
      const res = await api.mergeStudyDecks({ name: name.trim(), deckIds: [...picked], tagSource });
      onCombined(res.decks, res.deck.id);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ ...card(theme), marginBottom: 14 }}>
      <h3 style={{ margin: '0 0 4px', fontSize: 15.5, fontWeight: 700, color: '#fff' }}>
        <EditableText id="studydecks.combine_title" text="Combine games" />
      </h3>
      <p style={{ margin: '0 0 12px', fontSize: 12.5, color: muted, lineHeight: 1.5 }}>
        <EditableText id="studydecks.combine_blurb" text="Pick the games to merge into one new game with all their questions — great for one massive game across everything." />
      </p>
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="New game name — e.g. “Everything Combined”"
        maxLength={120}
        style={field(theme)}
      />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, margin: '12px 0', maxHeight: 260, overflowY: 'auto' }}>
        {decks.map((d) => {
          const on = picked.has(d.id);
          return (
            <label
              key={d.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '9px 11px',
                borderRadius: 10,
                cursor: 'pointer',
                border: `1px solid ${on ? theme.accent : theme.navBorder}`,
                background: on ? 'rgba(255,255,255,.06)' : 'rgba(255,255,255,.02)',
              }}
            >
              <input type="checkbox" checked={on} onChange={() => toggle(d.id)} style={{ width: 16, height: 16, accentColor: theme.accent }} />
              <span style={{ flex: 1, minWidth: 0, fontSize: 13, color: '#fff', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.name}</span>
              <span style={{ fontSize: 11, color: muted }}>{d.questionCount} q{d.questionCount === 1 ? '' : 's'}</span>
            </label>
          );
        })}
      </div>
      <label style={{ display: 'flex', alignItems: 'center', gap: 9, fontSize: 12.5, color: muted, cursor: 'pointer', marginBottom: 12 }}>
        <input type="checkbox" checked={tagSource} onChange={(e) => setTagSource(e.target.checked)} style={{ width: 16, height: 16, accentColor: theme.accent }} />
        <EditableText id="studydecks.combine_remember" text="Remember which game each question came from (adds an optional “guess the source” mode when playing)" />
      </label>
      {error && <div style={{ fontSize: 12, color: '#ffb4ab', marginBottom: 10 }}>{error}</div>}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <button onClick={combine} disabled={!canCombine} style={{ ...primaryBtn(theme, accentGrad), opacity: canCombine ? 1 : 0.6 }}>
          {busy ? 'Combining…' : `Combine ${picked.size} game${picked.size === 1 ? '' : 's'} · ${totalQs} q${totalQs === 1 ? '' : 's'}`}
        </button>
        <button onClick={onCancel} style={ghostBtn(theme)}>
          <EditableText id="studydecks.combine_cancel" text="Cancel" />
        </button>
      </div>
    </div>
  );
}

type Mode = 'ai' | 'file' | 'csv';

function errorText(e: unknown): string {
  if (e instanceof ApiError) {
    if (e.status === 503) return 'AI isn’t configured yet — an API key needs to be set on the server.';
    return e.message;
  }
  return 'Could not build the study game. Please try again.';
}

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
  const [fileText, setFileText] = useState('');
  const [fileName, setFileName] = useState<string | null>(null);
  // The questions awaiting the author's confirmation — produced by AI from an
  // uploaded file, or parsed directly from a CSV. Null while still composing.
  const [preview, setPreview] = useState<DeckQuestion[] | null>(null);
  // Whether the pending preview came from a CSV (parsed here, no AI), plus any
  // rows the CSV parser had to skip, so the review screen can say so.
  const [previewIsCsv, setPreviewIsCsv] = useState(false);
  const [csvSkipped, setCsvSkipped] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function switchMode(m: Mode) {
    setMode(m);
    setPreview(null);
    setPreviewIsCsv(false);
    setCsvSkipped([]);
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

  // Import a CSV directly into a reviewable preview — no AI call. Parsing and
  // validation happen client-side; the author reviews before the game is made.
  function onCsvFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    const reader = new FileReader();
    reader.onload = () => {
      const raw = typeof reader.result === 'string' ? reader.result : '';
      const { questions, error: parseError, skipped } = parseQuestionsCsv(raw.slice(0, MAX_FILE_CHARS));
      if (parseError) {
        setPreview(null);
        setCsvSkipped([]);
        setError(parseError);
        return;
      }
      if (!name.trim()) setName(file.name.replace(/\.[^.]+$/, ''));
      setPreview(questions);
      setPreviewIsCsv(true);
      setCsvSkipped(skipped);
    };
    reader.readAsText(file);
    // Allow re-picking the same file after a fix.
    e.target.value = '';
  }

  // ---- AI-from-a-topic: builds and saves in one step (unchanged). ----
  const canBuildAi = !busy && name.trim().length > 0 && topic.trim().length > 0;
  async function buildAi() {
    if (!canBuildAi) return;
    setBusy(true);
    setError(null);
    try {
      const res = await api.generateStudyDeck({
        name: name.trim(),
        topic: topic.trim(),
        instructions: instructions.trim() || undefined,
        count,
      });
      onCreated(res.decks, res.deck.id);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }

  // ---- Upload a file: AI formats the questions, the author reviews, then confirms. ----
  const canGenerate = !busy && fileText.trim().length > 0;
  async function generatePreview() {
    if (!canGenerate) return;
    setBusy(true);
    setError(null);
    try {
      const res = await api.previewStudyDeck({
        text: fileText,
        instructions: instructions.trim() || undefined,
      });
      setPreview(res.questions);
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
      const res = await api.confirmStudyDeck({ name: name.trim(), questions: preview });
      onCreated(res.decks, res.deck.id);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }

  // The review screen after questions are ready — AI-formatted from a file, or
  // parsed straight from a CSV. The author checks the answer key before saving.
  if (preview) {
    return (
      <div style={{ ...card(theme), marginBottom: 14 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div>
            <h3 style={{ margin: 0, fontSize: 15.5, fontWeight: 700, color: '#fff' }}>
              <EditableText id="studydecks.review_title" text="Review the questions" />
            </h3>
            <p style={{ margin: '5px 0 0', fontSize: 12.5, color: muted, lineHeight: 1.5 }}>
              {previewIsCsv ? 'Imported' : 'AI formatted'} {preview.length} question{preview.length === 1 ? '' : 's'}{' '}
              {previewIsCsv ? 'from your CSV' : 'from your file'}. Check them, then create the game. The correct answer is highlighted.
            </p>
            {csvSkipped.length > 0 && (
              <p style={{ margin: '6px 0 0', fontSize: 11.5, color: '#e0a23a', lineHeight: 1.5 }}>
                Skipped {csvSkipped.length} row{csvSkipped.length === 1 ? '' : 's'}: {csvSkipped.slice(0, 3).join(' ')}
                {csvSkipped.length > 3 ? ' …' : ''}
              </p>
            )}
          </div>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Study game name — e.g. “Chart Patterns”"
            maxLength={120}
            disabled={busy}
            style={field(theme)}
          />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, maxHeight: 380, overflowY: 'auto', paddingRight: 4 }}>
            {preview.map((q) => (
              <PreviewQuestion key={q.seq} q={q} theme={theme} muted={muted} />
            ))}
          </div>
          {error && <div style={{ fontSize: 12, color: '#ffb4ab' }}>{error}</div>}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button onClick={confirmCreate} disabled={!canConfirm} style={{ ...primaryBtn(theme, accentGrad), opacity: canConfirm ? 1 : 0.6 }}>
              {busy ? 'Creating…' : `Create study game`}
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
        {(['ai', 'file', 'csv'] as const).map((m) => (
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
            {m === 'ai' ? 'Generate with AI' : m === 'file' ? 'Upload a file' : 'Import CSV'}
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
            <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
              <label style={{ fontSize: 12, color: muted, display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                Number of questions
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
              <button onClick={buildAi} disabled={!canBuildAi} style={{ ...primaryBtn(theme, accentGrad), opacity: canBuildAi ? 1 : 0.6 }}>
                {busy ? 'Building…' : '✦ Build with AI'}
              </button>
            </div>
          </>
        ) : mode === 'file' ? (
          <>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
              <label style={{ ...ghostBtn(theme), display: 'inline-flex', alignItems: 'center', cursor: 'pointer', opacity: busy ? 0.6 : 1 }}>
                {fileName ? 'Choose a different file' : 'Choose a text file'}
                <input type="file" accept=".txt,.md,text/*" onChange={onFile} disabled={busy} style={{ display: 'none' }} />
              </label>
              {fileName && <span style={{ fontSize: 12, color: muted }}>{fileName}</span>}
            </div>
            <textarea
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
              placeholder="Optional: instructions for how to build the quiz from this material…"
              maxLength={2000}
              rows={2}
              disabled={busy}
              style={{ ...field(theme), resize: 'vertical', minHeight: 52, fontFamily: 'inherit' }}
            />
            <button onClick={generatePreview} disabled={!canGenerate} style={{ ...primaryBtn(theme, accentGrad), alignSelf: 'flex-start', opacity: canGenerate ? 1 : 0.6 }}>
              {busy ? 'Reading your file…' : '✦ Generate'}
            </button>
          </>
        ) : (
          <>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
              <label style={{ ...ghostBtn(theme), display: 'inline-flex', alignItems: 'center', cursor: 'pointer', opacity: busy ? 0.6 : 1 }}>
                <EditableText id="studydecks.csv_choose" text="Choose a CSV file" />
                <input type="file" accept=".csv,text/csv" onChange={onCsvFile} disabled={busy} style={{ display: 'none' }} />
              </label>
              <button
                onClick={() => downloadCsv('study-game-template', questionTemplateCsv())}
                style={{ ...ghostBtn(theme), minHeight: 40 }}
              >
                <EditableText id="studydecks.csv_template" text="⭳ Download template" />
              </button>
            </div>
          </>
        )}

        <div style={{ fontSize: 11, color: muted, lineHeight: 1.5 }}>
          {mode === 'ai' ? (
            <EditableText id="studydecks.composer_help_ai" text="AI writes the questions and answer key — review them before your team relies on them." />
          ) : mode === 'file' ? (
            <EditableText id="studydecks.composer_help_file" text="Upload a text file and AI formats the questions from it. You review them before the game is created." />
          ) : (
            <EditableText
              id="studydecks.composer_help_csv"
              text="Import a CSV with columns: Question, Option A, Option B, Option C, Option D, Answer, and optional Topic and Explanation. Download the template to see the format. You review the questions before the game is created."
            />
          )}
        </div>
        {error && <div style={{ fontSize: 12, color: '#ffb4ab' }}>{error}</div>}
      </div>
    </div>
  );
}

// One formatted question shown on the review screen, with the correct answer
// highlighted so the author can sanity-check the answer key at a glance.
function PreviewQuestion({ q, theme, muted }: { q: DeckQuestion; theme: Theme; muted: string }) {
  return (
    <div style={{ border: `1px solid ${theme.navBorder}`, borderRadius: 10, padding: '11px 13px', background: 'rgba(10,8,26,.4)' }}>
      <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '0.4px', textTransform: 'uppercase', color: theme.accent, marginBottom: 4 }}>
        {q.seq}. {q.topic}
      </div>
      <div style={{ fontSize: 13, color: '#fff', fontWeight: 600, lineHeight: 1.4, marginBottom: 7 }}>{q.stem}</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
        {q.options.map((o) => {
          const correct = o.label === q.answer;
          return (
            <div
              key={o.label}
              style={{
                fontSize: 12.5,
                lineHeight: 1.4,
                color: correct ? '#fff' : '#d7ccff',
                fontWeight: correct ? 700 : 400,
              }}
            >
              <span style={{ color: correct ? theme.accent : muted }}>{o.label}.</span> {o.text}
              {correct && <span style={{ color: theme.accent }}> ✓</span>}
            </div>
          );
        })}
      </div>
      {q.explanation && (
        <div style={{ fontSize: 11.5, color: muted, marginTop: 7, lineHeight: 1.45 }}>Why: {q.explanation}</div>
      )}
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
