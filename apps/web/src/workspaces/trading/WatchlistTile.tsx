import { useMemo, useState, type CSSProperties } from 'react';
import type { BoardTile } from '../../api/types';
import { TvWidget } from './TvWidget';
import {
  BORDER,
  BORDER2,
  FAINT,
  GOLD,
  MUTED,
  PANEL,
  SYMBOL_SUGGESTIONS,
  TEXT,
  input,
  symbolLabel,
} from './tvChart';

const TICKER_TAPE_SRC = 'https://s3.tradingview.com/external-embedding/embed-widget-ticker-tape.js';

// A configurable live price strip (TradingView Ticker Tape). Holds any set of
// TradingView symbols and scrolls their prices/changes. Works well as a wide,
// short tile across the top of a board.
export function WatchlistTile({
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
  const symbols = tile.symbols && tile.symbols.length > 0 ? tile.symbols : ['OANDA:EURUSD'];

  const config = useMemo(
    () => ({
      symbols: symbols.map((s) => ({ proName: s, title: symbolLabel(s) })),
      showSymbolLogo: true,
      isTransparent: true,
      displayMode: 'adaptive',
      colorTheme: 'dark',
      locale: 'en',
    }),
    [symbols],
  );
  const configKey = JSON.stringify(symbols);

  return (
    <div style={tileWrap}>
      <div className="tile-header" style={{ ...header, cursor: editing ? 'move' : 'default' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
          {editing && <span style={{ color: FAINT, fontSize: 13, lineHeight: 1 }}>⠿</span>}
          <span style={{ fontSize: 12.5, fontWeight: 700, color: '#fff', whiteSpace: 'nowrap' }}>{tile.title || 'Watchlist'}</span>
          <span style={countChip}>{symbols.length}</span>
        </div>
        <div className="no-drag" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <button onClick={() => setShowCfg((v) => !v)} style={iconBtn} title="Watchlist settings">⚙</button>
          {editing && <button onClick={onRemove} style={{ ...iconBtn, color: '#ffb4ab' }} title="Remove tile">✕</button>}
        </div>
      </div>

      <div style={{ position: 'relative', flex: 1, minHeight: 0 }}>
        <TvWidget src={TICKER_TAPE_SRC} config={config} configKey={configKey} />
        {showCfg && (
          <div className="no-drag" style={cfgPanel} onMouseDown={(e) => e.stopPropagation()}>
            <WatchlistConfig tile={tile} onChange={onChange} onClose={() => setShowCfg(false)} />
          </div>
        )}
      </div>
    </div>
  );
}

function WatchlistConfig({ tile, onChange, onClose }: { tile: BoardTile; onChange: (p: Partial<BoardTile>) => void; onClose: () => void }) {
  const symbols = tile.symbols ?? [];
  const [entry, setEntry] = useState('');

  const add = (raw: string) => {
    const v = raw.trim().toUpperCase();
    if (!v) return;
    if (symbols.some((s) => s.toUpperCase() === v)) return;
    onChange({ symbols: [...symbols, v] });
    setEntry('');
  };
  const remove = (sym: string) => onChange({ symbols: symbols.filter((s) => s !== sym) });

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: '#fff' }}>Watchlist</span>
        <button onClick={onClose} style={iconBtn} title="Close">✕</button>
      </div>

      <label style={lbl}>Title</label>
      <input
        value={tile.title ?? ''}
        placeholder="Watchlist"
        onChange={(e) => onChange({ title: e.target.value.slice(0, 60) })}
        style={{ ...input, width: '100%', marginBottom: 12, boxSizing: 'border-box' }}
      />

      <label style={lbl}>Symbols</label>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginBottom: 8 }}>
        {symbols.length === 0 && <span style={{ fontSize: 11, color: FAINT }}>No symbols yet — add some below.</span>}
        {symbols.map((s) => (
          <span key={s} style={symChip}>
            {symbolLabel(s)}
            <button onClick={() => remove(s)} style={symX} title="Remove">✕</button>
          </span>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
        <input
          value={entry}
          list="tv-symbol-list"
          placeholder="Add symbol (e.g. OANDA:GBPUSD)"
          onChange={(e) => setEntry(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') add(entry); }}
          style={{ ...input, flex: 1 }}
        />
        <button onClick={() => add(entry)} style={addBtn}>Add</button>
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
        {SYMBOL_SUGGESTIONS.filter((s) => !symbols.some((x) => x.toUpperCase() === s.symbol.toUpperCase()))
          .slice(0, 8)
          .map((s) => (
            <button key={s.symbol} onClick={() => add(s.symbol)} style={quickChip}>+ {s.label}</button>
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
const countChip: CSSProperties = {
  fontSize: 9.5,
  fontWeight: 700,
  color: GOLD,
  border: '1px solid rgba(235,203,116,.4)',
  borderRadius: 5,
  padding: '1px 6px',
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
const cfgPanel: CSSProperties = {
  position: 'absolute',
  top: 8,
  right: 8,
  width: 300,
  maxWidth: 'calc(100% - 16px)',
  maxHeight: 'calc(100% - 16px)',
  overflowY: 'auto',
  background: 'rgba(8,18,42,.98)',
  border: `1px solid ${BORDER2}`,
  borderRadius: 10,
  padding: 12,
  boxShadow: '0 12px 40px rgba(0,0,0,.5)',
  zIndex: 5,
};
const lbl: CSSProperties = {
  display: 'block',
  fontSize: 9,
  letterSpacing: '0.5px',
  textTransform: 'uppercase',
  color: FAINT,
  marginBottom: 5,
};
const symChip: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 5,
  fontSize: 10.5,
  fontWeight: 600,
  color: TEXT,
  background: 'rgba(255,255,255,.05)',
  border: `1px solid ${BORDER2}`,
  borderRadius: 6,
  padding: '3px 6px',
};
const symX: CSSProperties = { fontSize: 9, color: MUTED, background: 'transparent', border: 'none', cursor: 'pointer', padding: 0, lineHeight: 1 };
const addBtn: CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  color: '#0c2768',
  background: GOLD,
  border: 'none',
  borderRadius: 7,
  padding: '0 12px',
  cursor: 'pointer',
};
const quickChip: CSSProperties = {
  fontSize: 10.5,
  fontWeight: 600,
  color: MUTED,
  background: 'rgba(255,255,255,.03)',
  border: `1px solid ${BORDER2}`,
  borderRadius: 6,
  padding: '4px 8px',
  cursor: 'pointer',
};
