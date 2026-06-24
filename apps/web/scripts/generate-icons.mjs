// One-off generator for the PWA / home screen icons.
//
// It rasterizes an on-brand SVG (solid navy #0A2A6B background with a centered
// gold "V") into the PNG files the manifest and the Apple touch icon point at.
// The maskable variant keeps its art inside the safe zone so a launcher can
// crop it to any shape without clipping the mark.
//
// This is a development-time tool, not part of the build. To regenerate the
// PNGs after editing the art, install sharp and run this script:
//   npm install --no-save sharp
//   node scripts/generate-icons.mjs
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import sharp from 'sharp';

const here = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.resolve(here, '..', 'public');

const NAVY = '#0A2A6B';

// The gold "V" as a standalone SVG. `scale` shrinks the mark toward the centre
// so the maskable icon stays clear of the launcher crop. The navy background is
// always full bleed, which is what maskable icons expect.
function iconSvg(scale) {
  const cx = 256;
  const cy = 256;
  const t = `translate(${cx} ${cy}) scale(${scale}) translate(${-cx} ${-cy})`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <defs>
    <linearGradient id="vtsGold" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#EBCB74"/>
      <stop offset="1" stop-color="#C9A24B"/>
    </linearGradient>
  </defs>
  <rect x="0" y="0" width="512" height="512" fill="${NAVY}"/>
  <g transform="${t}">
    <polyline points="140,150 256,372 372,150" fill="none" stroke="url(#vtsGold)"
              stroke-width="64" stroke-linecap="round" stroke-linejoin="round"/>
  </g>
</svg>`;
}

async function render(svg, size, outFile) {
  const png = await sharp(Buffer.from(svg))
    .resize(size, size)
    .png()
    .toBuffer();
  const out = path.join(publicDir, outFile);
  await sharp(png).toFile(out);
  console.log(`wrote ${outFile} (${size}x${size})`);
}

async function main() {
  // Standard icons: the mark fills most of the square.
  await render(iconSvg(1), 192, 'icon-192.png');
  await render(iconSvg(1), 512, 'icon-512.png');
  // Maskable: pull the mark into the safe zone so launchers can crop freely.
  await render(iconSvg(0.66), 512, 'icon-512-maskable.png');
  // Apple touch icon: iOS rounds the corners itself, so full bleed is fine.
  await render(iconSvg(1), 180, 'apple-touch-icon-180.png');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
