import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs/promises';
import path from 'path';
import { startServer, createTempVault } from './helpers.mjs';

describe('recover-from-trash', () => {
  let server, vault;

  before(async () => {
    vault = await createTempVault('recover');
    server = await startServer(vault.vaultPath);
  });

  after(async () => {
    await server.close();
    await fs.rm(vault.root, { recursive: true, force: true });
  });

  async function read(rel) {
    return fs.readFile(path.join(vault.vaultPath, rel), 'utf8');
  }

  async function trashNote(filename, content) {
    await fs.writeFile(path.join(vault.vaultPath, filename), content, 'utf8');
    await server.rpc('tools/call', {
      name: 'delete-note',
      arguments: { vault: 'x', filename },
    });
  }

  it('recovers a file to the vault root', async () => {
    await trashNote('restore-me.md', 'recovered content');
    await server.rpc('tools/call', {
      name: 'recover-from-trash',
      arguments: { vault: 'x', filename: 'restore-me.md' },
    });
    assert.equal(await read('restore-me.md'), 'recovered content');
  });

  it('recovers a file into a specific subfolder', async () => {
    await trashNote('sub-restore.md', 'sub recovery');
    await server.rpc('tools/call', {
      name: 'recover-from-trash',
      arguments: { vault: 'x', filename: 'sub-restore.md', targetFolder: 'restored-here' },
    });
    assert.equal(await read('restored-here/sub-restore.md'), 'sub recovery');
  });

  it('errors when the file is not in trash', async () => {
    const raw = await server.rpcRaw('tools/call', {
      name: 'recover-from-trash',
      arguments: { vault: 'x', filename: 'never-deleted.md' },
    });
    assert.ok(raw.json.result.isError);
  });
});
