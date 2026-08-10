# obsidian-mcp

Single-container MCP server for an Obsidian vault. Handles authentication, CORS, and exposes 15 vault-management tools — no nginx or supergateway needed.

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
| `MCP_TOKEN` | `f304...fcb` | API token for Bearer or URL-path auth |
| `PORT` | `3000` | HTTP listen port |
| `ALLOWED_ORIGIN` | `https://chat.lost.plus` | CORS allowed origin |
| `HOST` | `0.0.0.0` | Bind address |

Authentication supports both `Authorization: Bearer <token>` headers and URL-path tokens (`/<token>/mcp`).

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
