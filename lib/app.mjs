import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { ListToolsRequestSchema, CallToolRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import express from 'express';
import http from 'http';
import crypto from 'crypto';
import { createTools } from './tools.mjs';

const DEFAULT_TOKEN = 'f3044131e50d4a36e42d0db35edd06d515d9d62d322e0a0c36003ea2b0d05fcb';
const DEFAULT_ORIGIN = 'https://chat.lost.plus';

const CORS_METHODS = 'GET, POST, DELETE, OPTIONS';
const CORS_HEADERS = 'Authorization, Content-Type, Accept, Mcp-Session-Id, Mcp-Protocol-Version, Last-Event-ID';

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

  // ── MCP Server ────────────────────────────────────────────────────────────

  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: () => crypto.randomUUID(),
  });

  const server = new Server(
    { name: 'obsidian-mcp', version: '2.1.0' },
    { capabilities: { tools: {} } }
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: Object.entries(TOOLS).map(([name, { description, inputSchema }]) => ({
      name, description, inputSchema
    }))
  }));

  server.setRequestHandler(CallToolRequestSchema, async (req) => {
    const { name, arguments: args } = req.params;
    const tool = TOOLS[name];
    if (!tool) return { content: [{ type: 'text', text: `Unknown tool: ${name}` }], isError: true };
    try {
      const result = await tool.run(args ?? {});
      const text = String(result);
      return { content: [{ type: 'text', text }] };
    } catch (err) {
      console.error('Tool error:', name, err.message);
      return { content: [{ type: 'text', text: `Error: ${err.message}` }], isError: true };
    }
  });

  // MCP streamable HTTP handler
  app.use(async (req, res) => {
    const body = req.body && Object.keys(req.body).length ? req.body : undefined;
    try {
      await transport.handleRequest(req, res, body);
    } catch (e) {
      console.error('handleRequest threw:', e.message);
      if (!res.headersSent) res.writeHead(500).end('Internal error');
    }
  });

  // Global error handler
  app.use((err, req, res, next) => {
    console.error('Express error:', err);
    if (!res.headersSent) res.status(500).json({ error: err.message || 'Internal error' });
  });

  let httpServer;

  async function start(listenPort) {
    const p = listenPort ?? port;
    await server.connect(transport);
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
    await transport.close();
    await server.close();
  }

  return { app, server, transport, TOOLS, start, close };
}
