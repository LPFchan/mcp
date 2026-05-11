import express from 'express';
import http from 'http';
import crypto from 'crypto';
import { createTools } from './tools.mjs';

const DEFAULT_TOKEN = 'f3044131e50d4a36e42d0db35edd06d515d9d62d322e0a0c36003ea2b0d05fcb';
const DEFAULT_ORIGIN = 'https://chat.lost.plus';

const CORS_METHODS = 'GET, POST, DELETE, OPTIONS';
const CORS_HEADERS = 'Authorization, Content-Type, Accept, Mcp-Session-Id, Mcp-Protocol-Version, Last-Event-ID';

function sse(res, data) {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.write(`event: message\ndata: ${JSON.stringify(data)}\n\n`);
  res.end();
}

function json(res, data) {
  res.json(data);
}

export function createApp(vaultPath, opts = {}) {
  const token = opts.token || process.env.MCP_TOKEN || DEFAULT_TOKEN;
  const port = opts.port ?? parseInt(process.env.PORT || '3000', 10);
  const host = opts.host || process.env.HOST || '0.0.0.0';
  const allowedOrigin = opts.allowedOrigin || process.env.ALLOWED_ORIGIN || DEFAULT_ORIGIN;

  const TOOLS = createTools(vaultPath);

  const app = express();

  app.use(express.json({ type: ['application/json', 'text/plain'] }));

  // CORS — handled before auth because browsers strip Authorization on OPTIONS
  app.use((req, res, next) => {
    const origin = req.headers.origin;
    if (origin) {
      res.setHeader('Access-Control-Allow-Origin', allowedOrigin);
    }
    res.setHeader('Access-Control-Expose-Headers', 'Mcp-Session-Id');

    if (req.method === 'OPTIONS') {
      res.setHeader('Access-Control-Allow-Methods', CORS_METHODS);
      res.setHeader('Access-Control-Allow-Headers', CORS_HEADERS);
      res.setHeader('Access-Control-Max-Age', '86400');
      return res.status(204).end();
    }
    next();
  });

  // OAuth discovery rejection — skip OAuth flow
  app.use('/.well-known', (req, res) => res.sendStatus(404));
  app.all('/register', (req, res) => res.sendStatus(404));

  // Token authentication (Bearer header or URL-path token)
  app.use((req, res, next) => {
    const m = req.url.match(/^\/([a-f0-9]{64})(\/.*)?$/);
    if (m) {
      if (m[1] === token) {
        req.url = m[2] || '/';
        return next();
      }
      return res.sendStatus(401);
    }

    if (req.headers.authorization === `Bearer ${token}`) {
      return next();
    }

    res.sendStatus(401);
  });

  // ── MCP JSON-RPC handler ────────────────────────────────────────────────

  const sessions = new Map();

  const INFO = {
    name: 'obsidian-mcp',
    version: '2.1.0',
  };

  const CAPABILITIES = { tools: {} };

  const TOOL_LIST = Object.entries(TOOLS).map(([name, { description, inputSchema }]) => ({
    name, description, inputSchema,
  }));

  app.use('/', async (req, res) => {
    const acceptsSSE = (req.headers.accept || '').includes('text/event-stream');
    const respond = acceptsSSE ? sse : json;

    if (req.method === 'DELETE') {
      const sid = req.headers['mcp-session-id'];
      if (sid) sessions.delete(sid);
      return res.status(200).json({ jsonrpc: '2.0', result: {}, id: null });
    }

    if (req.method === 'GET') {
      if (!acceptsSSE) {
        return res.status(406).json({ jsonrpc: '2.0', error: { code: -32000, message: 'Not Acceptable: Client must accept text/event-stream' }, id: null });
      }
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache, no-transform');
      res.setHeader('Connection', 'keep-alive');
      res.write(`: ok\n\n`);
      res.flushHeaders();
      req.on('close', () => res.end());
      return;
    }

    if (req.method !== 'POST') {
      return res.status(405).json({ jsonrpc: '2.0', error: { code: -32000, message: 'Method not allowed' }, id: null });
    }

    if (!req.body || typeof req.body.method !== 'string') {
      return res.status(400).json({ jsonrpc: '2.0', error: { code: -32600, message: 'Invalid Request' }, id: null });
    }

    const { method, params, id } = req.body;

    const sessionId = req.headers['mcp-session-id'] || null;

    try {
      if (method === 'initialize') {
        const sid = crypto.randomUUID();
        sessions.set(sid, { initialized: false });
        res.setHeader('Mcp-Session-Id', sid);
        return respond(res, {
          jsonrpc: '2.0',
          result: {
            protocolVersion: params?.protocolVersion || '2025-06-18',
            capabilities: CAPABILITIES,
            serverInfo: INFO,
          },
          id,
        });
      }

      if (method === 'notifications/initialized') {
        if (sessionId && sessions.has(sessionId)) {
          sessions.get(sessionId).initialized = true;
        }
        return res.status(202).end();
      }

      if (method === 'tools/list') {
        return respond(res, {
          jsonrpc: '2.0',
          result: { tools: TOOL_LIST },
          id,
        });
      }

      if (method === 'tools/call') {
        const tool = TOOLS[params.name];
        if (!tool) {
          return respond(res, {
            jsonrpc: '2.0',
            result: { content: [{ type: 'text', text: `Unknown tool: ${params.name}` }], isError: true },
            id,
          });
        }
        try {
          const result = await tool.run(params.arguments ?? {});
          return respond(res, {
            jsonrpc: '2.0',
            result: { content: [{ type: 'text', text: String(result) }] },
            id,
          });
        } catch (err) {
          console.error('Tool error:', params.name, err.message);
          return respond(res, {
            jsonrpc: '2.0',
            result: { content: [{ type: 'text', text: `Error: ${err.message}` }], isError: true },
            id,
          });
        }
      }

      return res.status(404).json({
        jsonrpc: '2.0',
        error: { code: -32601, message: `Method not found: ${method}` },
        id,
      });
    } catch (err) {
      console.error('MCP handler error:', err);
      if (!res.headersSent) {
        res.status(500).json({
          jsonrpc: '2.0',
          error: { code: -32603, message: 'Internal error' },
          id: null,
        });
      }
    }
  });

  let httpServer;

  async function start(listenPort) {
    const p = listenPort ?? port;
    httpServer = http.createServer(app);
    return new Promise((resolve, reject) => {
      httpServer.on('error', reject);
      httpServer.listen(p, host, () => {
        resolve(httpServer.address().port);
      });
    });
  }

  async function close() {
    if (httpServer) {
      await new Promise((resolve) => httpServer.close(resolve));
    }
  }

  return { app, TOOLS, start, close };
}
