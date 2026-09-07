// One-off generator for the PWA / home screen icons.
//
// It rasterizes the on-brand "VTS" source art (public/brand/vts-app-icon.png)
// into the PNG files the manifest and the Apple touch icon point at. These are
// the PRIVATE terminal's icons only: the public terminal builds from
// apps/public-terminal/public and ships no manifest and no touch icon, and the
// marketing site has its own assets again.
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

// A launcher may crop a maskable icon to any shape, so only the centred circle
// of 80% diameter is guaranteed to survive. THE ART IS FULL BLEED IN EVERY
// VARIANT, INCLUDING THE MASKABLE ONE — which is only correct while the mark
// itself sits inside that circle, so it is measured rather than assumed. Art
// that outgrows it has to be padded instead, and a wordmark clipped by a
// circular mask is the kind of thing nobody notices until it is on a phone.
const SAFE_RADIUS = 0.4;

// How far a pixel may sit from the ground colour and still be ground. The two
// populations are far apart — 95% of the art's pixels are within 4 of the
// ground and the mark's are 225 and up — so this sits in the empty middle
// rather than at either edge. At 24 a single corner pixel of sensor-ish noise
// read as the mark and put the measurement at 70% of the width.
const GROUND_TOLERANCE = 60;

// Everything that is not the flat ground colour counts as the mark. The ground
// is read from the corner rather than assumed, so re-colouring the art needs no
// edit here.
async function contentRadius() {
  const { data, info } = await sharp(SOURCE).raw().toBuffer({ resolveWithObject: true });
  const { width: w, height: h, channels } = info;
  const groundR = data[0], groundG = data[1], groundB = data[2];
  const cx = w / 2, cy = h / 2;
  let maxR = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * channels;
      const distance = Math.abs(data[i] - groundR) + Math.abs(data[i + 1] - groundG) + Math.abs(data[i + 2] - groundB);
      if (distance < GROUND_TOLERANCE) continue;
      maxR = Math.max(maxR, Math.hypot(x - cx, y - cy));
    }
  }
  return maxR / w;
}

// The source art fills the whole square. iOS rounds the corners of the Apple
// touch icon itself, so full bleed is right there too.
async function renderFull(size, outFile) {
  const out = path.join(publicDir, outFile);
  await sharp(SOURCE).resize(size, size).png().toFile(out);
  console.log(`wrote ${outFile} (${size}x${size})`);
}

async function main() {
  const radius = await contentRadius();
  console.log(`mark reaches ${(radius * 100).toFixed(1)}% of the width from centre (safe zone ${SAFE_RADIUS * 100}%)`);
  if (radius > SAFE_RADIUS) {
    console.error('The mark leaves the maskable safe zone. Pad the source art, or shrink it into the centre and let the ground bleed to the edges.');
    process.exit(1);
  }

  await renderFull(192, 'icon-192.png');
  await renderFull(512, 'icon-512.png');
  await renderFull(512, 'icon-512-maskable.png');
  await renderFull(180, 'apple-touch-icon-180.png');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
