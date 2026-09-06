import { useState } from 'react';
import { C, tint } from '../../theme/tokens';
import { Icon } from '../../components/Icon';
import { youtubeId } from '../../../../marketing/render/render.mjs';
import type { Item, ItemKind, Link, LinkBehavior, Section } from './types';
import { ImageField, LinkField } from './FileField';
import { Area, Check, Group, Row, Text, labelStyle, moved } from './fields';

/**
 * The form for one section of the marketing page.
 *
 * WHICH FIELDS APPEAR IS DECIDED BY WHAT THE RENDERER DRAWS for the section's
 * type, and by what a block's kind renders — `apps/marketing/render/render.mjs`
 * is the authority, and this file mirrors it rather than inventing controls the
 * page would ignore. The portfolio editor learned that lesson the hard way:
 * fields that could be typed into and were never drawn.
 *
 * EVERY ADD OPENS THE SAME MENU: the section's own kind of thing (a card, in the
 * grid) and beside it the site-wide blocks — card, image, video, text, callout.
 * An item's `kind` says which; absent means the section's own.
 */

const BLOCKS: { kind: ItemKind; label: string; icon: string; note: string }[] = [
  { kind: 'card', label: 'Card', icon: 'file', note: 'A title, a paragraph and a link, in the grid style.' },
  { kind: 'image', label: 'Image', icon: 'image', note: 'A picture from File Uploads, with a caption.' },
  { kind: 'video', label: 'Video', icon: 'video', note: 'A YouTube video, embedded. Paste any YouTube link.' },
  { kind: 'text', label: 'Text', icon: 'text', note: 'A paragraph on its own.' },
  { kind: 'callout', label: 'Callout', icon: 'alert-triangle', note: 'A boxed note with a heading, like the boundary panel.' },
];

/** Which section-level fields each type renders, in the renderer's order. */
const SECTION_FIELDS: Record<string, string[]> = {
  hero: ['eyebrow', 'h1', 'h1Em', 'lede', 'buttons', 'fine'],
  grid: [],
  boundary: ['title', 'body', 'buttons'],
  early: ['title', 'body', 'buttons'],
  certificates: ['eyebrow', 'title', 'note'],
  gallery: ['eyebrow', 'title', 'note', 'frame'],
};
const has = (type: string, field: string) => (SECTION_FIELDS[type] ?? []).includes(field);

/**
 * What a block's form offers, by what the renderer draws for that kind. A
 * certificate is not a site-wide block — it is what a Certificates section
 * holds — so it is keyed here under its own name.
 */
type RowKind = ItemKind | 'certificate' | 'slide';
const ITEM_FIELDS: Record<RowKind, string[]> = {
  card: ['title', 'body', 'link'],
  image: ['image', 'title'],
  video: ['video', 'title'],
  text: ['body'],
  callout: ['title', 'body'],
  certificate: ['image', 'title', 'meta', 'credential', 'link'],
  slide: ['image', 'alt', 'title', 'caption'],
};

const CERTIFICATE = {
  label: 'Certificate',
  icon: 'plus',
  note: 'A badge image, the certificate, and the link that confirms it. No badge — it is listed below the tiles.',
};

const SLIDE = {
  label: 'Slide',
  icon: 'plus',
  note: 'An uploaded image, what it shows, and a caption.',
};

const kindOf = (item: Item, type: string): RowKind =>
  item.kind ?? (type === 'certificates' ? 'certificate' : type === 'gallery' ? 'slide' : 'card');
const str = (v: unknown) => (typeof v === 'string' ? v : '');
const links = (v: unknown) => (Array.isArray(v) ? (v as Link[]) : []);

