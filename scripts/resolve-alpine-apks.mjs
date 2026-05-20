import { readFileSync } from 'node:fs';

const [, , indexPath, ...requestedPackages] = process.argv;

if (!indexPath || requestedPackages.length === 0) {
  console.error('Usage: node scripts/resolve-alpine-apks.mjs <APKINDEX> <package...>');
  process.exit(1);
}

const packageBlocks = readFileSync(indexPath, 'utf8').trim().split(/\n\n+/);
const packages = packageBlocks.map((block) => {
  const fields = new Map();
  for (const line of block.split('\n')) {
    fields.set(line.slice(0, 1), line.slice(2));
  }
  return {
    name: fields.get('P'),
    version: fields.get('V'),
    size: Number(fields.get('S') || 0),
    deps: (fields.get('D') || '').split(/\s+/).filter(Boolean),
    provides: (fields.get('p') || '').split(/\s+/).filter(Boolean)
  };
});

const byName = new Map();
const byProvider = new Map();

for (const pkg of packages) {
  byName.set(pkg.name, pkg);
  for (const provided of pkg.provides) {
    byProvider.set(normalizeDependency(provided), pkg);
  }
}

function normalizeDependency(token) {
  return token.replace(/^!/, '').split(/[<>=~]/)[0];
}

function resolvePackage(token) {
  const key = normalizeDependency(token);
  if (!key || key.startsWith('/')) return null;
  return byName.get(key) || byProvider.get(key) || null;
}

const queue = [...requestedPackages];
const resolved = new Map();

for (let index = 0; index < queue.length; index += 1) {
  const pkg = resolvePackage(queue[index]);
  if (!pkg || resolved.has(pkg.name)) continue;
  resolved.set(pkg.name, pkg);
  queue.push(...pkg.deps);
}

for (const pkg of [...resolved.values()].sort((a, b) => a.name.localeCompare(b.name))) {
  console.log(`${pkg.name}\t${pkg.version}\t${pkg.name}-${pkg.version}.apk\t${pkg.size}`);
}
