import JSZip from 'jszip';
import { fileToScaledDataUrl } from './image';

// Turn an uploaded PowerPoint (.pptx) into study-guide slides. A .pptx is a zip
// of Open-XML parts: each slide is `ppt/slides/slideN.xml`, its images live in
// `ppt/media/` and are wired up through `ppt/slides/_rels/slideN.xml.rels`.
// Google Slides has no upload format of its own — users export it as .pptx
// (File ▸ Download ▸ Microsoft PowerPoint), so this covers both.
//
// We pull the title placeholder + body text and the first embedded raster image
// per slide, then hand them to the existing guide builder so the user can
// refine, add screenshots, and save with the normal flow.

export interface ParsedSlide {
  title: string;
  body: string;
  image: string | null;
}

const SLIDE_RE = /^ppt\/slides\/slide(\d+)\.xml$/;

export async function parsePptx(file: File): Promise<ParsedSlide[]> {
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(file);
  } catch {
    throw new Error('Could not open that file. Make sure it’s a PowerPoint (.pptx).');
  }

  const slideEntries = Object.keys(zip.files)
    .map((name) => {
      const m = SLIDE_RE.exec(name);
      return m ? { name, idx: Number(m[1]) } : null;
    })
    .filter((v): v is { name: string; idx: number } => v !== null)
    .sort((a, b) => a.idx - b.idx);

  if (slideEntries.length === 0) {
    throw new Error('That file has no slides — is it a PowerPoint (.pptx)?');
  }

  const parser = new DOMParser();
  const out: ParsedSlide[] = [];

  for (const { name, idx } of slideEntries) {
    const xml = await zip.files[name].async('string');
    const doc = parser.parseFromString(xml, 'application/xml');

    let title = '';
    const bodyParts: string[] = [];

    for (const sp of Array.from(doc.getElementsByTagName('p:sp'))) {
      const text = shapeText(sp);
      if (!text) continue;
      const phType = sp.getElementsByTagName('p:ph')[0]?.getAttribute('type') ?? '';
      if (!title && (phType === 'title' || phType === 'ctrTitle')) {
        title = firstLine(text);
        const rest = text.slice(title.length).trim();
        if (rest) bodyParts.push(rest);
      } else {
        bodyParts.push(text);
      }
    }

    let body = bodyParts.join('\n\n').trim();
    if (!title) {
      // No title placeholder — promote the first line of the slide's text.
      title = firstLine(body);
      body = body.slice(title.length).trim();
    }

    const image = await firstImage(zip, parser, idx);
    out.push({ title: title.slice(0, 200), body: body.slice(0, 4000), image });
  }

  return out;
}

// All the text of one shape, paragraph by paragraph (blank lines dropped).
function shapeText(sp: Element): string {
  return Array.from(sp.getElementsByTagName('a:p'))
    .map((p) =>
      Array.from(p.getElementsByTagName('a:t'))
        .map((t) => t.textContent ?? '')
        .join('')
        .trim(),
    )
    .filter(Boolean)
    .join('\n')
    .trim();
}

function firstLine(s: string): string {
  const i = s.indexOf('\n');
  return (i === -1 ? s : s.slice(0, i)).trim();
}

// The first embedded raster image on a slide, scaled to an inline data URL.
async function firstImage(zip: JSZip, parser: DOMParser, idx: number): Promise<string | null> {
  try {
    const slideFile = zip.files[`ppt/slides/slide${idx}.xml`];
    const relsFile = zip.files[`ppt/slides/_rels/slide${idx}.xml.rels`];
    if (!slideFile || !relsFile) return null;

    const slideDoc = parser.parseFromString(await slideFile.async('string'), 'application/xml');
    const embed = slideDoc.getElementsByTagName('a:blip')[0]?.getAttribute('r:embed');
    if (!embed) return null;

    const relsDoc = parser.parseFromString(await relsFile.async('string'), 'application/xml');
    const target = Array.from(relsDoc.getElementsByTagName('Relationship'))
      .find((r) => r.getAttribute('Id') === embed)
      ?.getAttribute('Target');
    if (!target) return null;

    const path = resolveTarget(target);
    // Canvas can't rasterize vector/metafile formats — skip them rather than fail.
    if (/\.(emf|wmf|svg)$/i.test(path)) return null;
    const mediaFile = zip.files[path];
    if (!mediaFile) return null;

    const blob = await mediaFile.async('blob');
    const asFile = new File([blob], path.split('/').pop() ?? 'image');
    return await fileToScaledDataUrl(asFile);
  } catch {
    return null;
  }
}

// Resolve a rels Target (relative to ppt/slides/) into a zip path, collapsing
// any leading `../` — e.g. "../media/image1.png" → "ppt/media/image1.png".
function resolveTarget(target: string): string {
  const stack: string[] = [];
  for (const part of `ppt/slides/${target}`.split('/')) {
    if (part === '..') stack.pop();
    else if (part && part !== '.') stack.push(part);
  }
  return stack.join('/');
}
