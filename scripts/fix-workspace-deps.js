const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const PKGS = ['utils','core','memory','tools','tools-builtin','context','skills','workflow','agents','kit'];
const SCOPE = '@agenticforge/';

for (const name of PKGS) {
  const p = path.join(ROOT, 'packages', name, 'package.json');
  const pkg = JSON.parse(fs.readFileSync(p, 'utf8'));
  let changed = false;
  for (const field of ['dependencies','peerDependencies','devDependencies']) {
    if (!pkg[field]) continue;
    for (const dep of Object.keys(pkg[field])) {
      if (dep.startsWith(SCOPE) && !pkg[field][dep].startsWith('workspace:')) {
        pkg[field][dep] = 'workspace:^';
        changed = true;
      }
    }
  }
  if (changed) {
    fs.writeFileSync(p, JSON.stringify(pkg, null, 2) + '\n', 'utf8');
    console.log('fixed workspace deps: ' + name);
  }
}
console.log('done');
