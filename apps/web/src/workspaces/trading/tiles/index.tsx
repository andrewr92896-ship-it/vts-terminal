import type { CSSProperties } from 'react';
import { FEATURE_LABELS, TIER_LABELS, tierOfFeature } from '../../../auth/access';
import { useAuth } from '../../../auth/AuthContext';
import { Icon } from '../../../components/Icon';
import { TierMark } from '../../../components/TierMark';
import type { BoardTile } from '../../../api/types';
import { BORDER, FAINT, GOLD, MUTED, PANEL } from '../tvChart';
import { tileDef, tileLabel, type TileLock } from '../tileCatalog';
import { ChartTile } from '../ChartTile';
import { WatchlistTile } from '../WatchlistTile';
import { PositionsTile } from '../PositionsTile';
import { MetricsTile } from '../MetricsTile';
import { NewsTile } from '../NewsTile';
import { CalendarTile } from '../CalendarTile';
import { AlertsTile } from '../AlertsTile';
import {
  AnnouncementsTile,
  DividendsTile,
  NetWorthTile,
  NotesTile,
  PatchNotesTile,
  PortfolioTile,
  TodoTile,
  type TileProps,
} from './PersonalTiles';
import {
  CapitalTile,
  ChallengeTile,
  ClosedTradesTile,
  ManualBookTile,
  SessionsTile,
  TradeLogTile,
} from './DeskTiles';
import { ClockTile, MarketDataTile, StreamTile } from './MarketTiles';
import { FlashcardsTile, LeaderboardTile, StudyStatsTile, TeamChatTile } from './StudyTeamTiles';

// One tile, resolved from its kind.
//
// The board itself no longer knows what kinds exist — it hands a tile here and
// gets a component back. Adding a kind is an entry in tileCatalog.ts and a case
// below; the grid, the picker and the save path all follow without edits.
export function BoardTileView({
  tile,
  editing,
  onChange,
  onRemove,
  onMeasure,
  lock,
  onOpenMembership,
}: TileProps & {
  /** Reported by the positions tiles in an "expand" view (content-driven height). */
  onMeasure?: (px: number | null) => void;
  /** Set when the viewer can no longer reach this tile's data. */
  lock?: TileLock | null;
  onOpenMembership?: () => void;
}) {
  // A tile the viewer cannot reach is drawn as a lock rather than mounted.
  //
  // Two reasons, and the second is the one that matters: mounting it would fire
  // a request the server answers 402/403, so the tile would show an error where
  // the honest answer is "this costs something". And the tile is KEPT on the
  // board rather than deleted, so a membership that lapses and comes back finds
  // the arrangement exactly as it was.
  if (lock) {
    return <LockedTile tile={tile} lock={lock} editing={editing} onRemove={onRemove} onOpenMembership={onOpenMembership} />;
  }

  const props: TileProps = { tile, editing, onChange, onRemove };

  switch (tile.kind) {
    // Markets
    case 'chart':
      return <ChartTile tile={tile} editing={editing} onChange={onChange} onRemove={onRemove} />;
    case 'watchlist':
      return <WatchlistTile tile={tile} editing={editing} onChange={onChange} onRemove={onRemove} />;
    case 'news':
      return <NewsTile tile={tile} editing={editing} onChange={onChange} onRemove={onRemove} />;
    case 'calendar':
      return <CalendarTile tile={tile} editing={editing} onChange={onChange} onRemove={onRemove} />;
    case 'marketdata':
      return <MarketDataTile {...props} />;
    case 'streams':
      return <StreamTile {...props} />;
    case 'clock':
      return <ClockTile {...props} />;

    // The desk
    case 'positions':
      return (
        <PositionsTile tile={tile} editing={editing} onChange={onChange} onRemove={onRemove} onMeasure={onMeasure ?? (() => {})} />
      );
    case 'metrics':
      return <MetricsTile tile={tile} editing={editing} onRemove={onRemove} />;
    case 'alerts':
      return <AlertsTile tile={tile} editing={editing} onChange={onChange} onRemove={onRemove} />;
    case 'tradelog':
      return <TradeLogTile {...props} />;
    case 'closed':
      return <ClosedTradesTile {...props} />;
    case 'sessions':
      return <SessionsTile {...props} />;
    case 'funded':
      return <ManualBookTile {...props} />;
    case 'challenge':
      return <ChallengeTile {...props} />;
    case 'capital':
      return <CapitalTile {...props} />;

    // Personal
    case 'networth':
      return <NetWorthTile {...props} />;
    case 'portfolio':
      return <PortfolioTile {...props} />;
    case 'dividends':
      return <DividendsTile {...props} />;
    case 'todo':
      return <TodoTile {...props} />;
    case 'notes':
      return <NotesTile {...props} />;
    case 'announcements':
      return <AnnouncementsTile {...props} />;
    case 'patchnotes':
      return <PatchNotesTile {...props} />;

    // Studies and the team
    case 'studystats':
      return <StudyStatsTile {...props} />;
    case 'flashcards':
      return <FlashcardsTile {...props} />;
    case 'leaderboard':
      return <LeaderboardTile {...props} />;
    case 'teamchat':
      return <TeamChatTile {...props} />;

    default:
      // A kind saved by a newer build than this one is running. Say so rather
      // than rendering nothing — an empty cell reads as a broken tile.
      return <UnknownTile editing={editing} onRemove={onRemove} />;
  }
}

