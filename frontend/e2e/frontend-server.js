'use strict';

const fs = require('fs');
const http = require('http');
const path = require('path');

const buildRoot = path.resolve(__dirname, '..', 'build');
const contentTypes = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
};

const server = http.createServer((req, res) => {
  const pathname = decodeURIComponent(new URL(req.url, 'http://127.0.0.1').pathname);
  const candidate = path.resolve(buildRoot, `.${pathname}`);
  const safeCandidate = candidate.startsWith(`${buildRoot}${path.sep}`) ? candidate : '';
  const filePath = safeCandidate && fs.existsSync(safeCandidate) && fs.statSync(safeCandidate).isFile()
    ? safeCandidate
    : path.join(buildRoot, 'index.html');
  res.writeHead(200, {
    'Content-Type': contentTypes[path.extname(filePath)] || 'application/octet-stream',
    'Cache-Control': 'no-store',
  });
  fs.createReadStream(filePath).pipe(res);
});

module.exports = { server };

if (require.main === module) server.listen(3100, '127.0.0.1');
