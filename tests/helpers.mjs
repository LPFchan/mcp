import { createApp } from '../lib/app.mjs';
import { createTools } from '../lib/tools.mjs';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import http from 'http';

export const TEST_TOKEN = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

export function makeRpc(method, params = {}) {
  return { jsonrpc: '2.0', method, params, id: 1 };
}

function parseSseBody(body) {
  const dline = body.match(/^data:\s*(.+)$/m);
  if (dline) {
    try { return JSON.parse(dline[1]); } catch { return null; }
  }
  try { return JSON.parse(body); } catch { return null; }
}

export async function createTempVault(slug) {
  const dir = path.join(os.tmpdir(), `mcp-test-${slug}-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  await fs.mkdir(dir, { recursive: true });
  const vaultPath = path.join(dir, 'Obsidian Vault');
  await fs.mkdir(vaultPath, { recursive: true });
  return { root: dir, vaultPath };
}

export async function startServer(vaultPath) {
  const { start, close } = createApp(vaultPath, {
    token: TEST_TOKEN,
    host: '127.0.0.1',
    port: 0,
    allowedOrigin: '*',
  });
  const port = await start();

  let sessionId = null;

  function post(path, body, headers = {}) {
    return new Promise((resolve, reject) => {
      const url = new URL(path, `http://127.0.0.1:${port}`);
      const req = http.request(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json, text/event-stream',
          'Authorization': `Bearer ${TEST_TOKEN}`,
          'Connection': 'close',
          ...headers,
        },
        agent: false,
      }, (res) => {
        let data = '';
        res.on('data', (chunk) => data += chunk);
        res.on('end', () => {
          resolve({
            status: res.statusCode,
            headers: res.headers,
            text: data,
            json: parseSseBody(data),
          });
        });
      });
      req.on('error', reject);
      req.write(body);
      req.end();
    });
  }

  // Initialize the MCP session
  const initRes = await post('/', JSON.stringify({
    jsonrpc: '2.0',
    method: 'initialize',
    params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'test', version: '1.0.0' } },
    id: 1,
  }));
  const sid = initRes.headers['mcp-session-id'];
  if (sid) sessionId = sid;

  // Send initialized notification
  await post('/', JSON.stringify({
    jsonrpc: '2.0',
    method: 'notifications/initialized',
  }), sessionId ? { 'Mcp-Session-Id': sessionId } : {});

  function sessionHeaders() {
    return sessionId ? { 'Mcp-Session-Id': sessionId } : {};
  }

  return {
    port,
    sessionId,
    close,
    async fetch(method, params, headers = {}) {
      const body = JSON.stringify(makeRpc(method, params));
      return post('/', body, { ...sessionHeaders(), ...headers });
    },
    async rpc(method, params, headers) {
      const res = await this.fetch(method, params, headers);
      if (res.json?.error) throw new Error(`RPC error: ${res.json.error.message}`);
      if (!res.json?.result) throw new Error(`No result in RPC response: ${res.text}`);
      return res.json.result;
    },
    async rpcRaw(method, params, headers) {
      return this.fetch(method, params, headers);
    },
    async rawRequest(method, path, headers = {}) {
      return new Promise((resolve, reject) => {
        const url = new URL(path, `http://127.0.0.1:${port}`);
        const req = http.request(url, {
          method,
          headers: { Connection: 'close', ...headers },
          agent: false,
        }, (res) => {
          let data = '';
          res.on('data', (chunk) => data += chunk);
          res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: data }));
        });
        req.on('error', reject);
        req.end();
      });
    },
  };
}
