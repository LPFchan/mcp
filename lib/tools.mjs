import fs from 'fs/promises';
import path from 'path';

// ── Frontmatter (pure, no vault dependency) ──────────────────────────────────

export function splitFrontmatter(content) {
  const m = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  return m ? { fm: m[1], body: content.slice(m[0].length) } : { fm: null, body: content };
}

export function parseTags(fm) {
  if (!fm) return [];
  const list = fm.match(/^tags:\s*\n((?:[ \t]+-[ \t]+.+\n?)*)/m);
  if (list) return [...list[1].matchAll(/[ \t]+-[ \t]+(.+)/g)].map(m => m[1].trim());
  const inline = fm.match(/^tags:\s*\[([^\]]*)\]/m);
  if (inline) return inline[1].split(',').map(t => t.trim()).filter(Boolean);
  return [];
}

export function buildFrontmatter(fm, tags) {
  const block = tags.length ? `tags:\n${tags.map(t => `  - ${t}`).join('\n')}` : null;
  if (!fm) return block ? `---\n${block}\n---\n` : '';
  const stripped = fm.replace(/^tags:.*\n(?:[ \t]+-.+\n?)*/m, '').replace(/^tags:\s*\[.*\]\n?/m, '');
  const joined = [stripped.trim(), block].filter(Boolean).join('\n');
  return `---\n${joined}\n---\n`;
}

export function rebuildNote(fm, body, tags) {
  return buildFrontmatter(fm, tags) + body;
}

// ── Search (pure, no vault dependency) ───────────────────────────────────────

function normalizeSep(s) {
  return s.replace(/[-_\s]+/g, ' ');
}

export function fuzzyScore(needle, haystack) {
  const n = normalizeSep(needle).toLowerCase(), h = normalizeSep(haystack).toLowerCase();
  let ni = 0, score = 0, run = 0;
  for (let hi = 0; hi < h.length && ni < n.length; hi++) {
    if (h[hi] === n[ni]) { score += 1 + run; run++; ni++; }
    else run = 0;
  }
  return ni === n.length ? score : 0;
}

export function fuzzyContentMatch(query, content) {
  const lc = content.toLowerCase();
  return query.toLowerCase().split(/\s+/).filter(Boolean).every(w => lc.includes(w));
}

// ── Tools factory ────────────────────────────────────────────────────────────

