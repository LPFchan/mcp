import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs/promises';
import path from 'path';
import { startServer, createTempVault } from './helpers.mjs';

describe('create-directory', () => {
  let server, vault;

  before(async () => {
    vault = await createTempVault('mkdir');
    server = await startServer(vault.vaultPath);
  });

  after(async () => {
    await server.close();
    await fs.rm(vault.root, { recursive: true, force: true });
  });

  it('creates a single directory', async () => {
    await server.rpc('tools/call', {
      name: 'create-directory',
      arguments: { vault: 'x', path: 'my-dir' },
    });
    const stat = await fs.stat(path.join(vault.vaultPath, 'my-dir'));
    assert.ok(stat.isDirectory());
  });

  it('creates nested directories recursively', async () => {
    await server.rpc('tools/call', {
      name: 'create-directory',
      arguments: { vault: 'x', path: 'level1/level2/level3' },
    });
    const stat = await fs.stat(path.join(vault.vaultPath, 'level1/level2/level3'));
    assert.ok(stat.isDirectory());
  });
});
