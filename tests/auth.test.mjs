import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs/promises';
import { startServer, createTempVault } from './helpers.mjs';

describe('gateway boundary', () => {
  let server, vault;

  before(async () => {
    vault = await createTempVault('auth');
    server = await startServer(vault.vaultPath);
  });

  after(async () => {
    await server.close();
    await fs.rm(vault.root, { recursive: true, force: true });
  });

  it('accepts a gateway-forwarded request without client credentials', async () => {
    const result = await server.rpc('tools/list');
    assert.ok(Array.isArray(result.tools));
  });
});

describe('cors', () => {
  let server, vault;

  before(async () => {
    vault = await createTempVault('cors');
    server = await startServer(vault.vaultPath);
  });

  after(async () => {
    await server.close();
    await fs.rm(vault.root, { recursive: true, force: true });
  });

  it('returns 204 and CORS headers on OPTIONS preflight', async () => {
    const res = await server.rawRequest('OPTIONS', '/', {
      Origin: 'https://example.com',
      'Access-Control-Request-Method': 'POST',
    });
    assert.equal(res.status, 204);
    assert.ok(res.headers['access-control-allow-origin']);
    assert.ok(res.headers['access-control-allow-methods']);
    assert.ok(res.headers['access-control-allow-headers']);
  });

  it('includes CORS headers on authenticated responses', async () => {
    const res = await server.rpcRaw('tools/list', {}, { Origin: 'https://example.com' });
    assert.equal(res.status, 200);
    assert.ok(res.headers['access-control-allow-origin']);
    assert.ok(res.headers['access-control-expose-headers']);
  });
});

describe('oauth probes', () => {
  let server, vault;

  before(async () => {
    vault = await createTempVault('oauth');
    server = await startServer(vault.vaultPath);
  });

  after(async () => {
    await server.close();
    await fs.rm(vault.root, { recursive: true, force: true });
  });

  it('does not advertise backend OAuth discovery', async () => {
    const res = await server.rawRequest('GET', '/.well-known/oauth-authorization-server');
    assert.equal(res.status, 405);
  });

  it('does not expose backend dynamic registration', async () => {
    const res = await server.rawRequest('GET', '/register');
    assert.equal(res.status, 405);
  });
});