// What a paid or un-opted tile looks like on the board: named, marked with what
// it costs, and with the one place to go about it.
function LockedTile({
  tile,
  lock,
  editing,
  onRemove,
  onOpenMembership,
}: {
  tile: BoardTile;
  lock: TileLock;
  editing: boolean;
  onRemove: () => void;
  onOpenMembership?: () => void;
}) {
  const { user } = useAuth();
  const def = tileDef(tile.kind);
  const tier = lock.reason === 'feature' ? tierOfFeature(lock.feature, user?.access.membership) : null;

  return (
    <div style={wrap}>
      <div className="tile-header" style={{ ...header, cursor: editing ? 'move' : 'default' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7, minWidth: 0 }}>
          {editing && <span style={{ color: FAINT, fontSize: 13, lineHeight: 1 }}>⠿</span>}
          <Icon name="lock" size={13} color={FAINT} />
          <span style={{ fontSize: 12.5, fontWeight: 700, color: MUTED, whiteSpace: 'nowrap' }}>
            {tile.title || tileLabel(tile.kind)}
          </span>
          {tier && <TierMark tier={tier} size={11} dim />}
        </div>
        {editing && (
          <button className="no-drag" onClick={onRemove} style={removeBtn} title="Remove tile">
            ✕
          </button>
        )}
      </div>
      <div style={bodyBox}>
        <div style={{ fontSize: 11.5, color: MUTED, lineHeight: 1.6, marginBottom: 10 }}>
          {lock.reason === 'feature' ? (
            <>
              {FEATURE_LABELS[lock.feature]} is part of {tier ? TIER_LABELS[tier] : 'a paid'} membership.
            </>
          ) : lock.what === 'advancedTrading' ? (
            <>{def?.label ?? 'This tile'} reads your trading desk, which is switched off.</>
          ) : (
            <>{def?.label ?? 'This tile'} needs Funded Account, which is switched off.</>
          )}
        </div>
        {onOpenMembership && (
          <button className="no-drag" onClick={onOpenMembership} style={cta}>
            {lock.reason === 'feature' ? 'See memberships' : 'Premium Features'}
          </button>
        )}
      </div>
    </div>
  );
}

function UnknownTile({ editing, onRemove }: { editing: boolean; onRemove: () => void }) {
  return (
    <div style={wrap}>
      <div className="tile-header" style={{ ...header, cursor: editing ? 'move' : 'default' }}>
        <span style={{ fontSize: 12.5, fontWeight: 700, color: MUTED }}>{"Unavailable tile"}</span>
        {editing && (
          <button className="no-drag" onClick={onRemove} style={removeBtn} title="Remove tile">
            ✕
          </button>
        )}
      </div>
      <div style={bodyBox}>
        <div style={{ fontSize: 11.5, color: MUTED, lineHeight: 1.6 }}>
          {"This tile isn't available in this version of the terminal."}
        </div>
      </div>
    </div>
  );
}

const wrap: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  height: '100%',
  width: '100%',
  background: 'rgba(9,20,46,.75)',
  border: `1px dashed ${BORDER}`,
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
const bodyBox: CSSProperties = {
  flex: 1,
  minHeight: 0,
  overflowY: 'auto',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'flex-start',
  justifyContent: 'center',
  padding: '14px 16px',
};
const removeBtn: CSSProperties = {
  fontSize: 12,
  lineHeight: 1,
  color: '#ffb4ab',
  background: 'rgba(255,255,255,.05)',
  border: `1px solid #1c3a7a`,
  borderRadius: 6,
  padding: '4px 7px',
  cursor: 'pointer',
};
const cta: CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  color: '#0c2768',
  background: GOLD,
  border: 'none',
  borderRadius: 6,
  padding: '7px 11px',
  cursor: 'pointer',
  fontFamily: 'inherit',
};
