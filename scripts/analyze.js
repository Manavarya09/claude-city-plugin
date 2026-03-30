#!/usr/bin/env node
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const LANGUAGE_MAP = {
  '.js': 'javascript', '.jsx': 'javascript', '.mjs': 'javascript',
  '.ts': 'typescript', '.tsx': 'typescript',
  '.py': 'python', '.pyw': 'python',
  '.rs': 'rust', '.go': 'go', '.java': 'java',
  '.rb': 'ruby', '.php': 'php', '.swift': 'swift',
  '.kt': 'kotlin', '.scala': 'scala', '.cs': 'csharp',
  '.cpp': 'cpp', '.c': 'c', '.h': 'c', '.hpp': 'cpp',
  '.html': 'html', '.css': 'css', '.scss': 'scss', '.less': 'less',
  '.json': 'json', '.yaml': 'yaml', '.yml': 'yaml', '.toml': 'toml',
  '.md': 'markdown', '.txt': 'text', '.sh': 'shell', '.bash': 'shell',
  '.sql': 'sql', '.graphql': 'graphql', '.proto': 'protobuf',
  '.vue': 'vue', '.svelte': 'svelte', '.dart': 'dart', '.ex': 'elixir',
  '.lua': 'lua', '.r': 'r', '.R': 'r', '.m': 'objectivec',
};

const LANGUAGE_COLORS = {
  javascript: '#f7df1e', typescript: '#3178c6', python: '#3572A5',
  rust: '#dea584', go: '#00ADD8', java: '#b07219', ruby: '#701516',
  php: '#4F5D95', swift: '#F05138', kotlin: '#A97BFF', csharp: '#239120',
  cpp: '#f34b7d', c: '#555555', html: '#e34c26', css: '#563d7c',
  scss: '#c6538c', json: '#40d47e', yaml: '#cb171e', shell: '#89e051',
  vue: '#41b883', svelte: '#ff3e00', markdown: '#083fa1', sql: '#e38c00',
  default: '#8b949e'
};

const SKIP_DIRS = new Set([
  'node_modules', '.git', '.next', '.nuxt', 'dist', 'build', 'out',
  '__pycache__', '.cache', '.vscode', '.idea', 'vendor', 'target',
  '.team-brain', '.cost-guardian', '.claude', 'coverage', '.turbo'
]);

const SKIP_FILES = new Set([
  'package-lock.json', 'yarn.lock', 'pnpm-lock.yaml', '.DS_Store',
  'Thumbs.db', '.gitkeep', '.npmrc', '.editorconfig'
]);

function run(cmd, cwd) {
  try {
    return execSync(cmd, { cwd, encoding: 'utf8', timeout: 30000, maxBuffer: 50 * 1024 * 1024 }).trim();
  } catch { return ''; }
}

function countLines(filepath) {
  try {
    const content = fs.readFileSync(filepath, 'utf8');
    return content.split('\n').length;
  } catch { return 0; }
}

function getLanguage(filepath) {
  const ext = path.extname(filepath).toLowerCase();
  return LANGUAGE_MAP[ext] || 'other';
}

function getColor(lang) {
  return LANGUAGE_COLORS[lang] || LANGUAGE_COLORS.default;
}

// --- Git Analysis ---

function getFileChurn(repoPath) {
  const log = run('git log --all --numstat --format="%H" -- . 2>/dev/null | head -50000', repoPath);
  if (!log) return {};
  const churn = {};
  for (const line of log.split('\n')) {
    const match = line.match(/^(\d+)\s+(\d+)\s+(.+)$/);
    if (match) {
      const file = match[3];
      churn[file] = (churn[file] || 0) + 1;
    }
  }
  return churn;
}

function getLastAuthors(repoPath) {
  const log = run('git log --all --format="%H %an" --name-only -- . 2>/dev/null | head -20000', repoPath);
  if (!log) return {};
  const authors = {};
  let currentAuthor = '';
  for (const line of log.split('\n')) {
    const authorMatch = line.match(/^[a-f0-9]{40}\s+(.+)$/);
    if (authorMatch) {
      currentAuthor = authorMatch[1];
    } else if (line.trim() && currentAuthor) {
      if (!authors[line.trim()]) authors[line.trim()] = currentAuthor;
    }
  }
  return authors;
}

function getBuggyFiles(repoPath) {
  const log = run('git log --all --oneline --name-only --grep="fix\\|bug\\|error\\|crash\\|patch\\|hotfix" -- . 2>/dev/null | head -10000', repoPath);
  if (!log) return {};
  const bugs = {};
  for (const line of log.split('\n')) {
    if (line && !line.match(/^[a-f0-9]+\s/)) {
      bugs[line.trim()] = (bugs[line.trim()] || 0) + 1;
    }
  }
  return bugs;
}

function getRecentActivity(repoPath, days = 7) {
  const log = run(`git log --all --since="${days} days ago" --format="%an|%aI" --name-only -- . 2>/dev/null | head -5000`, repoPath);
  if (!log) return [];
  const activity = [];
  let author = '', time = '';
  for (const line of log.split('\n')) {
    const metaMatch = line.match(/^(.+)\|(.+)$/);
    if (metaMatch) {
      author = metaMatch[1];
      time = metaMatch[2];
    } else if (line.trim() && author) {
      activity.push({ file: line.trim(), author, time, type: 'edit' });
    }
  }
  return activity.slice(0, 100);
}

function getContributors(repoPath) {
  const log = run('git shortlog -sn --all -- . 2>/dev/null | head -20', repoPath);
  if (!log) return [];
  return log.split('\n').filter(Boolean).map(line => {
    const match = line.trim().match(/^(\d+)\s+(.+)$/);
    return match ? { name: match[2], commits: parseInt(match[1]) } : null;
  }).filter(Boolean);
}

