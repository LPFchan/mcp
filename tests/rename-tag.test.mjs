import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs/promises';
import path from 'path';
import { startServer, createTempVault } from './helpers.mjs';

describe('rename-tag', () => {
  let server, vault;

  before(async () => {
    vault = await createTempVault('renametag');
    server = await startServer(vault.vaultPath);
    await fs.writeFile(path.join(vault.vaultPath, 'a.md'), '---\ntags:\n  - oldname\n---\nNote A', 'utf8');
    await fs.writeFile(path.join(vault.vaultPath, 'b.md'), '---\ntags:\n  - oldname\n  - other\n---\nNote B', 'utf8');
    await fs.writeFile(path.join(vault.vaultPath, 'c.md'), '---\ntags:\n  - unrelated\n---\nNote C', 'utf8');
  });

  after(async () => {
    await server.close();
    await fs.rm(vault.root, { recursive: true, force: true });
  });

  async function read(rel) {
    return fs.readFile(path.join(vault.vaultPath, rel), 'utf8');
  }

  it('renames a tag across all matching notes', async () => {
    const result = await server.rpc('tools/call', {
      name: 'rename-tag',
      arguments: { vault: 'x', oldTag: 'oldname', newTag: 'newname' },
    });
    assert.match(result.content[0].text, /in 2 note/);
    assert.match(await read('a.md'), /newname/);
    assert.match(await read('b.md'), /newname/);
  });

  it('does not affect unrelated notes', async () => {
    await server.rpc('tools/call', {
      name: 'rename-tag',
      arguments: { vault: 'x', oldTag: 'oldname', newTag: 'newname' },
    });
    assert.match(await read('c.md'), /unrelated/);
    assert.doesNotMatch(await read('c.md'), /newname/);
  });

  it('reports 0 when tag is not found anywhere', async () => {
    const result = await server.rpc('tools/call', {
      name: 'rename-tag',
      arguments: { vault: 'x', oldTag: 'nonexistent', newTag: 'x' },
    });
    assert.match(result.content[0].text, /in 0 note/);
  });
});
