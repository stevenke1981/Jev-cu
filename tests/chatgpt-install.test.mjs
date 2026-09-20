import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { installSkill } from '../scripts/install-skill.mjs';
function fixture(fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'jev-gpt-'));
  const root = path.join(dir, 'repo with spaces'), home = path.join(dir, 'home');
  fs.mkdirSync(path.join(root, 'skill/jev-use/references'), { recursive: true });
  fs.writeFileSync(path.join(root, 'skill/jev-use/SKILL.md'), '---\nname: jev-use\n---\n{{REPO_DIR}}');
  fs.writeFileSync(path.join(root, 'skill/jev-use/references/runtime.md'), '{{REPO_DIR}}');
  try { return fn({ root, home }); } finally { fs.rmSync(dir, { recursive: true, force: true }); }
}
test('installer replaces templates and touches only local skill files', () => fixture(opts => {
  const r = installSkill(opts); assert.equal(r.installed, true); assert.equal(r.legacySkillDetected, false);
  assert.equal(fs.readFileSync(path.join(r.destination, 'SKILL.md'), 'utf8').includes('{{REPO_DIR}}'), false);
  assert.equal(fs.existsSync(path.join(opts.home, '.codex/config.toml')), false);
}));
test('installer refuses implicit overwrite', () => fixture(opts => { installSkill(opts); assert.throws(() => installSkill(opts), /exists/); }));
test('forced update archives old version outside skill discovery', () => fixture(opts => {
  const a = installSkill(opts); fs.writeFileSync(path.join(a.destination, 'my-note.txt'), 'preserve');
  const b = installSkill({ ...opts, force: true }); assert.equal(fs.existsSync(path.join(b.backup, 'my-note.txt')), true);
  assert.equal(b.backup.includes(path.join('.agents', 'skills') + path.sep), false);
}));
test('uninstall archives rather than erases an installed skill', () => fixture(opts => {
  installSkill(opts); const r = installSkill({ ...opts, uninstall: true }); assert.equal(r.installed, false); assert.ok(fs.existsSync(r.backup)); assert.equal(fs.existsSync(r.destination), false);
}));
