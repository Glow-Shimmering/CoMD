import fs from 'node:fs/promises';
import path from 'node:path';
const lock = JSON.parse(await fs.readFile('package-lock.json', 'utf8'));
let output = 'CoMD — Third-party notices\n\nCoMD is an independent Markdown editor, not an OpenAI product.\nThe following open-source packages are bundled into the renderer.\nElectron and Chromium notices are also supplied with the desktop distribution.\n';
for (const [dir, info] of Object.entries(lock.packages)) {
  if (!dir || info.dev) continue;
  const pkg = JSON.parse(await fs.readFile(path.join(dir, 'package.json'), 'utf8'));
  output += `\n${'='.repeat(72)}\n${pkg.name} ${pkg.version}\nLicense: ${pkg.license ?? 'See package license'}\n`;
  const names = (await fs.readdir(dir)).filter(name => /^(licen[sc]e|copying|notice)(\.|$)/i.test(name));
  for (const name of names) { const stat = await fs.stat(path.join(dir, name)); if (stat.isFile()) output += '\n' + await fs.readFile(path.join(dir, name), 'utf8') + '\n'; }
}
await fs.writeFile('THIRD-PARTY-NOTICES.txt', output);
console.log('Third-party notices generated.');
