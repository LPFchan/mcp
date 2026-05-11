import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs/promises';
import path from 'path';
import { startServer, createTempVault } from './helpers.mjs';

describe('create-note', () => {
  let server, vault;

  before(async () => {
    vault = await createTempVault('create');
    server = await startServer(vault.vaultPath);
  });

  after(async () => {
    await server.close();
    await fs.rm(vault.root, { recursive: true, force: true });
  });

  async function readNote(relPath) {
    return fs.readFile(path.join(vault.vaultPath, relPath), 'utf8');
  }

  it('creates a new note in the vault root', async () => {
    await server.rpc('tools/call', {
      name: 'create-note',
      arguments: { vault: 'x', filename: 'hello.md', content: 'Hello world' },
    });
    assert.equal(await readNote('hello.md'), 'Hello world');
  });

  it('creates a note in a subfolder (auto-creates dirs)', async () => {
    await server.rpc('tools/call', {
      name: 'create-note',
      arguments: { vault: 'x', filename: 'note.md', folder: 'deep/nested', content: 'deep' },
    });
    assert.equal(await readNote('deep/nested/note.md'), 'deep');
  });

  it('overwrites an existing note', async () => {
    await server.rpc('tools/call', {
      name: 'create-note',
      arguments: { vault: 'x', filename: 'overwrite.md', content: 'first' },
    });
    await server.rpc('tools/call', {
      name: 'create-note',
      arguments: { vault: 'x', filename: 'overwrite.md', content: 'second' },
    });
    assert.equal(await readNote('overwrite.md'), 'second');
  });
});
