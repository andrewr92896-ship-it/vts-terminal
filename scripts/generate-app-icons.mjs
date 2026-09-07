// One-off generator for every deployment's home-screen and browser icons.
//
// THREE DEPLOYMENTS, TWO PIECES OF ART, ONE SET OF RULES. The private terminal
// signs in under gold VTS on orange; the landing page and the public terminal
// (which is also where the demo runs) share the navy one. Each app keeps its own
// copy of its source art under its own brand directory, the way the wordmark
// already is — the deployments do not share a public directory, so a shared file
// would have to be copied at build time by something that crosses the boundary.
//
// This is a development-time tool, NOT part of any build. To regenerate after
// editing a piece of source art:
//   npm install --no-save sharp
//   node scripts/generate-app-icons.mjs
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import sharp from 'sharp';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// THE ICONS ARE CIRCLES (owner instruction, 2026-09), cut from square art. The
// corners are transparent, which is what makes the circle a circle in a browser
// tab, a bookmark and an Android launcher.
//
// iOS IS THE EXCEPTION AND IT IS THE PLATFORM'S, NOT OURS: a home-screen icon
// there is composited over black and then masked to Apple's own squircle, so a
// transparent corner shows as a black one. That is still a visible circle, which
// is what was asked for; filling the corners with the ground colour instead
// would make it a rounded square again.
//
// The MASKABLE icon is deliberately NOT circled. Its whole contract is that the
// launcher owns the shape and the art must bleed to the edges — a circle there
// would be cropped a second time, into a smaller circle with a transparent ring
// around it.
const targets = [
  {
    name: 'private terminal',
    art: 'apps/web/public/brand/vts-app-icon.png',
    outDir: 'apps/web/public',
    icons: [
      { file: 'icon-192.png', size: 192, shape: 'circle' },
      { file: 'icon-512.png', size: 512, shape: 'circle' },
      { file: 'icon-512-maskable.png', size: 512, shape: 'square' },
      { file: 'apple-touch-icon-180.png', size: 180, shape: 'circle' },
    ],
  },
  {
    name: 'public terminal (and the demo)',
    art: 'apps/public-terminal/public/brand/vts-app-icon.png',
    outDir: 'apps/public-terminal/public',
    // No manifest here, deliberately — the public terminal is not installable —
    // so there is no maskable variant to generate.
    icons: [
      { file: 'icon-192.png', size: 192, shape: 'circle' },
      { file: 'apple-touch-icon-180.png', size: 180, shape: 'circle' },
    ],
  },
  {
    name: 'landing page',
    art: 'apps/marketing/src/brand/vts-app-icon.png',
    outDir: 'apps/marketing/src',
    icons: [
      { file: 'icon-192.png', size: 192, shape: 'circle' },
      { file: 'apple-touch-icon-180.png', size: 180, shape: 'circle' },
    ],
  },
];

// How far a pixel may sit from its row's ground colour and still be ground. The
// two populations are far apart in both pieces of art — 95% of pixels are within
// 4 of the ground and the mark is 225 and up — so this sits in the empty middle
// rather than at either edge. At 24 a single corner pixel of noise read as the
// mark and put the orange art's measurement at 70% of the width.
const GROUND_TOLERANCE = 60;

// The circle keeps the inscribed disc, so the mark has to be inside it. The
// maskable icon is cropped harder: a launcher may use any shape, so only the
// centred circle of 80% diameter is guaranteed to survive.
const CIRCLE_RADIUS = 0.5;
const MASKABLE_RADIUS = 0.4;

// THE GROUND IS READ PER ROW, from that row's left edge, so a vertical gradient
// counts as ground rather than as the mark. The navy art is a gradient and the
// orange one is flat; a single corner sample only works for the second.
async function contentRadius(artPath) {
  const { data, info } = await sharp(artPath).raw().toBuffer({ resolveWithObject: true });
  const { width: w, height: h, channels } = info;
  const cx = w / 2, cy = h / 2;
  let maxR = 0;
  for (let y = 0; y < h; y++) {
    const g = y * w * channels;
    const groundR = data[g], groundG = data[g + 1], groundB = data[g + 2];
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * channels;
      const distance = Math.abs(data[i] - groundR) + Math.abs(data[i + 1] - groundG) + Math.abs(data[i + 2] - groundB);
      if (distance < GROUND_TOLERANCE) continue;
      maxR = Math.max(maxR, Math.hypot(x - cx, y - cy));
    }
  }
  return maxR / w;
}

const circleMask = (size) =>
  Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}"><circle cx="${size / 2}" cy="${size / 2}" r="${size / 2}" fill="#fff"/></svg>`,
  );

async function render(artPath, { file, size, shape }, outDir) {
  const art = sharp(artPath).resize(size, size);
  const out = shape === 'circle'
    // `dest-in` keeps the art only where the mask is opaque, so the corners come
    // out transparent rather than painted.
    ? art.composite([{ input: circleMask(size), blend: 'dest-in' }])
    : art;
  await out.png().toFile(path.join(outDir, file));
  console.log(`  ${file} (${size}x${size}, ${shape})`);
}

async function main() {
  for (const target of targets) {
    const artPath = path.join(repoRoot, target.art);
    const radius = await contentRadius(artPath);
    const needed = target.icons.some((i) => i.shape === 'square') ? MASKABLE_RADIUS : CIRCLE_RADIUS;
    console.log(`${target.name}: mark reaches ${(radius * 100).toFixed(1)}% of the width from centre (budget ${needed * 100}%)`);
    if (radius > needed) {
      console.error(`  The mark does not fit. Shrink it into the centre of ${target.art} and let the ground bleed to the edges.`);
      process.exit(1);
    }
    for (const icon of target.icons) await render(artPath, icon, path.join(repoRoot, target.outDir));
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
