const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const OLD = '@agentickit';
const NEW = '@agentic-kit';
const PKGS = ['utils','core','memory','tools','tools-builtin','context','agents','kit'];

// Fix package.json files
for (const name of PKGS) {
  const p = path.join(ROOT, 'packages', name, 'package.json');
  const src = fs.readFileSync(p, 'utf8');
  const updated = src.replace(new RegExp('@agentickit/', 'g'), NEW + '/');
  if (updated !== src) {
    fs.writeFileSync(p, updated, 'utf8');
    console.log('updated pkg: ' + path.join('packages', name, 'package.json'));
  }
}

// Fix rollup configs
for (const name of PKGS) {
  const f = path.join(ROOT, 'packages', name, 'rollup.config.mjs');
  if (!fs.existsSync(f)) continue;
  const src = fs.readFileSync(f, 'utf8');
  const updated = src.replace(new RegExp('@agentickit/', 'g'), NEW + '/');
  if (updated !== src) {
    fs.writeFileSync(f, updated, 'utf8');
    console.log('updated rollup: ' + path.join('packages', name, 'rollup.config.mjs'));
  }
}

// Fix src import lines only (line-by-line, import statements only)
const srcDirs = ['agents','context','tools-builtin','kit','memory'];
for (const name of srcDirs) {
  const srcDir = path.join(ROOT, 'packages', name, 'src');
  if (!fs.existsSync(srcDir)) continue;
  const walk = (d) => {
    const results = [];
    for (const f of fs.readdirSync(d)) {
      const fp = path.join(d, f);
      if (fs.statSync(fp).isDirectory()) results.push(...walk(fp));
      else if (f.endsWith('.ts')) results.push(fp);
    }
    return results;
  };
  for (const f of walk(srcDir)) {
    const lines = fs.readFileSync(f, 'utf8').split('\n');
    let changed = false;
    for (let i = 0; i < lines.length; i++) {
      if (/^import /.test(lines[i]) && lines[i].includes('@agentickit/')) {
        lines[i] = lines[i].replace(/@agentickit\//g, NEW + '/');
        changed = true;
      }
    }
    if (changed) {
      fs.writeFileSync(f, lines.join('\n'), 'utf8');
      console.log('updated src: ' + f);
    }
  }
}

console.log('\nAll done. New scope: ' + NEW);
