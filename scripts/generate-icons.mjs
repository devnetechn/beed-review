import sharp from "sharp";
import { mkdirSync } from "fs";
import path from "path";

const outDir = path.join(process.cwd(), "public", "icons");
mkdirSync(outDir, { recursive: true });

function iconSvg(size, fontSize, yRatio) {
  return `<svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">
  <rect width="${size}" height="${size}" fill="#6d5dc4"/>
  <text x="${size / 2}" y="${size * yRatio}" font-family="Poppins, Arial, sans-serif" font-size="${fontSize}" font-weight="700" fill="#ffffff" text-anchor="middle">W</text>
</svg>`;
}

const targets = [
  { file: "icon-192.png", size: 192, fontSize: 108, yRatio: 0.67 },
  { file: "icon-512.png", size: 512, fontSize: 290, yRatio: 0.67 },
  { file: "icon-maskable-512.png", size: 512, fontSize: 180, yRatio: 0.6 },
];

for (const t of targets) {
  const svg = iconSvg(t.size, t.fontSize, t.yRatio);
  await sharp(Buffer.from(svg)).png().toFile(path.join(outDir, t.file));
  console.log(`Generated public/icons/${t.file}`);
}
