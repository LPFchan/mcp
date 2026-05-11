import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs/promises';
import path from 'path';
import { startServer, createTempVault } from './helpers.mjs';

describe('read-note', () => {
  let server, vault;

  before(async () => {
    vault = await createTempVault('read');
    server = await startServer(vault.vaultPath);
    await fs.mkdir(path.join(vault.vaultPath, 'sub'), { recursive: true });
    await fs.writeFile(path.join(vault.vaultPath, 'root.md'), 'root content', 'utf8');
    await fs.writeFile(path.join(vault.vaultPath, 'sub/nested.md'), 'nested content', 'utf8');
  });

  after(async () => {
    await server.close();
    await fs.rm(vault.root, { recursive: true, force: true });
  });

  it('reads a note at the vault root', async () => {
    const result = await server.rpc('tools/call', {
      name: 'read-note',
      arguments: { vault: 'x', filename: 'root.md' },
    });
    assert.equal(result.content[0].text, 'root content');
  });

  it('reads a note from a subfolder', async () => {
    const result = await server.rpc('tools/call', {
      name: 'read-note',
      arguments: { vault: 'x', filename: 'nested.md', folder: 'sub' },
    });
    assert.equal(result.content[0].text, 'nested content');
  });

  it('returns error for non-existing note', async () => {
    const raw = await server.rpcRaw('tools/call', {
      name: 'read-note',
      arguments: { vault: 'x', filename: 'missing.md' },
    });
    assert.ok(raw.json.result.isError);
  });
});
