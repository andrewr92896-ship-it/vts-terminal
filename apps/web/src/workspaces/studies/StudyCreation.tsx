import { useState, type CSSProperties } from 'react';
import type { Theme } from '../../theme/themes';
import { TeamStudyDecks } from './TeamStudyDecks';
import { TeamFlashcards } from './TeamFlashcards';
import { StudyGuideCreator } from './StudyGuides';
import { ActionTile } from './ActionTile';
import { useResponsive } from '../../hooks/useMediaQuery';
import { useAuth } from '../../auth/AuthContext';
import { PackageWizard, type WizardResult } from './wizard/PackageWizard';
import { PackageHandoff } from './wizard/PackageHandoff';
import { ManualEntry } from './wizard/ManualEntry';
import { PackageDone } from './wizard/PackageDone';
import { clearDraft, loadDraft, setDraftStage } from './wizard/draft';
import { needsExternalAi } from './wizard/blueprint';

// The "Study Creation" section — the one place a team builds its own study
// content. Three makers: study games (quizzes), flashcard sets (term/definition
// cards), and study presentations (slide decks, from scratch or an uploaded
// PowerPoint). Finished presentations are shown from the separate Study
// Presentations section (StudyGuidesLibrary).
//
// A chooser rather than three makers stacked down one page (owner decision,
// 2026-08): stacked, every maker's full list and form loaded at once, so the
// screen opened three feet long and the thing you came to build was somewhere in
// the middle of it. Picking a tile opens one maker with a way back.
//
// The DEFAULT way to build a study game is now the package wizard: a short,
// branching set of questions that produces a blueprint and then hands it either
// to the creator's own AI or to the manual entry path. The three makers below it
// are the alternate route — they are what the wizard's manual path lands in, and
// they stay directly reachable for anyone who would rather skip the questions.
type Maker = 'games' | 'flashcards' | 'guides';

/**
 * The ending the creator was standing on, if they left one.
 *
 * The AI handoff is a screen somebody is MEANT to walk away from — they take
 * the prompt to their own AI and come back, sometimes the next day — and its
 * paste box was React state, so leaving lost it with no way back to it from
 * anywhere. Reopening the wizard was not the way back either: it restored the
 * questions, and finishing them again minted a new draft id, which the importer
 * refuses a file built against the old one for.
 *
 * The route is DERIVED rather than stored, from the same `needsExternalAi` the
 * wizard's own finish button reads, so a resumed ending can never be a
 * different ending than the one that was left.
 */
function resumeEnding(userId: string): WizardResult | null {
  const saved = loadDraft(userId);
  if (!saved || saved.stage !== 'ending') return null;
  return {
    draftId: saved.draftId,
    blueprint: saved.blueprint,
    route: needsExternalAi(saved.blueprint) ? 'ai_handoff' : 'manual',
  };
}

