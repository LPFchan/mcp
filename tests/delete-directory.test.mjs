import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs/promises';
import path from 'path';
import { startServer, createTempVault } from './helpers.mjs';

describe('delete-directory', () => {
  let server, vault;

  before(async () => {
    vault = await createTempVault('rmdir');
    server = await startServer(vault.vaultPath);
    await fs.mkdir(path.join(vault.vaultPath, 'populated'), { recursive: true });
    await fs.writeFile(path.join(vault.vaultPath, 'populated', 'file.md'), 'x', 'utf8');
    await fs.mkdir(path.join(vault.vaultPath, 'populated', 'nested'), { recursive: true });
  });

  after(async () => {
    await server.close();
    await fs.rm(vault.root, { recursive: true, force: true });
  });

  async function exists(rel) {
    return fs.access(path.join(vault.vaultPath, rel)).then(() => true, () => false);
  }

  it('deletes a directory and all its contents', async () => {
    await server.rpc('tools/call', {
      name: 'delete-directory',
      arguments: { vault: 'x', path: 'populated' },
    });
    assert.ok(!(await exists('populated')));
  });

  it('does not error when directory does not exist (force:true)', async () => {
    const result = await server.rpc('tools/call', {
      name: 'delete-directory',
      arguments: { vault: 'x', path: 'never-was-here' },
    });
    assert.match(result.content[0].text, /Deleted/);
  });
});
