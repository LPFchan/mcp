import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs/promises';
import path from 'path';
import { startServer, createTempVault } from './helpers.mjs';

describe('move-note', () => {
  let server, vault;

  before(async () => {
    vault = await createTempVault('move');
    server = await startServer(vault.vaultPath);
  });

  after(async () => {
    await server.close();
    await fs.rm(vault.root, { recursive: true, force: true });
  });

  async function read(rel) {
    return fs.readFile(path.join(vault.vaultPath, rel), 'utf8');
  }

  async function exists(rel) {
    return fs.access(path.join(vault.vaultPath, rel)).then(() => true, () => false);
  }

  it('renames a note', async () => {
    await fs.writeFile(path.join(vault.vaultPath, 'src.md'), 'renamed', 'utf8');
    await server.rpc('tools/call', {
      name: 'move-note',
      arguments: { vault: 'x', filename: 'src.md', newFilename: 'dest.md' },
    });
    assert.equal(await read('dest.md'), 'renamed');
    assert.ok(!(await exists('src.md')));
  });

  it('moves a note to a subfolder', async () => {
    await fs.writeFile(path.join(vault.vaultPath, 'move-me.md'), 'moved', 'utf8');
    await server.rpc('tools/call', {
      name: 'move-note',
      arguments: { vault: 'x', filename: 'move-me.md', newFolder: 'archive' },
    });
    assert.equal(await read('archive/move-me.md'), 'moved');
    assert.ok(!(await exists('move-me.md')));
  });

  it('renames and moves in one operation', async () => {
    await fs.writeFile(path.join(vault.vaultPath, 'rm.md'), 'both', 'utf8');
    await server.rpc('tools/call', {
      name: 'move-note',
      arguments: { vault: 'x', filename: 'rm.md', newFilename: 'arrived.md', newFolder: 'renamed' },
    });
    assert.equal(await read('renamed/arrived.md'), 'both');
    assert.ok(!(await exists('rm.md')));
  });
});
