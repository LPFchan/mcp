import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs/promises';
import path from 'path';
import { startServer, createTempVault } from './helpers.mjs';

describe('add-tags', () => {
  let server, vault;

  before(async () => {
    vault = await createTempVault('addtags');
    server = await startServer(vault.vaultPath);
  });

  after(async () => {
    await server.close();
    await fs.rm(vault.root, { recursive: true, force: true });
  });

  async function read(rel) {
    return fs.readFile(path.join(vault.vaultPath, rel), 'utf8');
  }

  it('adds tags to a note with no frontmatter', async () => {
    await fs.writeFile(path.join(vault.vaultPath, 'plain.md'), 'Just a note', 'utf8');
    await server.rpc('tools/call', {
      name: 'add-tags',
      arguments: { vault: 'x', filename: 'plain.md', tags: ['alpha', 'beta'] },
    });
    const content = await read('plain.md');
    assert.match(content, /^---/);
    assert.match(content, /alpha/);
    assert.match(content, /beta/);
    assert.match(content, /Just a note/);
  });

  it('adds tags to a note with existing frontmatter', async () => {
    await fs.writeFile(path.join(vault.vaultPath, 'with-fm.md'), '---\ntitle: My Note\n---\nBody', 'utf8');
    await server.rpc('tools/call', {
      name: 'add-tags',
      arguments: { vault: 'x', filename: 'with-fm.md', tags: ['tag1'] },
    });
    const content = await read('with-fm.md');
    assert.match(content, /title: My Note/);
    assert.match(content, /tag1/);
    assert.match(content, /Body/);
  });

  it('deduplicates tags', async () => {
    await fs.writeFile(path.join(vault.vaultPath, 'dedup.md'), '---\ntags:\n  - alpha\n---\nBody', 'utf8');
    await server.rpc('tools/call', {
      name: 'add-tags',
      arguments: { vault: 'x', filename: 'dedup.md', tags: ['alpha', 'beta'] },
    });
    const content = await read('dedup.md');
    const count = (content.match(/- alpha/g) || []).length;
    assert.equal(count, 1);
    assert.match(content, /beta/);
  });
});
