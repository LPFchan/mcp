import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs/promises';
import { startServer, createTempVault } from './helpers.mjs';

const MODERN_META = {
  'io.modelcontextprotocol/protocolVersion': '2026-07-28',
  'io.modelcontextprotocol/clientInfo': { name: 'test', version: '1.0.0' },
  'io.modelcontextprotocol/clientCapabilities': {},
};

describe('2026-07-28 protocol', () => {
  let server;
  let vault;

  before(async () => {
    vault = await createTempVault('modern-protocol');
    server = await startServer(vault.vaultPath);
  });

  after(async () => {
    await server.close();
    await fs.rm(vault.root, { recursive: true, force: true });
  });

  it('supports discovery without a handshake or session', async () => {
    const response = await server.fetch('server/discover', { _meta: MODERN_META }, {
      'MCP-Protocol-Version': '2026-07-28',
      'Mcp-Method': 'server/discover',
    });

    assert.equal(response.status, 200);
    assert.equal(response.headers['mcp-session-id'], undefined);
    assert.ok(response.json.result.supportedVersions.includes('2026-07-28'));
    assert.equal(response.json.result.ttlMs, 300000);
    assert.equal(response.json.result.cacheScope, 'public');
  });

  it('serves a self-contained tools/list request', async () => {
    const response = await server.fetch('tools/list', { _meta: MODERN_META }, {
      'MCP-Protocol-Version': '2026-07-28',
      'Mcp-Method': 'tools/list',
    });

    assert.equal(response.status, 200);
    assert.ok(response.json.result.tools.some((tool) => tool.name === 'read-note'));
    assert.equal(response.json.result.ttlMs, 300000);
    assert.equal(response.json.result.cacheScope, 'private');
  });
});
