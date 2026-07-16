import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import type { BoardTile } from '../../api/types';
import { TvWidget } from './TvWidget';
import { TileConfigModal } from './TileConfigModal';
import {
  BORDER,
  BORDER2,
  CANDLE_STYLES,
  FAINT,
  GOLD,
  INTERVALS,
  MONO,
  MUTED,
  PANEL,
  STUDIES,
  SYMBOL_SUGGESTIONS,
  TEXT,
  input,
  intervalLabel,
  styleLabel,
  symbolLabel,
} from './tvChart';

const ADVANCED_CHART_SRC = 'https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js';

// One chart tile on the board: a TradingView Advanced Chart with a header
// (drag handle + config/remove) and an inline editor for symbol, timeframe,
// candle style (incl. Heikin Ashi) and indicators. The chart's own toolbar
// still lets you change all of this live; the editor just sets the saved
// defaults so a preset restores them.
export function ChartTile({
  tile,
  editing,
  onChange,
  onRemove,
}: {
  tile: BoardTile;
  editing: boolean;
  onChange: (patch: Partial<BoardTile>) => void;
  onRemove: () => void;
}) {
  const [showCfg, setShowCfg] = useState(false);
  // Leaving edit mode closes the settings panel so it doesn't reopen on the
  // next edit.
  useEffect(() => { if (!editing) setShowCfg(false); }, [editing]);
  const symbol = tile.symbol || 'OANDA:EURUSD';
  const interval = tile.interval || '60';
  const style = tile.style || '1';
  const studies = tile.studies ?? [];

  const config = useMemo(
    () => ({
      autosize: true,
      symbol,
      interval,
      timezone: 'America/New_York',
      theme: 'dark',
      style,
      locale: 'en',
      hide_side_toolbar: false,
      allow_symbol_change: true,
      calendar: false,
      studies,
      backgroundColor: 'rgba(9,20,46,1)',
      gridColor: 'rgba(120,150,220,0.08)',
      support_host: 'https://www.tradingview.com',
    }),
    [symbol, interval, style, studies],
  );
  const configKey = JSON.stringify({ symbol, interval, style, studies });

  return (
    <div style={tileWrap}>
      <div className="tile-header" style={{ ...header, cursor: editing ? 'move' : 'default' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
          {editing && <span style={{ color: FAINT, fontSize: 13, lineHeight: 1 }}>⠿</span>}
          <span style={{ fontSize: 12.5, fontWeight: 700, color: '#fff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {symbolLabel(symbol)}
          </span>
          <span style={metaChip}>{intervalLabel(interval)}</span>
          <span style={metaChip}>{styleLabel(style)}</span>
          {studies.length > 0 && <span style={{ ...metaChip, color: GOLD, borderColor: 'rgba(235,203,116,.4)' }}>{studies.length} ind</span>}
        </div>
        {editing && (
          <div className="no-drag" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <button onClick={() => setShowCfg((v) => !v)} style={iconBtn} title="Chart settings">⚙</button>
            <button onClick={onRemove} style={{ ...iconBtn, color: '#ffb4ab' }} title="Remove tile">✕</button>
          </div>
        )}
      </div>

      <div style={{ position: 'relative', flex: 1, minHeight: 0 }}>
        <TvWidget src={ADVANCED_CHART_SRC} config={config} configKey={configKey} />
        {editing && showCfg && (
          <TileConfigModal onClose={() => setShowCfg(false)}>
            <ChartConfig tile={tile} onChange={onChange} onClose={() => setShowCfg(false)} />
          </TileConfigModal>
        )}
      </div>
    </div>
  );
}

function ChartConfig({ tile, onChange, onClose }: { tile: BoardTile; onChange: (p: Partial<BoardTile>) => void; onClose: () => void }) {
  const [sym, setSym] = useState(tile.symbol || '');
  const studies = tile.studies ?? [];
  const toggleStudy = (id: string) => {
    const next = studies.includes(id) ? studies.filter((s) => s !== id) : [...studies, id];
    onChange({ studies: next });
  };
  const commitSymbol = () => {
    const v = sym.trim().toUpperCase();
    if (v) onChange({ symbol: v });
  };

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: '#fff' }}>Chart settings</span>
        <button onClick={onClose} style={iconBtn} title="Close">✕</button>
      </div>

      <label style={lbl}>Symbol</label>
      <div style={{ display: 'flex', gap: 6, marginBottom: 4 }}>
        <input
          value={sym}
          list="tv-symbol-list"
          placeholder="e.g. OANDA:EURUSD"
          onChange={(e) => setSym(e.target.value)}
          onBlur={commitSymbol}
          onKeyDown={(e) => { if (e.key === 'Enter') commitSymbol(); }}
          style={{ ...input, flex: 1 }}
        />
      </div>
      <datalist id="tv-symbol-list">
        {SYMBOL_SUGGESTIONS.map((s) => (
          <option key={s.symbol} value={s.symbol}>{s.label}</option>
        ))}
      </datalist>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginBottom: 12 }}>
        {SYMBOL_SUGGESTIONS.slice(0, 8).map((s) => (
          <button key={s.symbol} onClick={() => { setSym(s.symbol); onChange({ symbol: s.symbol }); }} style={pickChip(tile.symbol === s.symbol)}>
            {s.label}
          </button>
        ))}
      </div>

      <label style={lbl}>Timeframe</label>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginBottom: 12 }}>
        {INTERVALS.map((i) => (
          <button key={i.code} onClick={() => onChange({ interval: i.code })} style={pickChip((tile.interval || '60') === i.code)}>
            {i.label}
          </button>
        ))}
      </div>

      <label style={lbl}>Candle style</label>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginBottom: 12 }}>
        {CANDLE_STYLES.map((s) => (
          <button key={s.code} onClick={() => onChange({ style: s.code })} style={pickChip((tile.style || '1') === s.code)}>
            {s.label}
          </button>
        ))}
      </div>

      <label style={lbl}>Indicators</label>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
        {STUDIES.map((s) => (
          <button key={s.id} onClick={() => toggleStudy(s.id)} style={pickChip(studies.includes(s.id))}>
            {s.label}
          </button>
        ))}
      </div>
    </div>
  );
}

