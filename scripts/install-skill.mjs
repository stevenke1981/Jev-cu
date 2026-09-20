#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const exists = p => { try { fs.lstatSync(p); return true; } catch (e) { if (e.code === 'ENOENT') return false; throw e; } };
export function installSkill({ home = os.homedir(), root = ROOT, force = false, uninstall = false } = {}) {
  const dest = path.join(home, '.agents', 'skills', 'jev-use');
  const legacy = path.join(home, '.codex', 'skills', 'jev-use');
  const backups = path.join(home, '.agents', 'skill-backups');
  if (exists(dest) && fs.lstatSync(dest).isSymbolicLink()) throw new Error('Refusing to replace a symlink. Resolve the existing jev-use installation explicitly.');
  if (!uninstall && exists(dest) && !force) throw new Error('Skill exists; use --force to archive it outside the skill-discovery directory before replacing.');
  const source = path.join(root, 'skill', 'jev-use');
  if (!uninstall && !fs.existsSync(path.join(source, 'SKILL.md'))) throw new Error('Missing source SKILL.md');
  let backup = null;
  if (exists(dest)) {
    fs.mkdirSync(backups, { recursive: true });
    backup = path.join(backups, `jev-use-${Date.now()}-${randomUUID()}`);
    fs.renameSync(dest, backup);
  }
  if (!uninstall) {
    try {
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.cpSync(source, dest, { recursive: true, filter: p => { if (fs.lstatSync(p).isSymbolicLink()) throw new Error('Source skill contains a symlink'); return true; } });
      const render = d => {
        for (const ent of fs.readdirSync(d, { withFileTypes: true })) {
          const p = path.join(d, ent.name);
          if (ent.isDirectory()) render(p);
          else if (ent.isFile()) fs.writeFileSync(p, fs.readFileSync(p, 'utf8').replaceAll('{{REPO_DIR}}', path.resolve(root).replaceAll('\\', '/')));
        }
      };
      render(dest);
    } catch (err) {
      fs.rmSync(dest, { recursive: true, force: true });
      if (backup) fs.renameSync(backup, dest);
      throw err;
    }
  }
  return { installed: !uninstall, destination: dest, backup, legacySkillDetected: exists(legacy),
    note: 'Local skill files only. No plugins, permissions, config.toml, secrets or desktop drivers were changed. Restart the desktop session; load the source Skill in the local project if discovery is unavailable.' };
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const args = process.argv.slice(2);
    if (args.some(a => !['--force', '--uninstall'].includes(a))) throw new Error('Usage: npm run install-skill -- [--force] or npm run uninstall-skill. No agent-specific or --link installation.');
    console.log(JSON.stringify(installSkill({ force: args.includes('--force'), uninstall: args.includes('--uninstall') }), null, 2));
  } catch (err) { console.error(err.message); process.exitCode = 1; }
}