export function createTools(vaultPath) {

  const vaultName = path.basename(vaultPath).toLowerCase().replace(/\s+/g, '-');
  const trashPath = path.join(vaultPath, '.trash');

  function resolvePath(folder, filename) {
    return path.join(folder ? path.join(vaultPath, folder) : vaultPath, filename);
  }

  async function readFile(fp) {
    return fs.readFile(fp, 'utf8');
  }

  async function writeFile(fp, content) {
    await fs.mkdir(path.dirname(fp), { recursive: true });
    await fs.writeFile(fp, content, 'utf8');
  }

  async function walkMd(dir) {
    const files = [];
    for (const entry of await fs.readdir(dir, { withFileTypes: true }).catch(() => [])) {
      if (entry.name.startsWith('.')) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) files.push(...await walkMd(full));
      else if (entry.name.endsWith('.md')) files.push(full);
    }
    return files;
  }

  async function search(query, searchType, caseSensitive, subPath, fuzzy = false) {
    const root = subPath ? path.join(vaultPath, subPath) : vaultPath;
    const files = await walkMd(root);
    const isTag = query.startsWith('tag:');
    const tagQuery = isTag ? query.slice(4).trim() : null;
    const flags = caseSensitive ? '' : 'i';
    const re = isTag || fuzzy ? null : new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), flags);
    const results = [];

    for (const fp of files) {
      const rel = path.relative(vaultPath, fp);
      const content = await readFile(fp);
      const { fm } = splitFrontmatter(content);
      const matchingLines = [];

      if (isTag) {
        const tags = parseTags(fm);
        if (tags.some(t => t.toLowerCase() === tagQuery.toLowerCase()))
          results.push({ rel, matchingLines: [], score: 1 });
        continue;
      }

      const basename = path.basename(fp);
      let filenameScore = 0;
      let matchesFilename = false;

      if (searchType !== 'content') {
        if (fuzzy) {
          filenameScore = fuzzyScore(query, basename);
          matchesFilename = filenameScore > 0;
        } else {
          matchesFilename = re.test(basename);
        }
      }

      if (searchType !== 'filename') {
        if (fuzzy) {
          if (fuzzyContentMatch(query, content)) {
            const words = query.toLowerCase().split(/\s+/).filter(Boolean);
            const wordRe = new RegExp(words.map(w => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|'), 'gi');
            content.split('\n').forEach((line, i) => {
              if (wordRe.test(line)) matchingLines.push({ num: i + 1, line });
            });
          }
        } else {
          content.split('\n').forEach((line, i) => {
            if (re.test(line)) matchingLines.push({ num: i + 1, line });
          });
        }
      }

      if (matchesFilename || matchingLines.length)
        results.push({ rel, matchingLines, score: filenameScore + matchingLines.length });
    }

    if (fuzzy) results.sort((a, b) => b.score - a.score);
    return results;
  }

  function formatSearchResults(results) {
    if (!results.length) return 'No matches found.';
    const total = results.reduce((n, r) => n + r.matchingLines.length, 0);
    const lines = [`Found ${total} matches in ${results.length} files\n`, 'Content matches:\n'];
    for (const { rel, matchingLines } of results) {
      lines.push(`File: ${rel}`);
      for (const { num, line } of matchingLines) lines.push(`  Line ${num}: ${line}`);
      lines.push('');
    }
    return lines.join('\n');
  }

  const TOOLS = {
    'list-available-vaults': {
      description: 'Lists all available vaults that can be used with other tools',
      inputSchema: { type: 'object', properties: {} },
      async run() {
        return `Available vaults:\n  - ${vaultName}`;
      }
    },

    'read-note': {
      description: 'Read the content of an existing note in the vault.',
      inputSchema: {
        type: 'object',
        properties: {
          vault: { type: 'string' },
          filename: { type: 'string', description: 'Note filename (e.g. my-note.md)' },
          folder: { type: 'string', description: 'Optional subfolder path' }
        },
        required: ['vault', 'filename']
      },
      async run({ filename, folder }) {
        return await readFile(resolvePath(folder, filename));
      }
    },

    'create-note': {
      description: 'Create a new note in the vault.',
      inputSchema: {
        type: 'object',
        properties: {
          vault: { type: 'string' },
          filename: { type: 'string' },
          folder: { type: 'string' },
          content: { type: 'string' }
        },
        required: ['vault', 'filename', 'content']
      },
      async run({ filename, folder, content }) {
        const fp = resolvePath(folder, filename);
        await writeFile(fp, content);
        return `Created: ${path.relative(vaultPath, fp)}`;
      }
    },

    'edit-note': {
      description: 'Edit an existing note (append, prepend, overwrite, or replace). "replace" does a targeted oldString→newString substitution; "overwrite" replaces the entire document.',
      inputSchema: {
        type: 'object',
        properties: {
          vault: { type: 'string' },
          filename: { type: 'string' },
          folder: { type: 'string' },
          operation: { type: 'string', enum: ['append', 'prepend', 'overwrite', 'replace'] },
          content: { type: 'string', description: 'Required for append, prepend, and overwrite operations' },
          oldString: { type: 'string', description: 'Required for replace operation — text to find' },
          newString: { type: 'string', description: 'Required for replace operation — text to replace with' }
        },
        required: ['vault', 'filename', 'operation']
      },
      async run({ filename, folder, operation, content, oldString, newString }) {
        const fp = resolvePath(folder, filename);
        const existing = await readFile(fp);
        let updated;
        if (operation === 'replace') {
          if (!oldString) throw new Error('oldString is required for replace operation');
          if (newString === undefined) throw new Error('newString is required for replace operation');
          if (!existing.includes(oldString)) throw new Error('oldString not found in content');
          updated = existing.replace(oldString, newString);
        } else {
          if (content === undefined) throw new Error('content is required for append, prepend, and overwrite operations');
          updated =
            operation === 'append'    ? existing + '\n' + content :
            operation === 'prepend'   ? content + '\n' + existing :
            content;
        }
        await writeFile(fp, updated);
        return `Note ${operation}ed successfully\n\nModified file: ${path.relative(vaultPath, fp)}`;
      }
    },

    'search-vault': {
      description: 'Search for content within vault notes. Use fuzzy:true for approximate/typo-tolerant matching.',
      inputSchema: {
        type: 'object',
        properties: {
          vault: { type: 'string' },
          query: { type: 'string' },
          searchType: { type: 'string', enum: ['content', 'filename', 'both'], default: 'both' },
          caseSensitive: { type: 'boolean', default: false },
          fuzzy: { type: 'boolean', default: false, description: 'Enable fuzzy matching: subsequence for filenames, all-words-present for content' },
          path: { type: 'string' }
        },
        required: ['vault', 'query']
      },
      async run({ query, searchType = 'both', caseSensitive = false, fuzzy = false, path: subPath }) {
        return formatSearchResults(await search(query, searchType, caseSensitive, subPath, fuzzy));
      }
    },

    'list-notes': {
      description: 'List all notes in the vault (or a subfolder), returning their relative paths.',
      inputSchema: {
        type: 'object',
        properties: {
          vault: { type: 'string' },
          folder: { type: 'string', description: 'Optional subfolder to list within' },
          includeStats: { type: 'boolean', default: false, description: 'Include file size and last-modified date' }
        },
        required: ['vault']
      },
      async run({ folder, includeStats = false }) {
        const root = folder ? path.join(vaultPath, folder) : vaultPath;
        const files = await walkMd(root);
        if (!files.length) return 'No notes found.';
        const lines = [`${files.length} note(s):\n`];
        for (const fp of files.sort()) {
          const rel = path.relative(vaultPath, fp);
          if (includeStats) {
            const stat = await fs.stat(fp);
            const kb = (stat.size / 1024).toFixed(1);
            const modified = stat.mtime.toISOString().slice(0, 10);
            lines.push(`  ${rel}  (${kb} KB, modified ${modified})`);
          } else {
            lines.push(`  ${rel}`);
          }
        }
        return lines.join('\n');
      }
    },

    'move-note': {
      description: 'Move or rename a note.',
      inputSchema: {
        type: 'object',
        properties: {
          vault: { type: 'string' },
          filename: { type: 'string' },
          folder: { type: 'string' },
          newFilename: { type: 'string' },
          newFolder: { type: 'string' }
        },
        required: ['vault', 'filename']
      },
      async run({ filename, folder, newFilename, newFolder }) {
        const src = resolvePath(folder, filename);
        const dest = resolvePath(newFolder ?? folder, newFilename ?? filename);
        await fs.mkdir(path.dirname(dest), { recursive: true });
        await fs.rename(src, dest);
        return `Moved to ${path.relative(vaultPath, dest)}`;
      }
    },

    'create-directory': {
      description: 'Create a directory in the vault.',
      inputSchema: {
        type: 'object',
        properties: {
          vault: { type: 'string' },
          path: { type: 'string' }
        },
        required: ['vault', 'path']
      },
      async run({ path: dirPath }) {
        await fs.mkdir(path.join(vaultPath, dirPath), { recursive: true });
        return `Created directory: ${dirPath}`;
      }
    },

    'delete-note': {
      description: 'Delete a note (moves to .trash).',
      inputSchema: {
        type: 'object',
        properties: {
          vault: { type: 'string' },
          filename: { type: 'string' },
          folder: { type: 'string' }
        },
        required: ['vault', 'filename']
      },
      async run({ filename, folder }) {
        const src = resolvePath(folder, filename);
        await fs.mkdir(trashPath, { recursive: true });
        await fs.rename(src, path.join(trashPath, filename));
        return `Moved ${filename} to .trash`;
      }
    },

    'add-tags': {
      description: 'Add tags to a note\'s frontmatter.',
      inputSchema: {
        type: 'object',
        properties: {
          vault: { type: 'string' },
          filename: { type: 'string' },
          folder: { type: 'string' },
          tags: { type: 'array', items: { type: 'string' } }
        },
        required: ['vault', 'filename', 'tags']
      },
      async run({ filename, folder, tags }) {
        const fp = resolvePath(folder, filename);
        const { fm, body } = splitFrontmatter(await readFile(fp));
        const updated = [...new Set([...parseTags(fm), ...tags])];
        await writeFile(fp, rebuildNote(fm, body, updated));
        return `Added tags: ${tags.join(', ')}`;
      }
    },

    'remove-tags': {
      description: 'Remove tags from a note\'s frontmatter.',
      inputSchema: {
        type: 'object',
        properties: {
          vault: { type: 'string' },
          filename: { type: 'string' },
          folder: { type: 'string' },
          tags: { type: 'array', items: { type: 'string' } }
        },
        required: ['vault', 'filename', 'tags']
      },
      async run({ filename, folder, tags }) {
        const fp = resolvePath(folder, filename);
        const { fm, body } = splitFrontmatter(await readFile(fp));
        const updated = parseTags(fm).filter(t => !tags.includes(t));
        await writeFile(fp, rebuildNote(fm, body, updated));
        return `Removed tags: ${tags.join(', ')}`;
      }
    },

    'rename-tag': {
      description: 'Rename a tag across all notes in the vault.',
      inputSchema: {
        type: 'object',
        properties: {
          vault: { type: 'string' },
          oldTag: { type: 'string' },
          newTag: { type: 'string' }
        },
        required: ['vault', 'oldTag', 'newTag']
      },
      async run({ oldTag, newTag }) {
        const files = await walkMd(vaultPath);
        let count = 0;
        for (const fp of files) {
          const { fm, body } = splitFrontmatter(await readFile(fp));
          const tags = parseTags(fm);
          if (tags.includes(oldTag)) {
            await writeFile(fp, rebuildNote(fm, body, tags.map(t => t === oldTag ? newTag : t)));
            count++;
          }
        }
        return `Renamed tag "${oldTag}" → "${newTag}" in ${count} note(s)`;
      }
    },

    'delete-directory': {
      description: 'Permanently delete a directory and all its contents from the vault.',
      inputSchema: {
        type: 'object',
        properties: {
          vault: { type: 'string' },
          path: { type: 'string', description: 'Directory path relative to vault root' }
        },
        required: ['vault', 'path']
      },
      async run({ path: dirPath }) {
        const full = path.join(vaultPath, dirPath);
        await fs.rm(full, { recursive: true, force: true });
        return `Deleted directory: ${dirPath}`;
      }
    },

    'open-trash': {
      description: 'List all files currently in the vault .trash folder.',
      inputSchema: {
        type: 'object',
        properties: {
          vault: { type: 'string' }
        },
        required: ['vault']
      },
      async run() {
        const entries = await fs.readdir(trashPath).catch(() => []);
        if (!entries.length) return 'Trash is empty.';
        return `Files in .trash:\n${entries.map(e => `  - ${e}`).join('\n')}`;
      }
    },

    'recover-from-trash': {
      description: 'Recover a file from .trash back into the vault.',
      inputSchema: {
        type: 'object',
        properties: {
          vault: { type: 'string' },
          filename: { type: 'string', description: 'Filename as it appears in .trash' },
          targetFolder: { type: 'string', description: 'Destination folder (defaults to vault root)' }
        },
        required: ['vault', 'filename']
      },
      async run({ filename, targetFolder }) {
        const src = path.join(trashPath, filename);
        const dest = resolvePath(targetFolder, filename);
        await fs.mkdir(path.dirname(dest), { recursive: true });
        await fs.rename(src, dest);
        return `Recovered ${filename} from .trash → ${path.relative(vaultPath, dest)}`;
      }
    }
  };

  return TOOLS;
}