export function StudyCreation({
  theme,
  onNavigate,
}: {
  theme: Theme;
  onNavigate?: (screen: string) => void;
}) {
  const { isPhone } = useResponsive();
  const { user } = useAuth();
  const readOnly = !!user?.isDemo;
  const userId = user?.id ?? 'anon';
  const [maker, setMaker] = useState<Maker | null>(null);
  const [wizardOpen, setWizardOpen] = useState(false);
  // Resolved once, in a lazy initializer: this is where the creator is picked
  // up from, not something to yank the screen back to on every re-render.
  const [pending, setPending] = useState<WizardResult | null>(() => resumeEnding(userId));
  const [created, setCreated] = useState<{ id: string; name: string } | null>(null);

  // The blueprint is finished. Which ending it lands on is the route the wizard
  // resolved: the AI handoff, or typing the questions in. Neither has written
  // anything yet — both create the package only on their own final action.
  const onWizardDone = (result: WizardResult) => {
    setWizardOpen(false);
    setPending(result);
  };

  // Backing out of an ending returns the draft to the questions, so Study
  // Creation opens on the makers again rather than trapping the creator on a
  // handoff they have finished with. The draft itself is untouched — the
  // answers, and the draft id an imported file is checked against, both stay.
  const leaveEnding = () => {
    setDraftStage(userId, 'wizard');
    setPending(null);
  };

  // The package exists now, so the draft that described it has done its job.
  const onCreated = (pkg: { id: string; name: string }) => {
    clearDraft(userId);
    setPending(null);
    setCreated(pkg);
  };

  if (created) {
    return <PackageDone theme={theme} pkg={created} onNavigate={onNavigate} onBack={() => setCreated(null)} />;
  }

  if (pending) {
    return pending.route === 'manual' ? (
      <ManualEntry theme={theme} result={pending} onBack={leaveEnding} onCreated={onCreated} />
    ) : (
      <PackageHandoff theme={theme} result={pending} onBack={leaveEnding} onImported={onCreated} />
    );
  }

  if (maker) {
    return (
      <div style={{ animation: 'fadeIn .25s ease' }}>
        <div style={{ maxWidth: 900, margin: '0 auto 14px', width: '100%' }}>
          <button onClick={() => setMaker(null)} style={backBtn(theme)}>
            {"← All makers"}
          </button>
        </div>
        {maker === 'games' && <TeamStudyDecks theme={theme} />}
        {maker === 'flashcards' && <TeamFlashcards theme={theme} />}
        {maker === 'guides' && <StudyGuideCreator theme={theme} onNavigate={onNavigate} />}
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', color: '#eef3ff', animation: 'fadeIn .25s ease' }}>
      <div style={{ marginBottom: 16 }}>
        <h2 style={{ margin: 0, fontSize: 19, fontWeight: 700, color: '#fff' }}>
          {"Study Creation"}
        </h2>
        <p style={{ margin: '5px 0 0', fontSize: 12.5, color: '#8ea3cc' }}>
          {"Build your own study content."}
        </p>
      </div>

      <div style={{ marginBottom: 12 }}>
        <ActionTile
          theme={theme}
          icon="layers"
          title="Create a study package"
          subtitle="A few questions about what you need, then your own AI writes it — or you type it in yourself."
          feature="studyCreation"
          onClick={() => setWizardOpen(true)}
          onLockedClick={() => onNavigate?.('my_access')}
        />
      </div>

      <div style={{ margin: '0 0 10px', fontSize: 11.5, fontWeight: 600, letterSpacing: '.4px', color: '#6f84b0' }}>
        {"ONE PIECE AT A TIME"}
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: isPhone ? '1fr' : '1fr 1fr',
          gap: 12,
        }}
      >
        <ActionTile
          theme={theme}
          icon="gamepad-2"
          title="Study games"
          subtitle="Write your own questions, generate them with VTS AI, or upload a file."
          feature="studyCreation"
          onClick={() => setMaker('games')}
          onLockedClick={() => onNavigate?.('my_access')}
        />
        <ActionTile
          theme={theme}
          icon="copy"
          title="Flashcard sets"
          subtitle="Type the cards in, generate them from a topic, or upload a text file."
          feature="studyCreation"
          onClick={() => setMaker('flashcards')}
          onLockedClick={() => onNavigate?.('my_access')}
        />
        <ActionTile
          theme={theme}
          icon="presentation"
          title="Study presentations"
          subtitle="Draft the slides with VTS AI, or upload a PowerPoint."
          feature="studyCreation"
          onClick={() => setMaker('guides')}
          onLockedClick={() => onNavigate?.('my_access')}
        />
      </div>

      {wizardOpen && (
        <PackageWizard
          theme={theme}
          readOnly={readOnly}
          onClose={() => setWizardOpen(false)}
          onComplete={onWizardDone}
        />
      )}
    </div>
  );
}

function backBtn(theme: Theme): CSSProperties {
  return {
    fontSize: 12.5,
    fontWeight: 600,
    color: '#dfe7fa',
    background: 'rgba(255,255,255,.05)',
    border: `1px solid ${theme.navBorder}`,
    padding: '8px 13px',
    borderRadius: 8,
    cursor: 'pointer',
    fontFamily: 'inherit',
  };
}
