import { useCallback, useEffect, useState } from 'react';
import { api, ApiError } from '../../../api/client';
import { useAuth } from '../../../auth/AuthContext';
import type { BoardTile, DeskAccount, DeskInstrument } from '../../../api/types';
import { OrderTicket } from '../OrderTicket';
import { TileFrame, TileMessage, TileSelect, useTileData } from './TileFrame';
import { invalidateFeed } from './tileFeed';

// The order ticket, on the Live Wall.
//
// It renders the SAME `OrderTicket` the Live Trades screen renders, given the
// same inputs, rather than a board-sized imitation of it. That is deliberate and
// is the whole design of this tile: it is the one thing on the wall that can
// move money, so every rule about sizing, protective levels, the venue's own
// precision, the double-click guard and the review-then-confirm step has to be
// the one set of rules. A second ticket is a second place for those to drift,
// and the failure mode is a real order at a size or a stop nobody meant.
//
// What the tile adds is only which account and which instrument, both stored ON
// THE TILE — so a board can carry a EUR/USD ticket on the forex account beside a
// BTC one on the spot account, and each opens where it was left.

const ACCOUNTS_MS = 60_000;

export function TicketTile({
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
  const { user } = useAuth();
  const readOnly = !!user?.access.readOnlyWorkspaces.includes('trading');
  const { data, error } = useTileData('trading:desk-accounts', () => api.deskAccounts(), ACCOUNTS_MS);
  const accounts: DeskAccount[] = data?.accounts ?? [];

  const [instruments, setInstruments] = useState<DeskInstrument[]>([]);
  const [instrumentError, setInstrumentError] = useState<string | null>(null);

  // The account this ticket trades on. A stored id that is no longer connected
  // falls back rather than leaving the tile blank — a connection can be removed
  // long after a board was arranged. Practice first among the fallbacks, the
  // same preference the Live Trades screen makes: it is the safer of the two to
  // land on if somebody opens a ticket and starts typing.
  const stored = tile.accountId;
  const account =
    accounts.find((a) => a.connectionId === stored) ??
    accounts.find((a) => a.env === 'practice') ??
    accounts[0] ??
    null;
  const connectionId = account?.connectionId ?? null;

  // The tradeable set is per account, so it reloads whenever the account does.
  useEffect(() => {
    if (!connectionId) {
      setInstruments([]);
      return;
    }
    let cancelled = false;
    setInstrumentError(null);
    void (async () => {
      try {
        const { instruments: list } = await api.deskInstruments(connectionId);
        if (!cancelled) setInstruments(list);
      } catch (e) {
        if (!cancelled) {
          setInstrumentError(e instanceof ApiError ? e.message : 'Could not load this account’s instruments');
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [connectionId]);

  // Keep the tile's instrument tradeable on the account it is pointed at. An
  // OANDA entity and a Kraken spot account share almost nothing, so switching
  // account has to re-resolve this or the ticket sits on a symbol that will only
  // ever be refused.
  const instrument =
    tile.instrument && instruments.some((i) => i.instrument === tile.instrument)
      ? tile.instrument
      : (instruments.find((i) => i.instrument === 'EUR/USD')?.instrument ?? instruments[0]?.instrument ?? '');

  // Every other tile reading the desk is showing state this order just changed,
  // so drop the shared answers rather than leaving a board reporting the
  // pre-trade book until each tile's own poll comes round.
  const afterPlaced = useCallback(() => {
    invalidateFeed('trading:desk-accounts');
    invalidateFeed('trading:live');
    invalidateFeed('trading:history');
    invalidateFeed('trading:capital');
  }, []);

  return (
    <TileFrame
      title={tile.title || 'Order Ticket'}
      icon="send"
      editing={editing}
      onRemove={onRemove}
      controls={
        accounts.length > 1 ? (
          <TileSelect
            value={connectionId ?? ''}
            onChange={(v) => onChange({ accountId: v || undefined, instrument: undefined })}
            title="Which account this ticket trades on"
            options={accounts.map((a) => ({ value: a.connectionId, label: a.label }))}
            width={150}
          />
        ) : null
      }
    >
      {!data && !error && <TileMessage>{"Loading your accounts…"}</TileMessage>}
      {error && !data && <TileMessage tone="error">{error}</TileMessage>}
      {data && accounts.length === 0 && (
        <TileMessage>
          {"No tradeable account connected. Add one under Live Trades ▸ Connections."}
        </TileMessage>
      )}
      {instrumentError && <TileMessage tone="error">{instrumentError}</TileMessage>}
      {account && instruments.length > 0 && (
        <OrderTicket
          // Keyed on the account so switching one resets the ticket outright
          // rather than carrying a half-typed size across to another venue.
          key={account.connectionId}
          account={account}
          instruments={instruments}
          instrument={instrument}
          onInstrument={(v) => onChange({ instrument: v })}
          readOnly={readOnly}
          onPlaced={afterPlaced}
        />
      )}
    </TileFrame>
  );
}
