# obsidian-mcp

Single-container MCP server for an Obsidian vault. It handles CORS and exposes
15 vault-management tools. Production authentication is centralized in the
Common Auth gateway.

## Protocol

The server uses the official MCP TypeScript SDK v2. Its HTTP endpoint serves the
`2026-07-28` stateless protocol through `server/discover` and keeps a stateless
legacy fallback for clients that still use the `initialize` handshake. Tool
registration and protocol validation remain in the SDK.

## Quick start

```bash
docker run -d --name mcp \
  -p 127.0.0.1:3000:3000 \
  -v /path/to/your/vault:/vault \
  -e VAULT_PATH=/vault/Obsidian\ Vault \
  ghcr.io/lpfchan/mcp
```

Or with docker-compose:

```yaml
services:
  mcp:
    build: .
    container_name: mcp
    ports:
      - 127.0.0.1:3000:3000
    environment:
      - VAULT_PATH=/vault/Obsidian Vault
    volumes:
      - ./vault:/vault
```

## Configuration

| Variable | Default | Description |
|---|---|---|
| `VAULT_PATH` | (required) | Path to the Obsidian vault inside the container |
| `PORT` | `3000` | HTTP listen port |
| `ALLOWED_ORIGIN` | `https://chat.lost.plus` | CORS allowed origin |
| `HOST` | `0.0.0.0` | Bind address |

The production endpoint is `https://mcp.lost.plus/mcp`. The shared Common Auth
gateway protects it with the `obsidian` scope. Send a Common Auth token as
`Authorization: Bearer <token>` or `X-API-Key: <token>`. The backend does not
authenticate requests itself and must remain bound to localhost behind the
gateway. Tokens in URL paths are no longer supported.

## Tools

| Tool | Description |
|---|---|
| `list-available-vaults` | Lists available vault names |
| `read-note` | Reads a note's content |
| `create-note` | Creates a new note |
| `edit-note` | Edits a note (append, prepend, overwrite, or targeted replace) |
| `search-vault` | Searches content, filenames, or tags (with fuzzy mode) |
| `list-notes` | Lists all `.md` files with optional stats |
| `move-note` | Moves or renames a note |
| `create-directory` | Creates a directory in the vault |
| `delete-note` | Moves a note to `.trash` |
| `add-tags` | Adds tags to frontmatter |
| `remove-tags` | Removes tags from frontmatter |
| `rename-tag` | Renames a tag across all notes |
| `delete-directory` | Permanently deletes a directory |
| `open-trash` | Lists files in `.trash` |
| `recover-from-trash` | Recovers a file from `.trash` |

## Testing

```bash
npm install
npm test
```

61 tests across 23 suites covering every tool, protocol negotiation, auth, CORS, and edge cases.
