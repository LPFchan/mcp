import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs/promises';
import path from 'path';
import { startServer, createTempVault } from './helpers.mjs';

describe('list-notes', () => {
  let server, vault;

  before(async () => {
    vault = await createTempVault('listnotes');
    server = await startServer(vault.vaultPath);
    await fs.writeFile(path.join(vault.vaultPath, 'alpha.md'), 'a', 'utf8');
    await fs.writeFile(path.join(vault.vaultPath, 'beta.md'), 'b', 'utf8');
    await fs.mkdir(path.join(vault.vaultPath, 'sub'), { recursive: true });
    await fs.writeFile(path.join(vault.vaultPath, 'sub', 'gamma.md'), 'g', 'utf8');
    await fs.mkdir(path.join(vault.vaultPath, 'empty-folder'), { recursive: true });
  });

  after(async () => {
    await server.close();
    await fs.rm(vault.root, { recursive: true, force: true });
  });

  it('lists all notes in vault root', async () => {
    const result = await server.rpc('tools/call', {
      name: 'list-notes',
      arguments: { vault: 'x' },
    });
    assert.match(result.content[0].text, /alpha\.md/);
    assert.match(result.content[0].text, /beta\.md/);
  });

  it('lists notes in a subfolder only', async () => {
    const result = await server.rpc('tools/call', {
      name: 'list-notes',
      arguments: { vault: 'x', folder: 'sub' },
    });
    assert.match(result.content[0].text, /gamma\.md/);
    assert.doesNotMatch(result.content[0].text, /alpha\.md/);
  });

  it('includes file size and date when includeStats is true', async () => {
    const result = await server.rpc('tools/call', {
      name: 'list-notes',
      arguments: { vault: 'x', includeStats: true },
    });
    assert.match(result.content[0].text, /KB/);
    assert.match(result.content[0].text, /modified \d{4}-\d{2}-\d{2}/);
  });

  it('reports no notes in an empty folder', async () => {
    const result = await server.rpc('tools/call', {
      name: 'list-notes',
      arguments: { vault: 'x', folder: 'empty-folder' },
    });
    assert.match(result.content[0].text, /No notes found/);
  });
});
