import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs/promises';
import path from 'path';
import { startServer, createTempVault } from './helpers.mjs';

describe('remove-tags', () => {
  let server, vault;

  before(async () => {
    vault = await createTempVault('rmtags');
    server = await startServer(vault.vaultPath);
  });

  after(async () => {
    await server.close();
    await fs.rm(vault.root, { recursive: true, force: true });
  });

  async function read(rel) {
    return fs.readFile(path.join(vault.vaultPath, rel), 'utf8');
  }

  beforeEach(async () => {
    await fs.writeFile(path.join(vault.vaultPath, 'tagged.md'), '---\ntags:\n  - keep-this\n  - remove-this\n---\nBody', 'utf8');
  });

  it('removes an existing tag', async () => {
    await server.rpc('tools/call', {
      name: 'remove-tags',
      arguments: { vault: 'x', filename: 'tagged.md', tags: ['remove-this'] },
    });
    const content = await read('tagged.md');
    assert.match(content, /keep-this/);
    assert.doesNotMatch(content, /remove-this/);
  });

  it('succeeds even when removing a tag that is not present', async () => {
    const result = await server.rpc('tools/call', {
      name: 'remove-tags',
      arguments: { vault: 'x', filename: 'tagged.md', tags: ['ghost-tag'] },
    });
    assert.match(result.content[0].text, /Removed/);
    assert.match(await read('tagged.md'), /keep-this/);
  });
});
