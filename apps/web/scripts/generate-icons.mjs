// One-off generator for the PWA / home screen icons.
//
// It rasterizes the on-brand "VTS" source art (a navy gradient background with
// the gold VTS wordmark and divider, in public/brand/vts-app-icon.png) into the
// PNG files the manifest and the Apple touch icon point at. The maskable variant
// pulls the art into the safe zone and re-extends the same navy gradient to the
// edges so a launcher can crop it to any shape without clipping the wordmark.
//
// This is a development-time tool, not part of the build. To regenerate the
// PNGs after editing the source art, install sharp and run this script:
//   npm install --no-save sharp
//   node scripts/generate-icons.mjs
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import sharp from 'sharp';

const here = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.resolve(here, '..', 'public');
const SOURCE = path.join(publicDir, 'brand', 'vts-app-icon.png');

// The navy gradient of the source art, top to bottom. Kept in sync with the
// background of vts-app-icon.png so the maskable padding blends seamlessly.
const NAVY_TOP = '#0D2F79';
const NAVY_BOTTOM = '#143C98';

// Full-bleed square with the same navy gradient as the source background.
function backgroundSvg(size) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <defs>
    <linearGradient id="navy" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${NAVY_TOP}"/>
      <stop offset="1" stop-color="${NAVY_BOTTOM}"/>
    </linearGradient>
  </defs>
  <rect x="0" y="0" width="${size}" height="${size}" fill="url(#navy)"/>
</svg>`;
}

// Standard / Apple icons: the source art fills the whole square.
async function renderFull(size, outFile) {
  const out = path.join(publicDir, outFile);
  await sharp(SOURCE).resize(size, size).png().toFile(out);
  console.log(`wrote ${outFile} (${size}x${size})`);
}

// Maskable icon: shrink the art toward the centre (into the safe zone) and let
// the matching navy gradient bleed to the edges so launchers can crop freely.
async function renderMaskable(size, scale, outFile) {
  const inner = Math.round(size * scale);
  const art = await sharp(SOURCE).resize(inner, inner).png().toBuffer();
  const out = path.join(publicDir, outFile);
  await sharp(Buffer.from(backgroundSvg(size)))
    .composite([{ input: art, gravity: 'center' }])
    .png()
    .toFile(out);
  console.log(`wrote ${outFile} (${size}x${size}, art @ ${Math.round(scale * 100)}%)`);
}

async function main() {
  await renderFull(192, 'icon-192.png');
  await renderFull(512, 'icon-512.png');
  await renderMaskable(512, 0.8, 'icon-512-maskable.png');
  // Apple touch icon: iOS rounds the corners itself, so full bleed is fine.
  await renderFull(180, 'apple-touch-icon-180.png');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
