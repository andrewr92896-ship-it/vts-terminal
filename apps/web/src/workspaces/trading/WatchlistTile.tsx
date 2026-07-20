import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import type { BoardTile } from '../../api/types';
import { TvWidget } from './TvWidget';
import { TileConfigModal } from './TileConfigModal';
import { ScrollLockButton } from './scrollLock';
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
import { EditableText } from '../../copy/SiteCopy';

const TICKER_TAPE_SRC = 'https://s3.tradingview.com/external-embedding/embed-widget-ticker-tape.js';
const MARKET_QUOTES_SRC = 'https://s3.tradingview.com/external-embedding/embed-widget-market-quotes.js';

// A configurable live price watchlist (TradingView). Holds any set of symbols
// and shows them one of two ways, chosen per tile and saved with the preset:
//   • 'scroll' — the auto-scrolling Ticker Tape (default). Works well as a wide,
//     short strip across the top of a board.
//   • 'static' — a stationary quote list (Market Quotes) that shows every symbol
//     at once, with no scrolling. Better for a taller tile where you want the
//     whole list visible at a glance.
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
  // Leaving edit mode closes the settings panel so it doesn't reopen on the
  // next edit.
  useEffect(() => { if (!editing) setShowCfg(false); }, [editing]);
  const symbols = tile.symbols && tile.symbols.length > 0 ? tile.symbols : ['OANDA:EURUSD'];
  const mode = tile.watchlistMode ?? 'scroll';

  // The scrolling Ticker Tape and the stationary Market Quotes list take
  // differently-shaped configs, so build whichever the current mode needs.
  const config = useMemo(
    () =>
      mode === 'static'
        ? {
            symbolsGroups: [
              { name: '', originalName: '', symbols: symbols.map((s) => ({ name: s, displayName: symbolLabel(s) })) },
            ],
            showSymbolLogo: true,
            isTransparent: true,
            colorTheme: 'dark',
            locale: 'en',
            width: '100%',
            height: '100%',
          }
        : {
            symbols: symbols.map((s) => ({ proName: s, title: symbolLabel(s) })),
            showSymbolLogo: true,
            isTransparent: true,
            displayMode: 'adaptive',
            colorTheme: 'dark',
            locale: 'en',
          },
    [symbols, mode],
  );
  // Include the mode so switching scroll ⇄ static rebuilds the widget.
  const configKey = `${mode}:${JSON.stringify(symbols)}`;

  return (
    <div style={tileWrap}>
      <div className="tile-header" style={{ ...header, cursor: editing ? 'move' : 'default' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
          {editing && <span style={{ color: FAINT, fontSize: 13, lineHeight: 1 }}>⠿</span>}
          <span style={{ fontSize: 12.5, fontWeight: 700, color: '#fff', whiteSpace: 'nowrap' }}>{tile.title || 'Watchlist'}</span>
          <span style={countChip}>{symbols.length}</span>
        </div>
        <div className="no-drag" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {/* Scroll lock is always available (phone); the layout/symbol controls
              only appear while editing the board. */}
          <ScrollLockButton />
          {editing && (
            <>
              {/* Scroll ⇄ Static layout picker — auto-scrolling ticker tape or a
                  stationary list with every symbol visible. Saved with the preset. */}
              <div style={segWrap} title="How to show the watchlist in this tile">
                <button onClick={() => onChange({ watchlistMode: 'scroll' })} style={segBtn(mode === 'scroll')} title="Auto-scrolling ticker">Scroll</button>
                <button onClick={() => onChange({ watchlistMode: 'static' })} style={segBtn(mode === 'static')} title="Stationary — all symbols visible">Static</button>
              </div>
              {/* A clearly labelled button (not a bare icon) so changing what's on
                  the watchlist is easy to find — the header keeps a fixed height
                  even when the tile is a thin strip, so this stays reachable. */}
              <button onClick={() => setShowCfg(true)} style={editSymbolsBtn} title="Edit watchlist symbols">⚙ Symbols</button>
              <button onClick={onRemove} style={{ ...iconBtn, color: '#ffb4ab' }} title="Remove tile">✕</button>
            </>
          )}
        </div>
      </div>

      <div style={{ position: 'relative', flex: 1, minHeight: 0 }}>
        <TvWidget src={mode === 'static' ? MARKET_QUOTES_SRC : TICKER_TAPE_SRC} config={config} configKey={configKey} />
        {/* On a normal-height tile the header button can sit above the fold; an
            overlaid tap target over the ticker makes editing obvious there too.
            It only shows while editing (so it never blocks live prices) and hides
            once the modal is open. Sits above the TradingView iframe. */}
        {editing && !showCfg && (
          <button
            className="no-drag"
            onClick={() => setShowCfg(true)}
            style={editOverlayBtn}
            title="Edit watchlist symbols"
          >
            ⚙ Edit symbols
          </button>
        )}
        {editing && showCfg && (
          <TileConfigModal onClose={() => setShowCfg(false)}>
            <WatchlistConfig tile={tile} onChange={onChange} onClose={() => setShowCfg(false)} />
          </TileConfigModal>
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
        {symbols.length === 0 && <span style={{ fontSize: 11, color: FAINT }}><EditableText id="watchlist.empty">No symbols yet — add some below.</EditableText></span>}
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
// Scroll ⇄ Static segmented toggle in the tile header (mirrors the Positions
// tile's List ⇄ Cards picker).
const segWrap: CSSProperties = {
  display: 'inline-flex',
  background: 'rgba(4,12,30,.5)',
  border: `1px solid ${BORDER2}`,
  borderRadius: 6,
  padding: 2,
  gap: 2,
};
function segBtn(active: boolean): CSSProperties {
  return {
    fontSize: 10.5,
    fontWeight: 700,
    color: active ? '#0c2768' : TEXT,
    background: active ? GOLD : 'transparent',
    border: 'none',
    borderRadius: 4,
    padding: '3px 9px',
    cursor: 'pointer',
  };
}
// A labelled edit button in the header — obvious enough that the watchlist's
// symbols never look "un-editable".
const editSymbolsBtn: CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  lineHeight: 1,
  whiteSpace: 'nowrap',
  color: '#0c2768',
  background: GOLD,
  border: 'none',
  borderRadius: 6,
  padding: '5px 9px',
  cursor: 'pointer',
};
// The same action floated over the ticker so it's tappable on a taller tile.
const editOverlayBtn: CSSProperties = {
  position: 'absolute',
  top: 8,
  left: '50%',
  transform: 'translateX(-50%)',
  zIndex: 4,
  fontSize: 12,
  fontWeight: 700,
  color: '#0c2768',
  background: GOLD,
  border: 'none',
  borderRadius: 8,
  padding: '7px 14px',
  cursor: 'pointer',
  boxShadow: '0 4px 14px rgba(0,0,0,.4)',
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
