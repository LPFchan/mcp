import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs/promises';
import path from 'path';
import { startServer, createTempVault } from './helpers.mjs';

// The vault sits one level below `root`, so `../` from the vault lands in
// `root`, where the bait files below live. Every call must be refused and leave
// them untouched.
describe('path containment', () => {
  let server, vault;

  before(async () => {
    vault = await createTempVault('contain');
    server = await startServer(vault.vaultPath);
    await fs.writeFile(path.join(vault.root, 'secret.md'), 'outside', 'utf8');
    await fs.mkdir(path.join(vault.root, 'victim'), { recursive: true });
    await fs.writeFile(path.join(vault.vaultPath, 'inside.md'), 'inside', 'utf8');
  });

  after(async () => {
    await server.close();
    await fs.rm(vault.root, { recursive: true, force: true });
  });

  async function call(name, args) {
    return server.rpc('tools/call', { name, arguments: { vault: 'x', ...args } });
  }

  async function exists(fp) {
    return fs.access(fp).then(() => true, () => false);
  }

  const escapes = [
    ['read-note', { filename: '../secret.md' }],
    ['read-note', { folder: '..', filename: 'secret.md' }],
    ['read-note', { filename: path.join('/', 'etc', 'passwd') }],
    ['create-note', { filename: '../escaped.md', content: 'x' }],
    ['edit-note', { filename: '../secret.md', operation: 'append', content: 'x' }],
    ['move-note', { filename: 'inside.md', newFolder: '..' }],
    ['list-notes', { folder: '..' }],
    ['search-vault', { query: 'outside', path: '..' }],
    ['create-directory', { path: '../outside-dir' }],
    ['delete-directory', { path: '../victim' }],
    ['delete-directory', { path: '.' }],
    ['delete-note', { filename: 'inside.md', folder: '..' }],
    ['recover-from-trash', { filename: '../../secret.md' }],
  ];

  for (const [name, args] of escapes) {
    it(`${name} refuses ${JSON.stringify(args)}`, async () => {
      const result = await call(name, args);
      assert.equal(result.isError, true);
      assert.match(result.content[0].text, /escapes the vault|vault root/);
    });
  }

  it('left everything outside the vault untouched', async () => {
    assert.equal(await fs.readFile(path.join(vault.root, 'secret.md'), 'utf8'), 'outside');
    assert.ok(await exists(path.join(vault.root, 'victim')));
    assert.ok(!(await exists(path.join(vault.root, 'escaped.md'))));
    assert.ok(!(await exists(path.join(vault.root, 'outside-dir'))));
    assert.ok(await exists(path.join(vault.vaultPath, 'inside.md')));
  });

  it('still allows nested paths that stay inside', async () => {
    await call('create-note', { folder: 'a/b', filename: '../c.md', content: 'ok' });
    assert.equal(await fs.readFile(path.join(vault.vaultPath, 'a', 'c.md'), 'utf8'), 'ok');
  });
});
