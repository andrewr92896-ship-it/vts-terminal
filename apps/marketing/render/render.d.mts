// Types for render.mjs, so the private API and the portal's preview can import
// the renderer with a typecheck behind them. The runtime is the .mjs; this file
// only describes it. Keep the two in step.

export type Behavior = 'link' | 'download' | 'preview';

export type Link = { label: string; href: string; ghost?: boolean; behavior?: Behavior };

export type ItemKind = 'card' | 'image' | 'video' | 'text' | 'callout';

export type Item = {
  kind?: ItemKind;
  title?: string;
  body?: string;
  imgSrc?: string;
  videoUrl?: string;
  href?: string;
  linkLabel?: string;
  behavior?: Behavior;
  [key: string]: unknown;
};

export type SectionType = 'hero' | 'grid' | 'boundary' | 'early';

export type Section = {
  id: string;
  type: SectionType;
  hidden?: boolean;
  anchor?: boolean;
  eyebrow?: string;
  h1?: string;
  h1Em?: string;
  title?: string;
  lede?: string;
  body?: string;
  fine?: string;
  buttons?: Link[];
  items: Item[];
  [key: string]: unknown;
};

export type Model = {
  head: { title: string; description: string; ogTitle: string; ogDescription: string };
  bar: { mark: string; markEm: string; links: Link[] };
  sections: Section[];
  footer: { copyright: string; fine: string };
};

export function esc(v: unknown): string;
export function youtubeId(input: unknown): string | null;
export function referencedFiles(model: unknown): string[];
export function renderMarketing(
  model: Model,
  opts?: { stylesheet?: string; scripts?: boolean; files?: string },
): string;
export function renderMarketingBody(model: Model, opts?: { files?: string }): string;
export function validateMarketing(model: unknown): string | null;