export function SectionForm({ section, onChange }: { section: Section; onChange: (next: Section) => void }) {
  const set = (patch: Partial<Section>) => onChange({ ...section, ...patch });
  const type = section.type;
  const items = section.items ?? [];
  const setItem = (i: number, patch: Partial<Item>) =>
    set({ items: items.map((it, n) => (n === i ? { ...it, ...patch } : it)) });

  return (
    <div>
      <Group title="Section">
        {has(type, 'eyebrow') && (
          <Text label="Eyebrow" value={str(section.eyebrow)} onChange={(v) => set({ eyebrow: v })} />
        )}
        {has(type, 'h1') && (
          <Text label="Headline — first line" value={str(section.h1)} onChange={(v) => set({ h1: v })} />
        )}
        {has(type, 'h1Em') && (
          <Text
            label="Headline — second line, in gold"
            value={str(section.h1Em)}
            onChange={(v) => set({ h1Em: v || undefined })}
          />
        )}
        {has(type, 'title') && (
          <Text label="Title" value={str(section.title)} onChange={(v) => set({ title: v })} />
        )}
        {has(type, 'note') && (
          <Area label="Note" value={str(section.note)} onChange={(v) => set({ note: v || undefined })} rows={2} />
        )}
        {has(type, 'frame') && (
          <FrameField
            fit={section.imgFit ?? 'contain'}
            thumbs={section.thumbs !== false}
            onFit={(v) => set({ imgFit: v === 'contain' ? undefined : v })}
            onThumbs={(v) => set({ thumbs: v ? undefined : false })}
          />
        )}
        {has(type, 'lede') && (
          <Area label="Lede" value={str(section.lede)} onChange={(v) => set({ lede: v })} />
        )}
        {has(type, 'body') && (
          <Area label="Body" value={str(section.body)} onChange={(v) => set({ body: v })} rows={5} />
        )}
        {has(type, 'fine') && (
          <Text label="Fine print" value={str(section.fine)} onChange={(v) => set({ fine: v })} />
        )}
        <Check
          label="Hide this section from the live site"
          checked={section.hidden === true}
          onChange={(v) => set({ hidden: v || undefined })}
          note="It stays here and in the preview. Nothing is deleted."
        />
      </Group>

      {has(type, 'buttons') && (
        <Group title="Buttons">
          <LinkList value={links(section.buttons)} onChange={(v) => set({ buttons: v.length ? v : undefined })} />
        </Group>
      )}

      <Group title={`Content — ${items.length}`}>
        {items.map((item, i) => (
          <ItemRow
            key={i}
            item={item}
            type={type}
            index={i}
            count={items.length}
            onMove={(to) => set({ items: moved(items, i, to) })}
            onRemove={() => set({ items: items.filter((_, n) => n !== i) })}
            onChange={(patch) => setItem(i, patch)}
          />
        ))}
        <AddMenu type={type} onAdd={(item) => set({ items: [...items, item] })} />
      </Group>
    </div>
  );
}

function ItemRow({
  item,
  type,
  index,
  count,
  onMove,
  onRemove,
  onChange,
}: {
  item: Item;
  type: string;
  index: number;
  count: number;
  onMove: (to: number) => void;
  onRemove: () => void;
  onChange: (patch: Partial<Item>) => void;
}) {
  const kind = kindOf(item, type);
  const cert = kind === 'certificate';
  const slide = kind === 'slide';
  const label = cert ? CERTIFICATE.label : slide ? SLIDE.label : (BLOCKS.find((b) => b.kind === kind)?.label ?? 'Item');
  const media = kind === 'image' || kind === 'video';
  const name =
    str(item.title) ||
    str(item.alt) ||
    (kind === 'video' ? str(item.videoUrl) : '') ||
    str(item.body).slice(0, 40) ||
    `Untitled ${index + 1}`;
  return (
    <Row index={index} count={count} title={`${label} · ${name}`} onMove={onMove} onRemove={onRemove}>
      {ITEM_FIELDS[kind].map((field) => {
        switch (field) {
          case 'title':
            return (
              <Text
                key={field}
                label={media ? 'Caption' : slide ? 'Title — optional' : 'Title'}
                value={str(item.title)}
                onChange={(v) => onChange({ title: v })}
              />
            );
          case 'body':
            return <Area key={field} label="Body" value={str(item.body)} onChange={(v) => onChange({ body: v })} />;
          case 'alt':
            return (
              <div key={field}>
                <Text
                  label="What the image shows"
                  value={str(item.alt)}
                  onChange={(v) => onChange({ alt: v })}
                  placeholder="The Live Wall with three open positions"
                />
                {!str(item.alt).trim() && (
                  <p style={{ margin: '-6px 0 14px', font: `400 12px/1.6 ${C.sans}`, color: C.gold }}>
                    Needed — read aloud to anyone who cannot see the image, and shown if it fails to load.
                  </p>
                )}
              </div>
            );
          case 'caption':
            return (
              <Text
                key={field}
                label="Caption — optional"
                value={str(item.caption)}
                onChange={(v) => onChange({ caption: v || undefined })}
              />
            );
          case 'meta':
            return (
              <Text
                key={field}
                label="Issuer and date"
                value={str(item.meta)}
                onChange={(v) => onChange({ meta: v })}
                placeholder="Claude Academy · September 2026"
              />
            );
          case 'credential':
            return (
              <Text
                key={field}
                label="Credential ID — optional"
                value={str(item.credential)}
                onChange={(v) => onChange({ credential: v || undefined })}
              />
            );
          case 'link':
            return (
              <div key={field}>
                <LinkField
                  label={cert ? 'Confirmation link' : 'Link'}
                  href={str(item.href)}
                  behavior={item.behavior as LinkBehavior | undefined}
                  onHref={(v) => onChange({ href: v })}
                  onBehavior={(v) => onChange({ behavior: v })}
                />
                <Text
                  label="Link text"
                  value={str(item.linkLabel)}
                  onChange={(v) => onChange({ linkLabel: v })}
                  placeholder={cert ? 'Confirm completion' : undefined}
                />
              </div>
            );
          case 'image':
            return (
              <ImageField
                key={field}
                label={cert ? 'Badge image — optional' : 'Image'}
                src={str(item.imgSrc)}
                onChange={(v) => onChange({ imgSrc: v || undefined })}
              />
            );
          case 'video':
            return <VideoField key={field} value={str(item.videoUrl)} onChange={(v) => onChange({ videoUrl: v })} />;
          default:
            return null;
        }
      })}
    </Row>
  );
}

