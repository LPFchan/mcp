import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs/promises';
import path from 'path';
import { startServer, createTempVault } from './helpers.mjs';

describe('search-vault', () => {
  let server, vault;

  before(async () => {
    vault = await createTempVault('search');
    server = await startServer(vault.vaultPath);
    await fs.writeFile(path.join(vault.vaultPath, 'fruits.md'), 'apple banana cherry\ndate elderberry fig', 'utf8');
    await fs.writeFile(path.join(vault.vaultPath, 'animals.md'), '---\ntags:\n  - mammal\n  - cat\n---\ndog cat mouse', 'utf8');
    await fs.writeFile(path.join(vault.vaultPath, 'CaseSensitive.md'), 'HELLO world', 'utf8');
    await fs.mkdir(path.join(vault.vaultPath, 'sub'), { recursive: true });
    await fs.writeFile(path.join(vault.vaultPath, 'sub', 'hidden.md'), 'secret in subfolder', 'utf8');
  });

  after(async () => {
    await server.close();
    await fs.rm(vault.root, { recursive: true, force: true });
  });

  it('finds lines containing the query in content', async () => {
    const result = await server.rpc('tools/call', {
      name: 'search-vault',
      arguments: { vault: 'x', query: 'banana', searchType: 'content' },
    });
    assert.match(result.content[0].text, /banana/);
    assert.match(result.content[0].text, /fruits\.md/);
  });

  it('finds files matching the query in filename', async () => {
    const result = await server.rpc('tools/call', {
      name: 'search-vault',
      arguments: { vault: 'x', query: 'fruits', searchType: 'filename' },
    });
    assert.match(result.content[0].text, /fruits\.md/);
  });

  it('returns nothing when no match found', async () => {
    const result = await server.rpc('tools/call', {
      name: 'search-vault',
      arguments: { vault: 'x', query: 'zzzzzNOTHINGzzzzz', searchType: 'content' },
    });
    assert.match(result.content[0].text, /No matches found/);
  });

  it('searches by tag prefix (tag:)', async () => {
    const result = await server.rpc('tools/call', {
      name: 'search-vault',
      arguments: { vault: 'x', query: 'tag:cat' },
    });
    assert.match(result.content[0].text, /animals\.md/);
  });

  it('fuzzy filename search matches partial input', async () => {
    const result = await server.rpc('tools/call', {
      name: 'search-vault',
      arguments: { vault: 'x', query: 'fru', fuzzy: true, searchType: 'filename' },
    });
    assert.match(result.content[0].text, /fruits\.md/);
  });

  it('fuzzy content search finds documents with all words', async () => {
    const result = await server.rpc('tools/call', {
      name: 'search-vault',
      arguments: { vault: 'x', query: 'dog cat', fuzzy: true, searchType: 'content' },
    });
    assert.match(result.content[0].text, /animals\.md/);
  });

  it('case-sensitive search respects case', async () => {
    const result = await server.rpc('tools/call', {
      name: 'search-vault',
      arguments: { vault: 'x', query: 'hello', searchType: 'content', caseSensitive: true },
    });
    assert.match(result.content[0].text, /No matches found/);
  });

  it('searches only within a given subfolder', async () => {
    const result = await server.rpc('tools/call', {
      name: 'search-vault',
      arguments: { vault: 'x', query: 'secret', path: 'sub' },
    });
    assert.match(result.content[0].text, /hidden\.md/);
  });
});
