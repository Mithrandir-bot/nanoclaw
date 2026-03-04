#!/usr/bin/env npx ts-node
/**
 * index-obsidian.ts
 *
 * Generates INDEX.md at the vault root — a compact map of all vault content.
 * Agents read this at every session start so they always know what exists,
 * even after context compaction.
 *
 * Run manually:   npx ts-node scripts/index-obsidian.ts
 * Run via timer:  nanoclaw-index-obsidian.timer (daily 2am ET)
 * Run on compact: called from PreCompact hook in agent-runner
 */

import * as fs from 'fs';
import * as path from 'path';

const VAULT = process.env.OBSIDIAN_VAULT || '/root/obsidian-vault';
const INDEX_PATH = path.join(VAULT, 'INDEX.md');

// Folders to skip entirely
const SKIP_DIRS = new Set(['.obsidian', '.trash', 'node_modules']);

interface FileEntry {
  relPath: string;
  title: string;
  description: string;
  mtime: Date;
}

function extractMeta(filePath: string): { title: string; description: string } {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    const lines = content.split('\n');

    // Skip YAML frontmatter
    let start = 0;
    if (lines[0]?.trim() === '---') {
      const end = lines.findIndex((l, i) => i > 0 && l.trim() === '---');
      if (end > 0) start = end + 1;
    }

    // Find first heading for title
    let title = '';
    let description = '';
    for (let i = start; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!title && line.startsWith('#')) {
        title = line.replace(/^#+\s*/, '');
        continue;
      }
      if (title && line && !line.startsWith('#') && !line.startsWith('!')) {
        // Strip markdown formatting for description
        description = line
          .replace(/\*\*(.*?)\*\*/g, '$1')
          .replace(/\*(.*?)\*/g, '$1')
          .replace(/\[(.*?)\]\(.*?\)/g, '$1')
          .slice(0, 120);
        break;
      }
    }

    return {
      title: title || path.basename(filePath, '.md').replace(/-/g, ' '),
      description,
    };
  } catch {
    return { title: path.basename(filePath, '.md'), description: '' };
  }
}

function walkVault(dir: string, baseDir: string): Map<string, FileEntry[]> {
  const byFolder = new Map<string, FileEntry[]>();

  function walk(current: string) {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(current, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (entry.name.startsWith('.') || SKIP_DIRS.has(entry.name)) continue;

      const fullPath = path.join(current, entry.name);

      if (entry.isDirectory()) {
        walk(fullPath);
      } else if (entry.isFile() && entry.name.endsWith('.md') && entry.name !== 'INDEX.md') {
        const relPath = path.relative(baseDir, fullPath);
        const folder = path.dirname(relPath) === '.' ? '(root)' : path.dirname(relPath);
        const stat = fs.statSync(fullPath);
        const { title, description } = extractMeta(fullPath);

        if (!byFolder.has(folder)) byFolder.set(folder, []);
        byFolder.get(folder)!.push({
          relPath,
          title,
          description,
          mtime: stat.mtime,
        });
      }
    }
  }

  walk(dir);

  // Sort files within each folder by mtime desc (most recent first)
  for (const [, files] of byFolder) {
    files.sort((a, b) => b.mtime.getTime() - a.mtime.getTime());
  }

  return byFolder;
}

function formatDate(d: Date): string {
  return d.toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
    timeZone: 'America/New_York',
  });
}

function buildIndex(): string {
  const now = new Date();
  const byFolder = walkVault(VAULT, VAULT);

  const totalFiles = [...byFolder.values()].reduce((s, f) => s + f.length, 0);

  const lines: string[] = [
    '# Vault Index',
    '',
    `Updated: ${now.toLocaleString('en-US', { timeZone: 'America/New_York', month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true })} ET — ${totalFiles} notes`,
    '',
    '> This index is regenerated daily and on context compaction. Read it at session start to know what exists in the vault.',
    '',
    '---',
    '',
  ];

  // Sort folders: root-level first, then alphabetical
  const sortedFolders = [...byFolder.keys()].sort((a, b) => {
    if (a === '(root)') return -1;
    if (b === '(root)') return 1;
    return a.localeCompare(b);
  });

  for (const folder of sortedFolders) {
    const files = byFolder.get(folder)!;
    lines.push(`## ${folder} (${files.length})`);
    lines.push('');

    // Show all files; for large folders cap at 50 with a note
    const displayFiles = files.slice(0, 50);
    for (const f of displayFiles) {
      const name = path.basename(f.relPath, '.md');
      const desc = f.description ? ` — ${f.description}` : '';
      const age = formatDate(f.mtime);
      lines.push(`- **${name}**${desc} _(${age})_`);
    }
    if (files.length > 50) {
      lines.push(`- _...and ${files.length - 50} more_`);
    }
    lines.push('');
  }

  if (totalFiles === 0) {
    lines.push('_No notes yet. Agents will populate this vault as they work._');
    lines.push('');
  }

  return lines.join('\n');
}

const content = buildIndex();
fs.writeFileSync(INDEX_PATH, content);

const lineCount = content.split('\n').length;
console.log(`Index written to ${INDEX_PATH} (${lineCount} lines)`);
