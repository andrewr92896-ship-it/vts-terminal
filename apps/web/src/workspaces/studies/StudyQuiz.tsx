import { useState, type CSSProperties } from 'react';
import { api, ApiError } from '../../api/client';
import type { Theme } from '../../theme/themes';
import { SERIES65_TOPICS } from './series65Questions';
import type { StudyQuizQuestion } from '../../api/types';

// AI practice-quiz generator: Claude (Sonnet) writes fresh Series 65 questions
// on a chosen topic. Each renders as a self-checking multiple-choice card.
export function StudyQuiz({ theme }: { theme: Theme }) {
  const [topic, setTopic] = useState('');
  const [count, setCount] = useState(5);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [questions, setQuestions] = useState<StudyQuizQuestion[]>([]);

  async function generate() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const r = await api.studyQuiz({ topic: topic || undefined, count });
      setQuestions(r.questions);
      if (!r.questions.length) setError('Claude returned no questions — try again.');
    } catch (e) {
      setError(
        e instanceof ApiError
          ? e.status === 503
            ? 'Claude isn’t configured yet — an API key needs to be set on the server.'
            : e.message
          : 'Could not generate a quiz',
      );
    } finally {
      setBusy(false);
    }
  }

  const select: CSSProperties = { background: 'rgba(255,255,255,.05)', border: `1px solid ${theme.navBorder}`, borderRadius: 7, color: '#eef3ff', fontSize: 12.5, padding: '8px 10px', outline: 'none' };

  return (
    <div
      style={{
        background: 'linear-gradient(180deg,rgba(40,30,72,.5),rgba(28,20,54,.55))',
        border: `1px solid ${theme.navBorder}`,
        borderLeft: `3px solid ${theme.accent}`,
        borderRadius: 14,
        padding: '20px 22px',
        marginTop: 16,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#fff' }}>Practice quiz</h3>
        <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 9.5, color: '#8a7fc8' }}>Sonnet</span>
      </div>
      <p style={{ margin: '6px 0 14px', fontSize: 12.5, color: '#d7ccff' }}>
        Generate fresh exam-style questions on a topic, with answers explained.
      </p>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <select value={topic} onChange={(e) => setTopic(e.target.value)} style={select}>
          <option value="">All topics</option>
          {SERIES65_TOPICS.map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
        <select value={count} onChange={(e) => setCount(Number(e.target.value))} style={select}>
          {[3, 5, 8, 10].map((n) => (
            <option key={n} value={n}>{n} questions</option>
          ))}
        </select>
        <button
          onClick={generate}
          disabled={busy}
          style={{ border: 'none', background: theme.accent, color: '#1a1233', fontWeight: 700, fontSize: 12.5, padding: '9px 16px', borderRadius: 7, cursor: busy ? 'default' : 'pointer', opacity: busy ? 0.6 : 1 }}
        >
          {busy ? 'Writing…' : questions.length ? 'New quiz' : 'Generate'}
        </button>
      </div>

      {error && <div style={{ marginTop: 12, fontSize: 12, color: '#ff9da6' }}>{error}</div>}

      <div style={{ marginTop: questions.length ? 18 : 0, display: 'flex', flexDirection: 'column', gap: 14 }}>
        {questions.map((q, i) => (
          <QuizCard key={i} n={i + 1} q={q} theme={theme} />
        ))}
      </div>
    </div>
  );
}

function QuizCard({ n, q, theme }: { n: number; q: StudyQuizQuestion; theme: Theme }) {
  const [picked, setPicked] = useState<string | null>(null);
  const revealed = picked != null;

  return (
    <div style={{ background: 'rgba(255,255,255,.03)', border: `1px solid ${theme.navBorder}`, borderRadius: 10, padding: '14px 16px' }}>
      <div style={{ fontSize: 13.5, lineHeight: 1.5, color: '#eef3ff', marginBottom: 10 }}>
        <span style={{ color: '#8a7fc8', marginRight: 6 }}>{n}.</span>{q.stem}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
        {q.options.map((o) => {
          const isAnswer = o.label === q.answer;
          const isPicked = o.label === picked;
          let bg = 'rgba(255,255,255,.04)';
          let border = theme.navBorder;
          if (revealed && isAnswer) { bg = 'rgba(53,196,123,.16)'; border = '#35c47b'; }
          else if (revealed && isPicked) { bg = 'rgba(239,84,104,.14)'; border = '#ef5468'; }
          return (
            <button
              key={o.label}
              onClick={() => !revealed && setPicked(o.label)}
              disabled={revealed}
              style={{ textAlign: 'left', background: bg, border: `1px solid ${border}`, borderRadius: 7, padding: '9px 11px', color: '#e7e0ff', fontSize: 12.5, cursor: revealed ? 'default' : 'pointer', display: 'flex', gap: 8 }}
            >
              <span style={{ fontWeight: 700, color: revealed && isAnswer ? '#35c47b' : '#a99ff0' }}>{o.label}</span>
              <span>{o.text}</span>
            </button>
          );
        })}
      </div>
      {revealed && (
        <div style={{ marginTop: 10, fontSize: 12, lineHeight: 1.5, color: '#cdc3f0' }}>
          <span style={{ fontWeight: 700, color: picked === q.answer ? '#35c47b' : '#ef5468' }}>
            {picked === q.answer ? 'Correct.' : `Answer: ${q.answer}.`}
          </span>{' '}
          {q.explanation}
        </div>
      )}
    </div>
  );
}
