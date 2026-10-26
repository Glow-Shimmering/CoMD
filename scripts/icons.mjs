import fs from 'node:fs/promises';
import sharp from 'sharp';
import pngToIco from 'png-to-ico';
// One vector master is used for the dock icon, Windows resources and in-app branding.
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">
  <defs>
    <linearGradient id="paper" x1="0" y1="0" x2="0.7" y2="1"><stop stop-color="#ffffff"/><stop offset="1" stop-color="#f3f7ff"/></linearGradient>
    <linearGradient id="blue" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#3c7cff"/><stop offset="1" stop-color="#2458de"/></linearGradient>
  </defs>
  <rect x="42" y="50" width="940" height="940" rx="216" fill="#152a5512"/>
  <rect x="42" y="34" width="940" height="940" rx="216" fill="url(#paper)" stroke="#dbe5f4" stroke-width="3"/>
  <rect x="58" y="50" width="908" height="908" rx="202" fill="none" stroke="#fff" stroke-width="3"/>
  <path d="M612 309C571 278 522 264 472 268C344 278 256 383 256 512C256 641 344 746 472 756C522 760 571 746 612 715" fill="none" stroke="url(#blue)" stroke-width="90" stroke-linecap="round"/>
  <path d="M698 348h80M738 348v328M698 676h80" fill="none" stroke="#6ba0ff" stroke-width="49" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`;
await fs.mkdir('build/icon.iconset', { recursive: true });
await fs.writeFile('build/icon.svg', svg);
await fs.mkdir('src/assets', { recursive: true });
await fs.writeFile('src/assets/comd-icon.svg', svg);
await sharp(Buffer.from(svg)).png().toFile('build/icon.png');
for (const size of [16,32,128,256,512]) {
  await sharp(Buffer.from(svg)).resize(size).png().toFile(`build/icon.iconset/icon_${size}x${size}.png`);
  await sharp(Buffer.from(svg)).resize(size * 2).png().toFile(`build/icon.iconset/icon_${size}x${size}@2x.png`);
}
await fs.writeFile('build/icon.ico', await pngToIco(['build/icon.iconset/icon_256x256.png', 'build/icon.iconset/icon_32x32.png', 'build/icon.iconset/icon_16x16.png']));
const entries = [];
for (const [type, size] of [['icp4',16],['icp5',32],['icp6',64],['ic07',128],['ic08',256],['ic09',512],['ic10',1024]]) {
  const png = await sharp(Buffer.from(svg)).resize(size).png().toBuffer();
  const header = Buffer.alloc(8); header.write(type); header.writeUInt32BE(8 + png.length, 4); entries.push(header, png);
}
const icnsHeader = Buffer.alloc(8); icnsHeader.write('icns'); icnsHeader.writeUInt32BE(8 + entries.reduce((sum, entry) => sum + entry.length, 0), 4);
await fs.writeFile('build/icon.icns', Buffer.concat([icnsHeader, ...entries]));
console.log('CoMD icons generated.');