/**
 * How a slideshow frames its images, and whether the thumbnail strip is drawn.
 * `contain` shows the whole image (logos, screenshots); `cover` fills the frame
 * and crops (photos).
 */
function FrameField({
  fit,
  thumbs,
  onFit,
  onThumbs,
}: {
  fit: 'cover' | 'contain';
  thumbs: boolean;
  onFit: (v: 'cover' | 'contain') => void;
  onThumbs: (v: boolean) => void;
}) {
  const choice = (value: 'cover' | 'contain', label: string, note: string) => {
    const on = fit === value;
    return (
      <button
        type="button"
        onClick={() => onFit(value)}
        aria-pressed={on}
        style={{
          flex: 1,
          padding: '9px 10px',
          borderRadius: 8,
          border: `1px solid ${on ? C.gold : C.line}`,
          background: on ? tint(C.gold, 0.12) : 'transparent',
          textAlign: 'left',
          cursor: 'pointer',
        }}
      >
        <span style={{ display: 'block', font: `600 12.5px/1.4 ${C.sans}`, color: C.text }}>{label}</span>
        <span style={{ display: 'block', font: `400 12px/1.5 ${C.sans}`, color: C.faint }}>{note}</span>
      </button>
    );
  };
  return (
    <div style={{ marginBottom: 14 }}>
      <span style={labelStyle}>Image fit</span>
      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        {choice('contain', 'Whole image', 'Nothing cropped. Logos and screenshots.')}
        {choice('cover', 'Fill the frame', 'Edges cropped to fill. Photos.')}
      </div>
      <Check label="Show thumbnails under the slideshow" checked={thumbs} onChange={onThumbs} />
    </div>
  );
}

/** A YouTube link, with the read-back beside it: the id the page will embed. */
function VideoField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const id = youtubeId(value);
  return (
    <div style={{ marginBottom: 14 }}>
      <Text label="YouTube link" value={value} onChange={onChange} placeholder="https://youtu.be/…" mono />
      {value.trim() && (
        <p style={{ margin: '-6px 0 0', font: `400 12px/1.6 ${C.sans}`, color: id ? C.faint : '#d99aa8' }}>
          {id ? `Embeds video ${id}.` : 'That is not a YouTube link the page can embed.'}
        </p>
      )}
    </div>
  );
}

