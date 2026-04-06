#!/usr/bin/env node
const http = require('http');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const APP_DIR = path.join(__dirname, '..', 'app');
const PORT = process.argv[2] || 3333;

const MIME = {
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.mjs': 'application/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon'
};

const server = http.createServer((req, res) => {
  let filePath = path.join(APP_DIR, req.url === '/' ? 'index.html' : req.url);

  // Security: prevent directory traversal
  if (!filePath.startsWith(APP_DIR)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  const ext = path.extname(filePath);
  const contentType = MIME[ext] || 'application/octet-stream';

  fs.readFile(filePath, (err, data) => {
    if (err) {
      if (err.code === 'ENOENT') {
        res.writeHead(404);
        res.end('Not found');
      } else {
        res.writeHead(500);
        res.end('Server error');
      }
      return;
    }

    res.writeHead(200, {
      'Content-Type': contentType,
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'no-cache'
    });
    res.end(data);
  });
});

// Validate port
const port = parseInt(PORT, 10);
if (isNaN(port) || port < 0 || port > 65535) {
  console.error(`\n  Error: Invalid port "${PORT}". Must be a number between 0 and 65535.\n`);
  process.exit(1);
}

// Check that city-data.json exists before starting the server
const dataFile = path.join(APP_DIR, 'city-data.json');
if (!fs.existsSync(dataFile)) {
  console.error('\n  Error: city-data.json not found. Run the analyzer first:');
  console.error('    node scripts/analyze.js <project-path>\n');
  process.exit(1);
}

server.listen(port, () => {
  const url = `http://localhost:${port}`;
  console.log(`\n  Claude City running at ${url}\n`);

  // Open in browser
  try {
    const platform = process.platform;
    if (platform === 'darwin') execSync(`open "${url}"`);
    else if (platform === 'linux') execSync(`xdg-open "${url}" 2>/dev/null || true`);
    else if (platform === 'win32') execSync(`start "${url}"`);
  } catch {}
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`\n  Error: Port ${port} is already in use.`);
    console.error(`  Try a different port: node scripts/server.js <port>\n`);
  } else if (err.code === 'EACCES') {
    console.error(`\n  Error: Permission denied for port ${port}.`);
    console.error(`  Try a port above 1024 or run with elevated permissions.\n`);
  } else {
    console.error(`\n  Server error: ${err.message}\n`);
  }
  process.exit(1);
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n  City shutting down...\n');
  server.close();
  process.exit(0);
});

process.on('SIGTERM', () => {
  server.close();
  process.exit(0);
});
