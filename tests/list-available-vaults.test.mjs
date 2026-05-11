import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs/promises';
import { startServer, createTempVault } from './helpers.mjs';

describe('list-available-vaults', () => {
  let server, vault;

  before(async () => {
    vault = await createTempVault('vaults');
    server = await startServer(vault.vaultPath);
  });

  after(async () => {
    await server.close();
    await fs.rm(vault.root, { recursive: true, force: true });
  });

  it('returns the vault name', async () => {
    const result = await server.rpc('tools/call', {
      name: 'list-available-vaults',
      arguments: { vault: 'x' },
    });
    assert.match(result.content[0].text, /Available vaults/);
    assert.match(result.content[0].text, /obsidian-vault/);
  });
});
