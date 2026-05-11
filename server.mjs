#!/usr/bin/env node
import { createApp } from './lib/app.mjs';

const vaultPath = process.env.VAULT_PATH || process.argv[2];
if (!vaultPath) { console.error('Usage: server.mjs <vault-path>'); process.exit(1); }

const { start } = createApp(vaultPath);
const actualPort = await start();
console.error(`obsidian-mcp listening on port ${actualPort}`);
