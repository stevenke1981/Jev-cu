import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { configEnvFile, installCredentials, readEnvKey } from '../scripts/credentials.mjs';
import { loadApiKey } from '../scripts/jev-decide.mjs';

function fixture(fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'jev-credentials-'));
  const home = path.join(dir, 'home'), root = path.join(dir, 'repo');
  fs.mkdirSync(root);
  const envFile = path.join(root, '.env.local'), configFile = configEnvFile(home);
  const saved = process.env.OPENROUTER_API_KEY;
  delete process.env.OPENROUTER_API_KEY;
  try { return fn({ home, root, envFile, configFile }); }
  finally {
    if (saved === undefined) delete process.env.OPENROUTER_API_KEY;
    else process.env.OPENROUTER_API_KEY = saved;
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

test('installation imports only the requested key and returns no secrets', () => fixture(opts => {
  fs.writeFileSync(opts.envFile, 'OPENROUTER_API_KEY="test-key-one"\nOTHER_SECRET=private-test-value\n');
  const result = installCredentials(opts);
  assert.equal(result.status, 'imported');
  assert.equal(result.configured, true);
  assert.equal(readEnvKey(opts.configFile), 'test-key-one');
  assert.ok(!fs.readFileSync(opts.configFile, 'utf8').includes('OTHER_SECRET'));
  assert.ok(!JSON.stringify(result).includes('test-key-one'));
  if (process.platform !== 'win32') assert.equal(fs.statSync(opts.configFile).mode & 0o777, 0o600);
  fs.unlinkSync(opts.envFile);
  assert.equal(loadApiKey(opts), 'test-key-one', 'installed credentials work without a project key');
}));

test('missing project key creates an editable local template', () => fixture(opts => {
  const result = installCredentials(opts);
  assert.equal(result.status, 'template_created');
  assert.equal(result.configured, false);
  assert.equal(readEnvKey(opts.configFile), null);
  assert.throws(() => loadApiKey(opts), /未找到 OPENROUTER_API_KEY/);
}));

test('existing key survives reinstall and rotates only with explicit update', () => fixture(opts => {
  fs.writeFileSync(opts.envFile, 'OPENROUTER_API_KEY=test-original\n');
  installCredentials(opts);
  fs.writeFileSync(opts.envFile, 'OPENROUTER_API_KEY=test-new\n');
  assert.equal(installCredentials(opts).status, 'preserved');
  assert.equal(readEnvKey(opts.configFile), 'test-original');
  installCredentials({ ...opts, updateKey: true });
  assert.equal(readEnvKey(opts.configFile), 'test-new');
  fs.writeFileSync(opts.envFile, 'OPENROUTER_API_KEY=\n');
  assert.throws(() => installCredentials({ ...opts, updateKey: true }), /requires/);
  assert.equal(readEnvKey(opts.configFile), 'test-new');
}));

test('runtime precedence is environment, project, then installed user configuration', () => fixture(opts => {
  fs.writeFileSync(opts.envFile, 'OPENROUTER_API_KEY=installed-test\n');
  installCredentials(opts);
  fs.writeFileSync(opts.envFile, 'OPENROUTER_API_KEY=project-test\n');
  assert.equal(loadApiKey(opts), 'project-test');
  process.env.OPENROUTER_API_KEY = 'environment-test';
  assert.equal(loadApiKey(opts), 'environment-test');
  delete process.env.OPENROUTER_API_KEY;
  fs.writeFileSync(opts.envFile, 'OPENROUTER_API_KEY=\n');
  assert.equal(loadApiKey(opts), 'installed-test');
}));

test('symlinked credential directory is rejected without writing outside destination', () => fixture(opts => {
  const outside = path.join(opts.root, 'outside');
  fs.mkdirSync(outside);
  fs.mkdirSync(path.dirname(path.dirname(opts.configFile)), { recursive: true });
  fs.symlinkSync(outside, path.dirname(opts.configFile), process.platform === 'win32' ? 'junction' : 'dir');
  assert.throws(() => installCredentials(opts), /symlink/);
  assert.deepEqual(fs.readdirSync(outside), []);
}));
