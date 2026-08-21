import { useEffect, useState, type CSSProperties } from 'react';
import { api } from '../../api/client';
import type { TeamDeck } from '../../api/types';
import type { Theme } from '../../theme/themes';
import { accentGradient } from '../../theme/themes';
import { useResponsive } from '../../hooks/useMediaQuery';
import { useAuth } from '../../auth/AuthContext';
import { DeckEditor } from './DeckEditor';
import { downloadCsv, questionsToCsv } from './studyCsv';
import { GameWizard } from './wizard/GameWizard';
import { loadGameDraft } from './wizard/gameDraft';
import { errorText } from './studyErrors';

// The team study-game *maker*, shown in Study Creation. Any member builds a deck
// and manages the team's games here; the games themselves are *played* in the
// Study Game section. The public demo sees this read-only.
//
// BUILDING one is the wizard next door (`wizard/GameWizard.tsx`) — one question
// per card, ending at a review, exactly like Create a study package (owner
// instruction, 2026-08). This file is the list and the management around it.

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
  // A game waiting on the creator's own AI. The handoff is the one screen
  // somebody is meant to walk away from, so the way back to it has to be
  // visible from here rather than only from reopening the wizard and hoping.
  const [waiting, setWaiting] = useState(() => loadGameDraft(user?.id ?? 'anon', {}));

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
            {"Study Games"}
          </h2>
          <p style={{ margin: '5px 0 0', fontSize: 12.5, color: muted }}>
            Build and edit your own quizzes here — play them from the <strong>Study Game</strong> section.
          </p>
        </div>
        {!readOnly && (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {decks.length >= 2 && (
              <button onClick={() => setCombineOpen((v) => !v)} style={ghostBtn(theme)}>
                {combineOpen ? 'Close' : '⧉ Combine games'}
              </button>
            )}
            <button onClick={() => setComposerOpen(true)} style={primaryBtn(theme, accentGrad)}>
              {"✦ New study game"}
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

      {waiting?.stage === 'handoff' && !composerOpen && !readOnly && (
        <div
          style={{
            ...card(theme),
            marginBottom: 14,
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            flexWrap: 'wrap',
            padding: '13px 16px',
          }}
        >
          <span style={{ flex: 1, minWidth: 200, fontSize: 12.5, color: muted, lineHeight: 1.5 }}>
            {"A study game is waiting on your AI. Bring back the file it made and the questions land here."}
          </span>
          <button onClick={() => setComposerOpen(true)} style={ghostBtn(theme)}>
            {"Open the handoff"}
          </button>
        </div>
      )}

      {composerOpen && !readOnly && (
        <GameWizard
          theme={theme}
          userId={user?.id ?? 'anon'}
          onClose={() => {
            setComposerOpen(false);
            setWaiting(loadGameDraft(user?.id ?? 'anon', {}));
          }}
          onCreated={(decks, newId) => {
            setDecks(decks);
            setComposerOpen(false);
            setWaiting(null);
            // Creation and editing live here; playing lives in the Study Game
            // section. Open the new game in the editor so the author can refine it.
            setEditing(newId);
          }}
        />
      )}

      {loading ? (
        <div style={{ ...card(theme), color: muted, fontSize: 13 }}>
          {"Loading your study games…"}
        </div>
      ) : loadError ? (
        <div style={{ ...card(theme), color: '#ffb4ab', fontSize: 13 }}>
          {"Couldn’t load your study games. Try again in a moment."}
        </div>
      ) : decks.length === 0 ? (
        <div style={{ ...card(theme), textAlign: 'center' }}>
          <div style={{ fontSize: 28, marginBottom: 8 }}>🎓</div>
          <div style={{ fontSize: 14, fontWeight: 700, color: '#fff', marginBottom: 6 }}>
            {"No study games yet"}
          </div>
          <div style={{ fontSize: 12.5, color: muted, maxWidth: 420, margin: '0 auto', lineHeight: 1.55 }}>
            {readOnly
              ? "Study games are built here — AI-generated from a topic, or from an uploaded file."
              : "Build your first one: have AI generate questions from a topic, or upload a text file of your own questions or notes."}
          </div>
          {!readOnly && (
            <button onClick={() => setComposerOpen(true)} style={{ ...primaryBtn(theme, accentGrad), marginTop: 16 }}>
              {"✦ New study game"}
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
            {"Built-in example — always available"}
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
            {exporting ? "Exporting…" : "⭳ Export CSV"}
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
        {"Combine games"}
      </h3>
      <p style={{ margin: '0 0 12px', fontSize: 12.5, color: muted, lineHeight: 1.5 }}>
        {"Pick the games to merge into one new game with all their questions — great for one massive game across everything."}
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
        {"Remember which game each question came from (adds an optional “guess the source” mode when playing)"}
      </label>
      {error && <div style={{ fontSize: 12, color: '#ffb4ab', marginBottom: 10 }}>{error}</div>}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <button onClick={combine} disabled={!canCombine} style={{ ...primaryBtn(theme, accentGrad), opacity: canCombine ? 1 : 0.6 }}>
          {busy ? 'Combining…' : `Combine ${picked.size} game${picked.size === 1 ? '' : 's'} · ${totalQs} q${totalQs === 1 ? '' : 's'}`}
        </button>
        <button onClick={onCancel} style={ghostBtn(theme)}>
          {"Cancel"}
        </button>
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
