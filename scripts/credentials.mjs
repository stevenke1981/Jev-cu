import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export const configEnvFile = (home = os.homedir()) => path.join(home, '.agents', 'jev-cu', '.env');

export function readEnvKey(file, name = 'OPENROUTER_API_KEY') {
  if (!file) return null;
  let content;
  try { content = fs.readFileSync(file, 'utf8'); }
  catch (err) { if (err.code === 'ENOENT') return null; throw new Error('Cannot read Jev credential file. Check local file permissions.'); }
  for (const line of content.split('\n')) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (match?.[1] === name) {
      const value = match[2].replace(/^['"]|['"]$/g, '').trim();
      if (value) return value;
    }
  }
  return null;
}

// Keep credentials outside skill discovery, backups and the repository.
// --force replaces skill files only; rotating an existing key is explicit.
export function installCredentials({ home, root, updateKey = false }) {
  const destination = configEnvFile(home);
  const directory = path.dirname(destination);
  for (const item of [path.dirname(directory), directory, destination]) {
    try {
      if (fs.lstatSync(item).isSymbolicLink()) throw new Error('Refusing a symlink in the Jev credential destination.');
    } catch (err) { if (err.code !== 'ENOENT') throw err; }
  }
  if (fs.existsSync(destination) && !updateKey) {
    return { path: destination, status: 'preserved', configured: Boolean(readEnvKey(destination)) };
  }
  const key = readEnvKey(path.join(root, '.env.local'));
  if (updateKey && !key) throw new Error('--update-key requires OPENROUTER_API_KEY in the project .env.local.');
  if (key && /[\s"'#=\u0000]/.test(key)) throw new Error('Invalid OPENROUTER_API_KEY format in .env.local.');
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  const content = '# Jev local credentials. Never publish or paste this file.\nOPENROUTER_API_KEY=' + (key ?? '') + '\n';
  fs.writeFileSync(destination, content, { flag: updateKey ? 'w' : 'wx', mode: 0o600 });
  return { path: destination, status: key ? 'imported' : 'template_created', configured: Boolean(key) };
}
