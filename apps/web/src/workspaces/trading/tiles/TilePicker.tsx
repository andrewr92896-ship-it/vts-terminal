import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { useAuth } from '../../../auth/AuthContext';
import { hasEntitlement, tierOfFeature } from '../../../auth/access';
import { Icon } from '../../../components/Icon';
import { TierMark } from '../../../components/TierMark';
import type { BoardTileKind } from '../../../api/types';
import { TILE_CATALOG, TILE_GROUPS, tileLock, type TileDef, type TileGroup } from '../tileCatalog';
import { BORDER2, FAINT, GOLD, MUTED, TEXT } from '../tvChart';

// The "add a tile" catalog.
//
// It replaced a row of "+ Chart / + Watchlist / + News …" buttons, which worked
// at seven tile kinds and would have been a wrapping wall of them at
// twenty-three. Grouped by where a tile's data comes from, because that is the
// question somebody adding one is actually asking.
//
// Every kind is listed, including the ones this account cannot reach — marked
// with the tier it costs, or with a padlock where the fix is an opt-in the user
// already owns rather than a payment. Hiding them would mean a free account
// could not see what upgrading gives them, which is the rule the sidebar rows,
// the stream rail and the Studies tiles all follow.

const MENU_W = 330;

export function TilePicker({
  onAdd,
  onOpenMembership,
}: {
  onAdd: (kind: BoardTileKind) => void;
  /** Sends the reader to My Terminal ▸ Premium Features. */
  onOpenMembership?: () => void;
}) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const [group, setGroup] = useState<TileGroup>('markets');
  const btnRef = useRef<HTMLButtonElement>(null);

  // Same lifecycle as the preset picker: a body-portalled menu that can never
  // float detached from its button.
  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('resize', close);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const features = user?.access.features ?? { advancedTrading: false, funded: false };
  const entitled = (f: Parameters<typeof hasEntitlement>[1]) => hasEntitlement(user, f);
  const membership = user?.access.membership;

  function toggle() {
    if (!open && btnRef.current) setRect(btnRef.current.getBoundingClientRect());
    setOpen((v) => !v);
  }

  const rows = TILE_CATALOG.filter((t) => t.group === group);

  return (
    <>
      <button ref={btnRef} onClick={toggle} style={addBtn}>
        <Icon name="plus" size={13} color="#0c2768" />
        <span>Add a tile</span>
        <Icon name="chevron-down" size={12} color="#0c2768" />
      </button>
      {open &&
        rect &&
        createPortal(
          <>
            <div onClick={() => setOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 200 }} />
            <div
              style={{
                position: 'fixed',
                top: rect.bottom + 6,
                left: Math.max(8, Math.min(rect.left, window.innerWidth - MENU_W - 8)),
                width: Math.min(MENU_W, window.innerWidth - 16),
                maxHeight: 'calc(66 * var(--vh))',
                display: 'flex',
                flexDirection: 'column',
                background: '#0C1C3C',
                border: `1px solid ${BORDER2}`,
                borderRadius: 10,
                boxShadow: '0 16px 40px rgba(0,0,0,.5)',
                zIndex: 201,
                overflow: 'hidden',
              }}
            >
              {/* Group rail — the tabs across the top. Wraps rather than
                  scrolling sideways, so every label stays readable in full. */}
              <div style={groupBar}>
                {TILE_GROUPS.map((g) => (
                  <button key={g.key} onClick={() => setGroup(g.key)} style={groupBtn(g.key === group)}>
                    {g.label}
                  </button>
                ))}
              </div>
              <div style={{ overflowY: 'auto', padding: 6 }}>
                {rows.map((t) => {
                  const lock = tileLock(t.kind, features, entitled);
                  const tier = t.feature ? tierOfFeature(t.feature, membership) : null;
                  return (
                    <TileRow
                      key={t.kind}
                      def={t}
                      locked={!!lock}
                      lockKind={lock?.reason ?? null}
                      tier={tier}
                      onPick={() => {
                        if (lock) {
                          // A locked row leads somewhere rather than doing
                          // nothing: both answers live on the same screen —
                          // memberships and the opt-ins sit side by side there.
                          setOpen(false);
                          onOpenMembership?.();
                          return;
                        }
                        setOpen(false);
                        onAdd(t.kind);
                      }}
                    />
                  );
                })}
              </div>
            </div>
          </>,
          document.body,
        )}
    </>
  );
}

function TileRow({
  def,
  locked,
  lockKind,
  tier,
  onPick,
}: {
  def: TileDef;
  locked: boolean;
  lockKind: 'optIn' | 'feature' | null;
  tier: ReturnType<typeof tierOfFeature>;
  onPick: () => void;
}) {
  return (
    <button onClick={onPick} style={rowStyle(locked)}>
      <span style={{ flex: '0 0 20px', display: 'inline-flex', justifyContent: 'center' }}>
        <Icon name={def.icon} size={15} color={locked ? FAINT : GOLD} />
      </span>
      <span style={{ flex: 1, minWidth: 0, textAlign: 'left' }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 12.5, fontWeight: 600, color: locked ? MUTED : TEXT }}>{def.label}</span>
          {/* What it costs, drawn for everybody — a marker states a price, it is
              not a lock. An opt-in is a padlock instead: nothing to buy. */}
          {tier ? (
            <TierMark tier={tier} size={11} dim={locked} />
          ) : lockKind === 'optIn' ? (
            <Icon name="lock" size={10} color={FAINT} />
          ) : null}
        </span>
        <span style={{ display: 'block', fontSize: 10.5, color: FAINT, lineHeight: 1.45, marginTop: 2 }}>
          {def.blurb}
        </span>
      </span>
    </button>
  );
}

const addBtn: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
  border: 'none',
  background: `linear-gradient(180deg,${GOLD},#C9A24B)`,
  color: '#0c2768',
  fontWeight: 700,
  fontSize: 11.5,
  fontFamily: 'inherit',
  padding: '8px 12px',
  borderRadius: 7,
  cursor: 'pointer',
};
const groupBar: CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: 4,
  padding: 7,
  borderBottom: `1px solid ${BORDER2}`,
  background: 'rgba(4,12,30,.45)',
  flex: '0 0 auto',
};
function groupBtn(active: boolean): CSSProperties {
  return {
    fontSize: 10.5,
    fontWeight: 700,
    color: active ? '#0c2768' : '#cbd8f5',
    background: active ? GOLD : 'rgba(255,255,255,.05)',
    border: 'none',
    borderRadius: 6,
    padding: '5px 9px',
    cursor: 'pointer',
    fontFamily: 'inherit',
  };
}
function rowStyle(locked: boolean): CSSProperties {
  return {
    display: 'flex',
    alignItems: 'flex-start',
    gap: 9,
    width: '100%',
    background: 'transparent',
    border: 'none',
    borderRadius: 7,
    padding: '8px 8px',
    cursor: 'pointer',
    fontFamily: 'inherit',
    opacity: locked ? 0.72 : 1,
  };
}
