import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs/promises';
import path from 'path';
import { startServer, createTempVault } from './helpers.mjs';

describe('open-trash', () => {
  let server, vault;

  before(async () => {
    vault = await createTempVault('trash');
    server = await startServer(vault.vaultPath);
  });

  after(async () => {
    await server.close();
    await fs.rm(vault.root, { recursive: true, force: true });
  });

  it('reports empty when trash has no files', async () => {
    const result = await server.rpc('tools/call', {
      name: 'open-trash',
      arguments: { vault: 'x' },
    });
    assert.match(result.content[0].text, /empty/i);
  });

  it('lists files after a note has been deleted', async () => {
    await fs.writeFile(path.join(vault.vaultPath, 'will-delete.md'), 'x', 'utf8');
    await server.rpc('tools/call', {
      name: 'delete-note',
      arguments: { vault: 'x', filename: 'will-delete.md' },
    });
    const result = await server.rpc('tools/call', {
      name: 'open-trash',
      arguments: { vault: 'x' },
    });
    assert.match(result.content[0].text, /will-delete\.md/);
  });
});
