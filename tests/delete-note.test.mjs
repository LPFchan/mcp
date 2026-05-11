import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs/promises';
import path from 'path';
import { startServer, createTempVault } from './helpers.mjs';

describe('delete-note', () => {
  let server, vault;

  before(async () => {
    vault = await createTempVault('delete');
    server = await startServer(vault.vaultPath);
  });

  after(async () => {
    await server.close();
    await fs.rm(vault.root, { recursive: true, force: true });
  });

  async function exists(rel) {
    return fs.access(path.join(vault.vaultPath, rel)).then(() => true, () => false);
  }

  it('moves a note to the .trash folder', async () => {
    await fs.writeFile(path.join(vault.vaultPath, 'trash-me.md'), 'bye', 'utf8');
    await server.rpc('tools/call', {
      name: 'delete-note',
      arguments: { vault: 'x', filename: 'trash-me.md' },
    });
    assert.ok(!(await exists('trash-me.md')));
    const trashFiles = await fs.readdir(path.join(vault.vaultPath, '.trash'));
    assert.ok(trashFiles.includes('trash-me.md'));
  });

  it('errors when the note does not exist', async () => {
    const raw = await server.rpcRaw('tools/call', {
      name: 'delete-note',
      arguments: { vault: 'x', filename: 'no-such-note.md' },
    });
    assert.ok(raw.json.result.isError);
  });
});
