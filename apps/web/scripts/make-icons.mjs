// Renders public/favicon.svg into the PNG icons the PWA manifest and the Android app need.
//   node scripts/make-icons.mjs
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const svg = readFileSync(join(root, 'public', 'favicon.svg'));
const pub = (name) => join(root, 'public', name);

async function png(size, out, { padding = 0, background } = {}) {
  const inner = Math.round(size * (1 - padding * 2));
  let img = sharp(svg, { density: 384 }).resize(inner, inner);
  if (padding > 0 || background) {
    img = sharp({
      create: { width: size, height: size, channels: 4, background: background ?? { r: 0, g: 0, b: 0, alpha: 0 } },
    }).composite([{ input: await img.png().toBuffer(), gravity: 'center' }]);
  }
  writeFileSync(out, await img.png().toBuffer());
}

await png(192, pub('pwa-192.png'));
await png(512, pub('pwa-512.png'));
await png(180, pub('apple-touch-icon.png'));
// maskable icons need the artwork inside the central 80% "safe zone"
await png(512, pub('maskable-512.png'), { padding: 0.1, background: { r: 30, g: 79, b: 216, alpha: 1 } });

// Android launcher icons (used after `npx cap add android`)
const androidRes = join(root, 'android', 'app', 'src', 'main', 'res');
const densities = { mdpi: 48, hdpi: 72, xhdpi: 96, xxhdpi: 144, xxxhdpi: 192 };
if (!existsSync(join(root, 'android', 'app', 'src', 'main'))) {
  console.log('Android project not created yet (npx cap add android); skipped launcher icons.');
} else {
  for (const [name, size] of Object.entries(densities)) {
    const dir = join(androidRes, `mipmap-${name}`);
    mkdirSync(dir, { recursive: true });
    await png(size, join(dir, 'ic_launcher.png'));
    await png(size, join(dir, 'ic_launcher_round.png'));
    // adaptive icon foreground is 108dp with the artwork inside the 66dp safe zone
    const fg = Math.round((size * 108) / 48);
    await png(fg, join(dir, 'ic_launcher_foreground.png'), { padding: 0.19 });
  }
  console.log('Android launcher icons written.');
}
console.log('Web icons written to public/.');
