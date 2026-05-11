import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'http';
import fs from 'fs/promises';
import { startServer, createTempVault, TEST_TOKEN, makeRpc } from './helpers.mjs';

describe('auth', () => {
  let server, vault;

  before(async () => {
    vault = await createTempVault('auth');
    server = await startServer(vault.vaultPath);
  });

  after(async () => {
    await server.close();
    await fs.rm(vault.root, { recursive: true, force: true });
  });

  it('returns 401 without any token', async () => {
    const res = await server.rawRequest('GET', '/');
    assert.equal(res.status, 401);
  });

  it('returns 401 with invalid Bearer token', async () => {
    const res = await server.rawRequest('GET', '/', { Authorization: 'Bearer wrong-token' });
    assert.equal(res.status, 401);
  });

  it('rejects invalid URL-path token with 401', async () => {
    const res = await server.rawRequest('GET', '/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/');
    assert.equal(res.status, 401);
  });

  it('accepts valid Bearer token', async () => {
    const result = await server.rpc('tools/list');
    assert.ok(Array.isArray(result.tools));
  });

  it('accepts valid URL-path token and strips it', async () => {
    return new Promise((resolve, reject) => {
      const url = new URL(`/${TEST_TOKEN}/`, `http://127.0.0.1:${server.port}`);
      const body = JSON.stringify(makeRpc('tools/list'));
      const req = http.request(url, {
        method: 'POST',
        agent: false,
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json, text/event-stream',
          'Connection': 'close',
          ...(server.sessionId ? { 'Mcp-Session-Id': server.sessionId } : {}),
        },
      }, (res) => {
        let data = '';
        res.on('data', (chunk) => data += chunk);
        res.on('end', () => {
          const dline = data.match(/^data:\s*(.+)$/m);
          const json = dline ? JSON.parse(dline[1]) : JSON.parse(data);
          assert.ok(json.result);
          assert.ok(Array.isArray(json.result.tools));
          resolve();
        });
      });
      req.on('error', reject);
      req.write(body);
      req.end();
    });
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

  it('rejects /.well-known/ with 404', async () => {
    const res = await server.rawRequest('GET', '/.well-known/oauth-authorization-server', {
      Authorization: `Bearer ${TEST_TOKEN}`,
    });
    assert.equal(res.status, 404);
  });

  it('rejects /register with 404', async () => {
    const res = await server.rawRequest('GET', '/register', {
      Authorization: `Bearer ${TEST_TOKEN}`,
    });
    assert.equal(res.status, 404);
  });
});
