import { useEffect, useRef, useState, type ReactNode } from 'react';
import { employeeApi, type DirectoryEntry, type WorkingStatus } from '../api';
import { EMP, RADIUS, tint } from '../theme';
import { T, useCopy } from '../copy';
import { Button, Card, ErrorNote, Select, label } from '../ui';
import { fileToSquareDataUrl, readImageSize } from '../image';
import { Avatar } from './Overview';
import { Icon } from '../../components/Icon';

// Two things that belong to the person, not to HR: their headshot, and where
// they are working from today.
//
// The roster beside the dropzone is the design's "N still need a photo" nudge.
// It is deliberately a gentle count and a caption, not a leaderboard — the point
// is to make the directory useful, not to single anyone out.

export const WORKING_LABELS: Record<WorkingStatus, string> = {
  in_office: 'In office',
  remote: 'Remote',
  away: 'Away',
};

export const WORKING_COLORS: Record<WorkingStatus, string> = {
  in_office: EMP.green,
  remote: '#7a6a9e',
  away: EMP.faint,
};

const MIN_EDGE = 400;

export function Photos({
  myStatus,
  canManageAll,
  onStatusChanged,
  onPhotoChanged,
}: {
  myStatus: WorkingStatus;
  // Founder-level. A developer can set anyone's headshot, because otherwise the
  // directory only fills up as fast as the least motivated person on it.
  canManageAll: boolean;
  onStatusChanged: (s: WorkingStatus) => void;
  onPhotoChanged: () => void;
}) {
  const [people, setPeople] = useState<DirectoryEntry[] | null>(null);
  // Which upload is in flight: a person's id, or 'me' for the dropzone.
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [note, setNote] = useState('');
  // Which control the note belongs under, so confirming a roster action does not
  // appear inside the dropzone you did not touch.
  const [noteFor, setNoteFor] = useState<'me' | 'roster'>('me');
  const [dragging, setDragging] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const forRef = useRef<HTMLInputElement>(null);
  const targetRef = useRef<DirectoryEntry | null>(null);
  const guidance = useCopy('emp.photos.guidance', 'Square JPG or PNG, at least 400×400');

  function load() {
    employeeApi
      .directory()
      .then((r) => setPeople(r.people))
      .catch((e) => setError((e as Error).message));
  }
  useEffect(load, []);

  // `person` is null for your own photo, which goes through the self-service
  // route. Anyone else's goes through the developer one — a developer's own face
  // should not be audited as an administrative act.
  async function upload(file: File, person: DirectoryEntry | null) {
    setError('');
    setNote('');
    if (!file.type.startsWith('image/')) {
      setError('Choose an image file.');
      return;
    }
    setNoteFor(person ? 'roster' : 'me');
    setBusyId(person ? person.userId : 'me');
    try {
      const { width, height } = await readImageSize(file);
      if (width < MIN_EDGE || height < MIN_EDGE) {
        setError(`That image is ${width}×${height}. It needs to be at least ${MIN_EDGE}×${MIN_EDGE}.`);
        return;
      }
      const dataUrl = await fileToSquareDataUrl(file);
      if (person) {
        const r = await employeeApi.setPhotoFor(person.userId, dataUrl);
        setPeople(r.people);
        setNote(`Photo added for ${person.name}.`);
      } else {
        await employeeApi.setPhoto(dataUrl);
        setNote('Photo updated.');
        load();
      }
      onPhotoChanged();
    } catch (e) {
      setError((e as Error).message || 'Could not upload that image.');
    } finally {
      setBusyId(null);
      if (fileRef.current) fileRef.current.value = '';
      if (forRef.current) forRef.current.value = '';
    }
  }

  function pickFor(person: DirectoryEntry) {
    setError('');
    setNote('');
    setNoteFor('roster');
    targetRef.current = person;
    forRef.current?.click();
  }

  async function removeFor(person: DirectoryEntry) {
    setError('');
    setNote('');
    setNoteFor('roster');
    setBusyId(person.userId);
    try {
      const r = await employeeApi.setPhotoFor(person.userId, '');
      setPeople(r.people);
      setNote(`Removed ${person.name}'s photo.`);
      onPhotoChanged();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusyId(null);
    }
  }

  async function changeStatus(next: WorkingStatus) {
    onStatusChanged(next);
    try {
      await employeeApi.setWorkingStatus(next);
      load();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  const missing = (people ?? []).filter((p) => !p.hasPhoto).length;

  return (
    <Card pad={0}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          flexWrap: 'wrap',
          padding: '14px 16px',
          borderBottom: `1px solid ${EMP.lineSoft}`,
        }}
      >
        <div style={{ minWidth: 0 }}>
          <div style={{ fontFamily: EMP.serif, fontSize: 17, fontWeight: 700, color: EMP.text }}>
            <T id="emp.photos.title">Employee photos</T>
          </div>
          <div style={{ fontSize: 12.5, color: EMP.muted, marginTop: 2 }}>
            <T id="emp.photos.subtitle">
              A face next to a name makes the directory worth opening.
            </T>
          </div>
        </div>
        {missing > 0 && (
          <span
            style={{
              marginLeft: 'auto',
              fontSize: 12,
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '0.4px',
              color: EMP.accent,
              background: EMP.redBg,
              border: `1px solid ${EMP.redBorder}`,
              borderRadius: RADIUS.chip,
              padding: '5px 9px',
              whiteSpace: 'nowrap',
            }}
          >
            {/* A live count, so not editable copy — the words around it are. */}
            {missing}{' '}
            {missing === 1 ? (
              <T id="emp.photos.missing_one">still needs a photo</T>
            ) : (
              <T id="emp.photos.missing">still need a photo</T>
            )}
          </span>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,250px) 1fr', gap: 14, padding: 16 }}>
        {/* Dropzone */}
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            const file = e.dataTransfer.files?.[0];
            if (file) void upload(file, null);
          }}
          style={{
            border: `2px dashed ${dragging ? EMP.accent : '#cfd8d5'}`,
            background: dragging ? tint(EMP.accent, 0.06) : '#f7f9f8',
            borderRadius: RADIUS.card,
            padding: 20,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 9,
            textAlign: 'center',
            minHeight: 210,
          }}
        >
          <span
            style={{
              width: 52,
              height: 52,
              borderRadius: '50%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: EMP.panel,
              border: `1px solid ${EMP.line}`,
              color: EMP.muted,
            }}
          >
            <Icon name="camera" size={22} />
          </span>
          <div style={{ fontSize: 13.5, fontWeight: 700, color: EMP.text }}>
            <T id="emp.photos.drop">Drop your headshot here</T>
          </div>
          <div style={{ fontSize: 12, color: EMP.muted, lineHeight: 1.5 }}>{guidance}</div>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            style={{ display: 'none' }}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void upload(file, null);
            }}
          />
          <Button
            variant="primary"
            disabled={busyId === 'me'}
            onClick={() => fileRef.current?.click()}
            style={{ background: EMP.forest, color: '#ffffff' }}
          >
            {busyId === 'me' ? (
              <T id="emp.photos.uploading">Uploading…</T>
            ) : (
              <T id="emp.photos.choose">Choose a file</T>
            )}
          </Button>
          {note && noteFor === 'me' && <div style={{ fontSize: 12, color: EMP.green }}>{note}</div>}
        </div>

        {/* Roster */}
        <div>
          <div style={{ ...label, marginBottom: 10 }}>
            <T id="emp.photos.roster">Who has one</T>
          </div>
          {canManageAll && (
            <div style={{ fontSize: 12, color: EMP.faint, marginTop: -5, marginBottom: 11, lineHeight: 1.5 }}>
              <T id="emp.photos.dev_hint">
                You can add a photo for anyone here. Each change is recorded in the activity log.
              </T>
            </div>
          )}
          {/* One shared picker for the roster; targetRef says whose it is. */}
          <input
            ref={forRef}
            type="file"
            accept="image/*"
            style={{ display: 'none' }}
            onChange={(e) => {
              const file = e.target.files?.[0];
              const person = targetRef.current;
              if (file && person) void upload(file, person);
            }}
          />
          {!people ? (
            <div style={{ fontSize: 13, color: EMP.muted }}>
              <T id="emp.photos.loading">Loading…</T>
            </div>
          ) : (
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(96px, 1fr))',
                gap: 14,
              }}
            >
              {people.map((p) => (
                <div key={p.userId} style={{ textAlign: 'center', minWidth: 0 }}>
                  <Avatar name={p.name} url={p.avatarUrl} size={72} />
                  <div
                    style={{
                      fontSize: 12.5,
                      fontWeight: 600,
                      color: EMP.text,
                      marginTop: 7,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {shortName(p.name)}
                  </div>
                  <div
                    style={{
                      fontSize: 10.5,
                      fontWeight: 700,
                      textTransform: 'uppercase',
                      letterSpacing: '0.4px',
                      marginTop: 2,
                      color: p.hasPhoto ? EMP.green : EMP.accent,
                    }}
                  >
                    {p.hasPhoto ? (
                      <T id="emp.photos.has">Photo added</T>
                    ) : (
                      <T id="emp.photos.needs">Needs photo</T>
                    )}
                  </div>
                  {canManageAll && !p.isMe && (
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'center',
                        gap: 8,
                        marginTop: 5,
                        fontSize: 11.5,
                      }}
                    >
                      {busyId === p.userId ? (
                        <span style={{ color: EMP.faint }}>
                          <T id="emp.photos.tile_busy">Working…</T>
                        </span>
                      ) : (
                        <>
                          <TileAction onClick={() => pickFor(p)}>
                            {p.hasPhoto ? (
                              <T id="emp.photos.tile_replace">Replace</T>
                            ) : (
                              <T id="emp.photos.tile_add">Add</T>
                            )}
                          </TileAction>
                          {p.hasPhoto && (
                            <TileAction muted onClick={() => void removeFor(p)}>
                              <T id="emp.photos.tile_remove">Remove</T>
                            </TileAction>
                          )}
                        </>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
          {note && noteFor === 'roster' && (
            <div style={{ fontSize: 12, color: EMP.green, marginTop: 11 }}>{note}</div>
          )}
        </div>
      </div>

      {error && (
        <div style={{ padding: '0 16px 14px' }}>
          <ErrorNote>{error}</ErrorNote>
        </div>
      )}

      {/* Working status — where you are today. */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          flexWrap: 'wrap',
          padding: '13px 16px',
          borderTop: `1px solid ${EMP.lineSoft}`,
        }}
      >
        <div style={{ minWidth: 0 }}>
          <div style={{ ...label }}>
            <T id="emp.photos.working">Where you are working today</T>
          </div>
          <div style={{ fontSize: 12, color: EMP.faint, marginTop: 3 }}>
            <T id="emp.photos.working_hint">
              Shown beside your name in the directory. Only you can change it.
            </T>
          </div>
        </div>
        <div style={{ marginLeft: 'auto', minWidth: 170 }}>
          <Select
            value={myStatus}
            onChange={changeStatus}
            options={(['in_office', 'remote', 'away'] as WorkingStatus[]).map((v) => ({
              value: v,
              label: WORKING_LABELS[v],
            }))}
          />
        </div>
      </div>
    </Card>
  );
}

// A plain text link under a roster tile. Small on purpose: this is a developer
// affordance on someone else's record, not a primary action.
function TileAction({
  onClick,
  muted,
  children,
}: {
  onClick: () => void;
  muted?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        background: 'none',
        border: 'none',
        padding: 0,
        cursor: 'pointer',
        fontFamily: EMP.sans,
        fontSize: 11.5,
        fontWeight: 600,
        color: muted ? EMP.faint : EMP.accent,
      }}
    >
      {children}
    </button>
  );
}

// "Dana Whitfield" -> "Dana W." — the roster tiles are narrow, and a first name
// with an initial is what the design shows.
function shortName(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length < 2) return name;
  return `${parts[0]} ${parts[parts.length - 1][0]}.`;
}
