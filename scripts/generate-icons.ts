import fs from 'fs';
import path from 'path';
import { PNG } from 'pngjs';

const publicDir = path.resolve('public');
const iconsDir = path.join(publicDir, 'icons');
if (!fs.existsSync(iconsDir)) {
  fs.mkdirSync(iconsDir, { recursive: true });
}

// Colors from our theme
// #110B11 -> [17, 11, 17]
// #B7990D -> [183, 153, 13]
// #F2F4CB -> [242, 244, 203]

const sizes = [16, 32, 48, 128];

for (const size of sizes) {
  const png = new PNG({ width: size, height: size });
  const center = size / 2;
  const radius = size * 0.44;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const idx = (size * y + x) << 2;
      const dx = x - center;
      const dy = y - center;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist <= radius) {
        // Gold/brass circular badge with subtle border
        if (dist > radius - Math.max(1, size * 0.08)) {
          // #F2F4CB border
          png.data[idx] = 242;
          png.data[idx + 1] = 244;
          png.data[idx + 2] = 203;
          png.data[idx + 3] = 255;
        } else {
          // #110B11 dark background
          png.data[idx] = 17;
          png.data[idx + 1] = 11;
          png.data[idx + 2] = 17;
          png.data[idx + 3] = 255;
        }
      } else {
        // Transparent
        png.data[idx] = 0;
        png.data[idx + 1] = 0;
        png.data[idx + 2] = 0;
        png.data[idx + 3] = 0;
      }
    }
  }

  // Draw musical waveform bars in #B7990D gold
  const drawBar = (xPercent: number, hPercent: number) => {
    const xStart = Math.floor(size * xPercent);
    const barWidth = Math.max(1, Math.floor(size * 0.12));
    const barHeight = Math.floor(size * hPercent);
    const yStart = Math.floor(center - barHeight / 2);

    for (let x = xStart; x < xStart + barWidth; x++) {
      for (let y = yStart; y < yStart + barHeight; y++) {
        if (x >= 0 && x < size && y >= 0 && y < size) {
          const idx = (size * y + x) << 2;
          png.data[idx] = 183;
          png.data[idx + 1] = 153;
          png.data[idx + 2] = 13;
          png.data[idx + 3] = 255;
        }
      }
    }
  };

  drawBar(0.24, 0.35);
  drawBar(0.44, 0.55);
  drawBar(0.64, 0.40);

  const outPath = path.join(iconsDir, `icon${size}.png`);
  fs.writeFileSync(outPath, PNG.sync.write(png));
  console.log(`Generated ${outPath}`);
}
