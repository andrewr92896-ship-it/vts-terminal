import { Icon } from '../../../components/Icon';
import type { Theme } from '../../../theme/themes';
import { BORDER, MUTED, TEXT, primaryBtn, secondaryBtn } from './wizardUi';

// The package exists. Its game, set and presentation are ordinary Study content
// from here on — the same player, the same practice tests, the same progress —
// so the useful thing to offer is the way to them, not another summary.
export function PackageDone({
  theme,
  pkg,
  onNavigate,
  onBack,
}: {
  theme: Theme;
  pkg: { id: string; name: string };
  onNavigate?: (screen: string) => void;
  onBack: () => void;
}) {
  return (
    <div style={{ maxWidth: 900, margin: '0 auto', color: TEXT, animation: 'fadeIn .25s ease' }}>
      <div style={{ border: `1px solid ${BORDER}`, borderRadius: 12, padding: 22, background: 'rgba(255,255,255,.02)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
          <Icon name="check-check" size={19} color="#7fd6a6" />
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#fff' }}>{pkg.name} is ready</h2>
        </div>
        <p style={{ margin: '0 0 18px', fontSize: 13, color: MUTED, lineHeight: 1.6 }}>
          It works like any other study content — play it, test yourself on it, and your progress is kept.
        </p>
        <div style={{ display: 'flex', gap: 9, flexWrap: 'wrap' }}>
          <button type="button" onClick={() => onNavigate?.('st_game')} style={primaryBtn(theme)}>
            Play it now
          </button>
          <button type="button" onClick={() => onNavigate?.('st_test')} style={secondaryBtn(theme)}>
            Take a practice test
          </button>
          <button type="button" onClick={onBack} style={secondaryBtn(theme)}>
            Build another
          </button>
        </div>
      </div>
    </div>
  );
}