/** The add menu: the section's own item first, then every block the site knows. */
function AddMenu({ type, onAdd }: { type: string; onAdd: (item: Item) => void }) {
  const [open, setOpen] = useState(false);
  // A certificates section holds certificates and nothing else: a card between
  // two badges would be an item the section cannot draw.
  const own = type === 'grid' ? BLOCKS[0] : type === 'certificates' ? CERTIFICATE : type === 'gallery' ? SLIDE : null;
  const blocks =
    type === 'certificates' || type === 'gallery'
      ? []
      : BLOCKS.filter((b) => !own || b.kind !== ('kind' in own ? own.kind : ''));

  const choice = (b: { label: string; note: string; icon: string }, item: Item, key: string) => (
    <button
      key={key}
      type="button"
      onClick={() => {
        onAdd(item);
        setOpen(false);
      }}
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: 10,
        width: '100%',
        padding: '9px 10px',
        marginBottom: 2,
        borderRadius: 7,
        border: 'none',
        background: 'transparent',
        textAlign: 'left',
        cursor: 'pointer',
      }}
    >
      <span style={{ flex: 'none', marginTop: 2 }}>
        <Icon name={b.icon} size={13} color={C.gold} />
      </span>
      <span style={{ minWidth: 0 }}>
        <span style={{ display: 'block', font: `600 12.5px/1.4 ${C.sans}`, color: C.text }}>{b.label}</span>
        <span style={{ display: 'block', font: `400 12px/1.5 ${C.sans}`, color: C.faint }}>{b.note}</span>
      </span>
    </button>
  );

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 8,
          padding: '9px 14px',
          borderRadius: 8,
          border: `1px dashed ${C.line2}`,
          background: 'transparent',
          color: C.muted,
          font: `500 13px/1 ${C.sans}`,
          fontFamily: C.sans,
          cursor: 'pointer',
        }}
      >
        <Icon name="plus" size={13} color={C.muted} />
        Add
      </button>
    );
  }
  return (
    <div style={{ border: `1px dashed ${C.line2}`, borderRadius: 9, padding: 8, background: tint('#000000', 0.12) }}>
      <span style={{ ...labelStyle, padding: '4px 10px 2px' }}>Add to this section</span>
      {own && choice({ ...own, icon: 'plus' }, {}, 'own')}
      {own && <div style={{ height: 1, background: C.line, margin: '6px 8px' }} />}
      {blocks.map((b) => choice(b, { kind: b.kind }, b.kind))}
      <button
        type="button"
        onClick={() => setOpen(false)}
        style={{
          display: 'block',
          margin: '6px 0 2px 10px',
          background: 'none',
          border: 'none',
          padding: 0,
          color: C.faint,
          font: `500 12px/1 ${C.sans}`,
          fontFamily: C.sans,
          cursor: 'pointer',
        }}
      >
        Cancel
      </button>
    </div>
  );
}

/** Buttons and nav links: a label, a link, filled or outlined. */
export function LinkList({
  value,
  onChange,
  noun = 'button',
}: {
  value: Link[];
  onChange: (v: Link[]) => void;
  noun?: string;
}) {
  const setAt = (i: number, patch: Partial<Link>) => onChange(value.map((x, n) => (n === i ? { ...x, ...patch } : x)));
  return (
    <>
      {value.map((b, i) => (
        <Row
          key={i}
          index={i}
          count={value.length}
          title={b.label || `${noun[0].toUpperCase()}${noun.slice(1)} ${i + 1}`}
          onMove={(to) => onChange(moved(value, i, to))}
          onRemove={() => onChange(value.filter((_, n) => n !== i))}
        >
          <Text label="Label" value={b.label ?? ''} onChange={(v) => setAt(i, { label: v })} />
          <LinkField
            label="Link"
            href={b.href ?? ''}
            behavior={b.behavior}
            onHref={(v) => setAt(i, { href: v })}
            onBehavior={(v) => setAt(i, { behavior: v })}
          />
          <div style={{ marginBottom: 4 }}>
            <span style={labelStyle}>Style</span>
            <div style={{ display: 'flex', gap: 8 }}>
              {(
                [
                  ['filled', false],
                  ['outlined', true],
                ] as const
              ).map(([name, ghost]) => (
                <button
                  key={name}
                  type="button"
                  onClick={() => setAt(i, { ghost: ghost || undefined })}
                  style={{
                    padding: '7px 13px',
                    borderRadius: 7,
                    border: `1px solid ${!!b.ghost === ghost ? C.gold : C.line2}`,
                    background: !!b.ghost === ghost ? tint(C.gold, 0.12) : 'transparent',
                    color: !!b.ghost === ghost ? C.gold : C.muted,
                    font: `500 12.5px/1 ${C.sans}`,
                    fontFamily: C.sans,
                    cursor: 'pointer',
                    textTransform: 'capitalize',
                  }}
                >
                  {name}
                </button>
              ))}
            </div>
          </div>
        </Row>
      ))}
      <button
        type="button"
        onClick={() => onChange([...value, { label: noun === 'link' ? 'Link' : 'Button', href: '#' }])}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 8,
          padding: '9px 14px',
          borderRadius: 8,
          border: `1px dashed ${C.line2}`,
          background: 'transparent',
          color: C.muted,
          font: `500 13px/1 ${C.sans}`,
          fontFamily: C.sans,
          cursor: 'pointer',
        }}
      >
        <Icon name="plus" size={13} color={C.muted} />
        Add {noun}
      </button>
    </>
  );
}
