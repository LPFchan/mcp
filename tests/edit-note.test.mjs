import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs/promises';
import path from 'path';
import { startServer, createTempVault } from './helpers.mjs';

describe('edit-note', () => {
  let server, vault;

  before(async () => {
    vault = await createTempVault('edit');
    server = await startServer(vault.vaultPath);
  });

  after(async () => {
    await server.close();
    await fs.rm(vault.root, { recursive: true, force: true });
  });

  async function read(rel) {
    return fs.readFile(path.join(vault.vaultPath, rel), 'utf8');
  }

  async function seed(rel, content) {
    await fs.writeFile(path.join(vault.vaultPath, rel), content, 'utf8');
  }

  describe('append', () => {
    beforeEach(async () => { await seed('note.md', 'line one\nline two'); });

    it('appends content to the end', async () => {
      await server.rpc('tools/call', {
        name: 'edit-note',
        arguments: { vault: 'x', filename: 'note.md', operation: 'append', content: 'line three' },
      });
      assert.equal(await read('note.md'), 'line one\nline two\nline three');
    });
  });

  describe('prepend', () => {
    beforeEach(async () => { await seed('note.md', 'line one'); });

    it('adds content at the beginning', async () => {
      await server.rpc('tools/call', {
        name: 'edit-note',
        arguments: { vault: 'x', filename: 'note.md', operation: 'prepend', content: 'line zero' },
      });
      assert.match(await read('note.md'), /^line zero/);
    });
  });

  describe('overwrite', () => {
    beforeEach(async () => { await seed('note.md', 'old content'); });

    it('replaces the entire document', async () => {
      await server.rpc('tools/call', {
        name: 'edit-note',
        arguments: { vault: 'x', filename: 'note.md', operation: 'overwrite', content: 'new content' },
      });
      assert.equal(await read('note.md'), 'new content');
    });

    it('errors when content is missing', async () => {
      const raw = await server.rpcRaw('tools/call', {
        name: 'edit-note',
        arguments: { vault: 'x', filename: 'note.md', operation: 'overwrite' },
      });
      assert.ok(raw.json.result.isError);
      assert.match(raw.json.result.content[0].text, /content is required/);
    });
  });

  describe('replace', () => {
    beforeEach(async () => { await seed('note.md', 'hello world\nfoo bar\nhello again'); });

    it('replaces oldString with newString', async () => {
      await server.rpc('tools/call', {
        name: 'edit-note',
        arguments: { vault: 'x', filename: 'note.md', operation: 'replace', oldString: 'foo bar', newString: 'baz qux' },
      });
      assert.match(await read('note.md'), /baz qux/);
      assert.doesNotMatch(await read('note.md'), /foo bar/);
    });

    it('errors when oldString is not found', async () => {
      const raw = await server.rpcRaw('tools/call', {
        name: 'edit-note',
        arguments: { vault: 'x', filename: 'note.md', operation: 'replace', oldString: 'nonexistent', newString: 'x' },
      });
      assert.ok(raw.json.result.isError);
      assert.match(raw.json.result.content[0].text, /oldString not found/);
    });

    it('errors when oldString is empty/undefined', async () => {
      const raw = await server.rpcRaw('tools/call', {
        name: 'edit-note',
        arguments: { vault: 'x', filename: 'note.md', operation: 'replace', newString: 'x' },
      });
      assert.ok(raw.json.result.isError);
      assert.match(raw.json.result.content[0].text, /oldString is required/);
    });

    it('errors when newString is undefined', async () => {
      const raw = await server.rpcRaw('tools/call', {
        name: 'edit-note',
        arguments: { vault: 'x', filename: 'note.md', operation: 'replace', oldString: 'hello' },
      });
      assert.ok(raw.json.result.isError);
      assert.match(raw.json.result.content[0].text, /newString is required/);
    });

    it('replaces with empty string', async () => {
      await server.rpc('tools/call', {
        name: 'edit-note',
        arguments: { vault: 'x', filename: 'note.md', operation: 'replace', oldString: 'foo bar', newString: '' },
      });
      assert.doesNotMatch(await read('note.md'), /foo bar/);
    });
  });
});
