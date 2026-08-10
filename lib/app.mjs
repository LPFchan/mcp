import express from 'express';
import http from 'http';
import { createMcpHandler, fromJsonSchema, McpServer } from '@modelcontextprotocol/server';
import { toNodeHandler } from '@modelcontextprotocol/node';
import { createTools } from './tools.mjs';

const DEFAULT_ORIGIN = 'https://chat.lost.plus';

const CORS_METHODS = 'get, post, delete, options';
const CORS_HEADERS = 'authorization, content-type, accept, mcp-session-id, mcp-protocol-version, mcp-method, mcp-name, mcp-param-*, last-event-id, x-api-key';
const CORS_EXPOSE_HEADERS = 'mcp-session-id, mcp-protocol-version, content-type';

function echoOrigin(origin, patterns) {
  if (!origin) return null;
  for (const p of patterns) {
    if (p.includes('*')) {
      const re = new RegExp('^' + p.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*') + '$');
      if (re.test(origin)) return origin;
    } else if (p === origin) {
      return origin;
    }
  }
  return origin;
}

export function createApp(vaultPath, opts = {}) {
  const token = opts.token || process.env.MCP_TOKEN;
  if (!token) throw new Error('MCP_TOKEN is required via env or opts.token');
  const port = opts.port ?? parseInt(process.env.PORT || '3000', 10);
  const host = opts.host || process.env.HOST || '0.0.0.0';
  const corsOrigins = (opts.allowedOrigins || process.env.ALLOWED_ORIGINS || process.env.ALLOWED_ORIGIN || DEFAULT_ORIGIN)
    .split(',').map(s => s.trim()).filter(Boolean);

  const TOOLS = createTools(vaultPath);

  function createServer() {
    const server = new McpServer(
      { name: 'obsidian-mcp', version: '2.1.0' },
      {
        cacheHints: {
          'server/discover': { ttlMs: 300_000, cacheScope: 'public' },
          'tools/list': { ttlMs: 300_000, cacheScope: 'private' },
        },
      },
    );
    for (const [name, tool] of Object.entries(TOOLS)) {
      server.registerTool(
        name,
        {
          description: tool.description,
          inputSchema: fromJsonSchema(tool.inputSchema),
        },
        async (args) => {
          try {
            const result = await tool.run(args);
            return { content: [{ type: 'text', text: String(result) }] };
          } catch (err) {
            console.error('Tool error:', name, err.message);
            return {
              content: [{ type: 'text', text: `Error: ${err.message}` }],
              isError: true,
            };
          }
        },
      );
    }
    return server;
  }

  const mcpHandler = createMcpHandler(() => createServer(), {
    legacy: 'stateless',
    onerror: (err) => console.error('MCP protocol error:', err),
  });
  const nodeMcpHandler = toNodeHandler(mcpHandler, {
    onerror: (err) => console.error('MCP HTTP error:', err),
  });

  const app = express();

  // CORS — handled before auth because browsers strip Authorization on OPTIONS
  app.use((req, res, next) => {
    const origin = req.headers.origin;
    const matched = echoOrigin(origin, corsOrigins);
    if (matched) {
      res.setHeader('access-control-allow-origin', matched);
    } else if (origin) {
      res.setHeader('access-control-allow-origin', origin);
    }
    res.setHeader('access-control-expose-headers', CORS_EXPOSE_HEADERS);
    res.setHeader('vary', 'Origin');

    if (req.method === 'OPTIONS') {
      res.setHeader('access-control-allow-methods', CORS_METHODS);
      res.setHeader('access-control-allow-headers', CORS_HEADERS);
      res.setHeader('access-control-max-age', '86400');
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

  // The SDK owns protocol routing and supports both 2026-07-28 and legacy clients.
  app.use('/', (req, res, next) => {
    if (req.method === 'POST' && (req.path === '/' || req.path === '/mcp/')) {
      req.url = '/mcp';
    }
    nodeMcpHandler(req, res).catch(next);
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
