import { useEffect, useState } from 'react';
import { api, ApiError } from '../../api/client';
import type { StudyGuideDetail } from '../../api/types';
import type { Theme } from '../../theme/themes';
import { accentGradient } from '../../theme/themes';
import { useResponsive } from '../../hooks/useMediaQuery';
import { card } from './StudyGuides';
import { EditableText } from '../../copy/SiteCopy';

// Presents a saved study guide as a slideshow — one slide at a time with its
// title, body, and screenshot — navigated with Back/Next, progress dots, and the
// arrow keys, in the same stepped-walkthrough spirit as the demo tour.
export function GuidePresentation({
  theme,
  guideId,
  onExit,
}: {
  theme: Theme;
  guideId: string;
  onExit: () => void;
}) {
  const { isPhone } = useResponsive();
  const accentGrad = accentGradient(theme);
  const [guide, setGuide] = useState<StudyGuideDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [index, setIndex] = useState(0);

  useEffect(() => {
    let alive = true;
    api
      .studyGuide(guideId)
      .then((r) => alive && setGuide(r.guide))
      .catch((e) =>
        alive && setError(e instanceof ApiError ? e.message : 'Could not load this study guide.'),
      );
    return () => {
      alive = false;
    };
  }, [guideId]);

  const total = guide?.slides.length ?? 0;
  const last = index >= total - 1;

  // Arrow-key navigation, like flipping through a deck.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'ArrowRight') setIndex((i) => Math.min(total - 1, i + 1));
      else if (e.key === 'ArrowLeft') setIndex((i) => Math.max(0, i - 1));
      else if (e.key === 'Escape') onExit();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [total, onExit]);

  if (error) {
    return (
      <div style={{ maxWidth: 640, margin: '40px auto 0', textAlign: 'center', color: '#eef3ff' }}>
        <div style={{ ...card(theme), color: '#ffb4ab', fontSize: 13.5 }}>{error}</div>
        <button onClick={onExit} style={{ ...ghostBtn(theme), marginTop: 14 }}><EditableText id="guidepres.back">‹ Back to study guides</EditableText></button>
      </div>
    );
  }
  if (!guide) {
    return <div style={{ padding: 24, color: '#a99ff0', fontSize: 13 }}><EditableText id="guidepres.loading">Loading study guide…</EditableText></div>;
  }
  if (total === 0) {
    return (
      <div style={{ maxWidth: 640, margin: '40px auto 0', textAlign: 'center', color: '#eef3ff' }}>
        <div style={{ ...card(theme), fontSize: 13.5, color: '#d7ccff' }}><EditableText id="guidepres.empty">This study guide has no slides yet.</EditableText></div>
        <button onClick={onExit} style={{ ...ghostBtn(theme), marginTop: 14 }}><EditableText id="guidepres.back">‹ Back to study guides</EditableText></button>
      </div>
    );
  }

  const slide = guide.slides[index];

  return (
    <div style={{ maxWidth: 960, margin: '0 auto', color: '#eef3ff', animation: 'fadeIn .25s ease' }}>
      {/* Header: title + exit */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', marginBottom: 14 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 10, letterSpacing: '1px', textTransform: 'uppercase', color: theme.accent, fontWeight: 700 }}>
            Study guide · slide {index + 1} of {total}
          </div>
          <h2 style={{ margin: '4px 0 0', fontSize: 17, fontWeight: 700, color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {guide.name}
          </h2>
        </div>
        <button onClick={onExit} style={ghostBtn(theme)}><EditableText id="guidepres.exit">Exit ✕</EditableText></button>
      </div>

      {/* The stage */}
      <div
        style={{
          background: 'linear-gradient(180deg,rgba(40,30,72,.55),rgba(24,17,48,.6))',
          border: `1px solid ${theme.navBorder}`,
          borderRadius: 16,
          padding: isPhone ? '22px 18px' : '34px 36px',
          minHeight: isPhone ? 320 : 420,
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <h3 style={{ margin: 0, fontSize: isPhone ? 22 : 28, fontWeight: 800, color: '#fff', lineHeight: 1.2, letterSpacing: '-0.3px' }}>
          {slide.title || `Slide ${index + 1}`}
        </h3>
        <div
          style={{
            marginTop: 16,
            display: 'grid',
            gridTemplateColumns: slide.image && !isPhone ? '1fr 1fr' : '1fr',
            gap: isPhone ? 16 : 24,
            alignItems: 'start',
            flex: 1,
          }}
        >
          {slide.body && (
            <div style={{ fontSize: isPhone ? 15 : 16.5, lineHeight: 1.7, color: '#e6ecfb', whiteSpace: 'pre-wrap' }}>
              {slide.body}
            </div>
          )}
          {slide.image && (
            <div style={{ display: 'flex', justifyContent: 'center' }}>
              <img
                src={slide.image}
                alt=""
                style={{ maxWidth: '100%', maxHeight: isPhone ? 260 : 420, borderRadius: 10, border: `1px solid ${theme.navBorder}`, boxShadow: '0 12px 40px rgba(0,0,0,.4)' }}
              />
            </div>
          )}
        </div>
      </div>

      {/* Progress dots */}
      <div style={{ display: 'flex', gap: 5, justifyContent: 'center', margin: '16px 0 14px', flexWrap: 'wrap' }}>
        {guide.slides.map((_, i) => (
          <button
            key={i}
            onClick={() => setIndex(i)}
            aria-label={`Go to slide ${i + 1}`}
            style={{
              width: i === index ? 22 : 8,
              height: 8,
              borderRadius: 4,
              border: 'none',
              padding: 0,
              cursor: 'pointer',
              background: i === index ? theme.accent : 'rgba(169,159,240,.35)',
              transition: 'width .2s ease',
            }}
          />
        ))}
      </div>

      {/* Controls */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <button onClick={() => setIndex((i) => Math.max(0, i - 1))} disabled={index === 0} style={{ ...ghostBtn(theme), opacity: index === 0 ? 0.5 : 1 }}>
          ‹ Back
        </button>
        <div style={{ flex: 1 }} />
        <button
          onClick={() => (last ? onExit() : setIndex((i) => Math.min(total - 1, i + 1)))}
          style={{ border: 'none', background: accentGrad, color: theme.accentText, fontSize: 13.5, fontWeight: 700, padding: '11px 22px', borderRadius: 8, cursor: 'pointer', minHeight: 44 }}
        >
          {last ? 'Finish' : 'Next ›'}
        </button>
      </div>
    </div>
  );
}

function ghostBtn(theme: Theme) {
  return {
    border: `1px solid ${theme.navBorder}`,
    background: 'rgba(255,255,255,.05)',
    color: '#cdbcff',
    fontSize: 13,
    fontWeight: 600,
    padding: '10px 16px',
    borderRadius: 8,
    cursor: 'pointer',
    minHeight: 44,
  } as const;
}