const tileWrap: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  height: '100%',
  width: '100%',
  background: 'rgba(9,20,46,1)',
  border: `1px solid ${BORDER}`,
  borderRadius: 10,
  overflow: 'hidden',
};
const header: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 8,
  padding: '7px 10px',
  background: PANEL,
  borderBottom: `1px solid ${BORDER}`,
  flex: '0 0 auto',
};
const metaChip: CSSProperties = {
  fontSize: 9.5,
  fontWeight: 600,
  color: MUTED,
  border: `1px solid ${BORDER2}`,
  borderRadius: 5,
  padding: '2px 6px',
  fontFamily: MONO,
  whiteSpace: 'nowrap',
};
const iconBtn: CSSProperties = {
  fontSize: 12,
  lineHeight: 1,
  color: '#cfe',
  background: 'rgba(255,255,255,.05)',
  border: `1px solid ${BORDER2}`,
  borderRadius: 6,
  padding: '4px 7px',
  cursor: 'pointer',
};
const lbl: CSSProperties = {
  display: 'block',
  fontSize: 9,
  letterSpacing: '0.5px',
  textTransform: 'uppercase',
  color: FAINT,
  marginBottom: 5,
};
function pickChip(active: boolean): CSSProperties {
  return {
    fontSize: 10.5,
    fontWeight: 600,
    color: active ? '#0c2768' : TEXT,
    background: active ? GOLD : 'rgba(255,255,255,.04)',
    border: `1px solid ${active ? GOLD : BORDER2}`,
    borderRadius: 6,
    padding: '4px 8px',
    cursor: 'pointer',
  };
}