function getCommitCount(repoPath) {
  const result = run('git rev-list --all --count 2>/dev/null', repoPath);
  return parseInt(result) || 0;
}

// --- File Tree ---

function buildTree(dirPath, repoPath, churn, authors, bugs, relPath = '') {
  const entries = [];
  let items;
  try { items = fs.readdirSync(dirPath); } catch { return null; }

  for (const item of items) {
    if (SKIP_DIRS.has(item) || SKIP_FILES.has(item) || item.startsWith('.')) continue;

    const fullPath = path.join(dirPath, item);
    const rel = relPath ? `${relPath}/${item}` : item;
    let stat;
    try { stat = fs.statSync(fullPath); } catch { continue; }

    if (stat.isDirectory()) {
      const children = buildTree(fullPath, repoPath, churn, authors, bugs, rel);
      if (children && children.length > 0) {
        entries.push({ name: item, type: 'directory', path: rel, children });
      }
    } else if (stat.isFile()) {
      const lang = getLanguage(item);
      if (lang === 'other' && !item.match(/\.[a-z]+$/i)) continue; // skip extensionless

      const loc = countLines(fullPath);
      if (loc === 0) continue;

      const isTest = /\.(test|spec|e2e)\./i.test(item) || /^test/i.test(item) || rel.includes('__tests__');

      entries.push({
        name: item,
        type: 'file',
        path: rel,
        metrics: {
          loc,
          size: stat.size,
          language: lang,
          color: getColor(lang),
          churn: churn[rel] || 0,
          bug_count: bugs[rel] || 0,
          last_author: authors[rel] || 'unknown',
          is_test: isTest,
          age_days: Math.floor((Date.now() - stat.mtimeMs) / 86400000)
        }
      });
    }
  }

  return entries;
}

// --- Dependencies ---

function extractDependencies(repoPath, tree, basePath = '') {
  const deps = [];
  const files = flattenFiles(tree);
  const fileSet = new Set(files.map(f => f.path));

  for (const file of files) {
    if (!['javascript', 'typescript', 'python', 'go', 'rust'].includes(file.metrics?.language)) continue;

    const fullPath = path.join(repoPath, file.path);
    let content;
    try { content = fs.readFileSync(fullPath, 'utf8').slice(0, 5000); } catch { continue; }

    // JS/TS imports
    const importMatches = content.matchAll(/(?:import|require)\s*\(?['"]([^'"]+)['"]\)?/g);
    for (const m of importMatches) {
      const importPath = m[1];
      if (!importPath.startsWith('.')) continue; // skip node_modules
      const dir = path.dirname(file.path);
      let resolved = path.normalize(path.join(dir, importPath)).replace(/\\/g, '/');
      // Try with extensions
      for (const ext of ['', '.ts', '.tsx', '.js', '.jsx', '/index.ts', '/index.js']) {
        if (fileSet.has(resolved + ext)) {
          deps.push({ from: file.path, to: resolved + ext });
          break;
        }
      }
    }

    // Python imports
    if (file.metrics?.language === 'python') {
      const pyImports = content.matchAll(/from\s+(\.\S+)\s+import/g);
      for (const m of pyImports) {
        const modPath = m[1].replace(/\./g, '/').slice(1) + '.py';
        if (fileSet.has(modPath)) deps.push({ from: file.path, to: modPath });
      }
    }
  }

  return deps;
}

function flattenFiles(nodes, result = []) {
  for (const node of nodes) {
    if (node.type === 'file') result.push(node);
    else if (node.children) flattenFiles(node.children, result);
  }
  return result;
}

// --- Main ---

function analyze(repoPath) {
  const absPath = path.resolve(repoPath);
  const name = path.basename(absPath);

  console.error(`Analyzing ${name}...`);

  console.error('  Parsing git history...');
  const churn = getFileChurn(absPath);
  const authors = getLastAuthors(absPath);
  const bugs = getBuggyFiles(absPath);
  const activity = getRecentActivity(absPath);
  const contributors = getContributors(absPath);
  const commits = getCommitCount(absPath);

  console.error('  Scanning file tree...');
  const tree = buildTree(absPath, absPath, churn, authors, bugs) || [];
  const allFiles = flattenFiles(tree);

  console.error('  Extracting dependencies...');
  const deps = extractDependencies(absPath, tree);

  // Stats
  const totalLoc = allFiles.reduce((s, f) => s + (f.metrics?.loc || 0), 0);
  const languages = {};
  for (const f of allFiles) {
    const lang = f.metrics?.language || 'other';
    languages[lang] = (languages[lang] || 0) + 1;
  }

  const data = {
    name,
    generated: new Date().toISOString(),
    stats: {
      files: allFiles.length,
      directories: tree.length,
      loc: totalLoc,
      commits,
      contributors: contributors.length,
      languages,
      dependency_edges: deps.length
    },
    contributors,
    tree,
    dependencies: deps.slice(0, 500), // Cap for performance
    recent_activity: activity,
    agents: []
  };

  console.error(`  Done! ${allFiles.length} files, ${totalLoc} LOC, ${deps.length} dependencies`);
  return data;
}

if (require.main === module) {
  const repoPath = process.argv[2] || '.';
  const outputPath = process.argv[3] || path.join(__dirname, '..', 'app', 'city-data.json');

  const data = analyze(repoPath);
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, JSON.stringify(data, null, 2));
  console.error(`Output: ${outputPath}`);
}

module.exports = { analyze };
