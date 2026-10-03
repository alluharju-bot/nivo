import {
  readFileSync,
  readdirSync,
  copyFileSync,
  mkdirSync,
  writeFileSync,
  existsSync,
} from 'node:fs';
import { join } from 'node:path';

const output = 'public/licenses';
mkdirSync(output, { recursive: true });
const app = JSON.parse(readFileSync('package.json', 'utf8'));
const visited = new Set();
const lines = [
  'Nivo — third-party notices',
  '',
  'Nivo application code: MIT. Third-party components retain their own licenses.',
  'This distribution uses the OpenCascade CAD library through Replicad and OpenCascade.js.',
  'The CAD WebAssembly module is provided separately under LGPL-2.1-only.',
  'OCCT has an additional exception; OpenCascade.js remains LGPL-2.1.',
  'License texts are included alongside this notice.',
  '',
  'Corresponding upstream source and build configuration:',
  'Replicad and its WASM package (1.1.0, git e4b05f67dc4e2393a876ce8c5064a9c93db05bf1):',
  'https://github.com/sgenoud/replicad/tree/e4b05f67dc4e2393a876ce8c5064a9c93db05bf1',
  'Build recipe: packages/replicad-opencascadejs/build-config and build-source in that tree.',
  'OpenCascade.js toolchain image: ghcr.io/taucad/opencascade.js:canary-ebd263f1-single-threaded',
  'https://github.com/taucad/opencascade.js/tree/ebd263f1',
  'OpenCascade Technology: https://github.com/Open-Cascade-SAS/OCCT',
  'Upstream OpenCascade.js: https://github.com/donalffons/opencascade.js',
  '',
  'The unmodified kernel can be replaced or rebuilt independently of Nivo.',
  'See docs/architecture.md for integration and replacement instructions.',
  '',
  'Installed runtime dependencies:',
];
function collect(name) {
  if (visited.has(name)) return;
  visited.add(name);
  const dir = join('node_modules', name),
    pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'));
  const license = readdirSync(dir).filter((f) =>
    /^(license|licence|copying|notice)(\.|$|-)/i.test(f),
  );
  const stem = name.replaceAll('/', '__');
  for (const file of license) copyFileSync(join(dir, file), join(output, `${stem}-${file}`));
  lines.push(
    `${name} ${pkg.version}: ${pkg.license ?? 'See package license'} (${license.map((f) => `${stem}-${f}`).join(', ')})`,
  );
  for (const dependency of Object.keys(pkg.dependencies ?? {})) collect(dependency);
  for (const dependency of Object.keys({ ...pkg.peerDependencies, ...pkg.optionalDependencies }))
    if (existsSync(join('node_modules', dependency, 'package.json'))) collect(dependency);
}
for (const dependency of Object.keys(app.dependencies)) collect(dependency);
writeFileSync(join(output, 'NOTICE.txt'), `${lines.join('\n')}\n`);
