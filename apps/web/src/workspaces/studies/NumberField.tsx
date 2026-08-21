import { useState, type CSSProperties } from 'react';

// A number input that can actually be EMPTY while it is being typed into.
//
// The obvious controlled spelling —
//
//   <input type="number" value={n} onChange={e => set(Number(e.target.value) || 0)} />
//
// cannot represent an empty box. Clearing it makes `Number('')` fall through to
// the fallback, which is painted straight back into the field, so the box reads
// "0" the instant it is emptied and the next digit typed lands AFTER that zero:
// clearing a weight and typing 30 gives "030". The same fault sits on any input
// spelled this way, whatever its fallback.
//
// So the field keeps the raw text it is being given while it has focus, and only
// falls back to the committed number once focus leaves — at which point the
// clamped, canonical value is what shows. The parent still receives a number on
// every keystroke (`emptyValue` while the box is blank), so nothing downstream
// has to cope with a half-typed string.
export function NumberField({
  value,
  onChange,
  min,
  max,
  emptyValue,
  style,
  title,
  disabled,
}: {
  value: number;
  onChange: (n: number) => void;
  min: number;
  max: number;
  // What the parent is told the value is while the box is blank. Not what is
  // displayed — the box stays empty — so it can differ from `min` where zero is
  // a meaningful answer.
  emptyValue: number;
  style?: CSSProperties;
  title?: string;
  disabled?: boolean;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const clamp = (n: number) => Math.max(min, Math.min(max, n));
  return (
    <input
      type="number"
      inputMode="numeric"
      min={min}
      max={max}
      title={title}
      disabled={disabled}
      value={draft ?? String(value)}
      onChange={(e) => {
        const raw = e.target.value;
        setDraft(raw);
        const n = Number(raw);
        onChange(raw === '' || Number.isNaN(n) ? emptyValue : clamp(n));
      }}
      onFocus={(e) => e.currentTarget.select()}
      onBlur={() => setDraft(null)}
      style={style}
    />
  );
}
