// Minimal static server for local harness testing. Not part of the widget.
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const PORT = Number(process.env.PORT || 4400);

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png'
};

http
  .createServer((req, res) => {
    let urlPath = decodeURIComponent(req.url.split('?')[0]);
    // The widget asks for images/ next to widget.html; the harness page sits in
    // test/, so serve those from the build.
    if (urlPath.indexOf('/test/images/') === 0) urlPath = '/dist' + urlPath.slice('/test'.length);
    if (urlPath === '/') { res.writeHead(302, { Location: '/test/frame.html' + (req.url.indexOf('?') !== -1 ? req.url.slice(req.url.indexOf('?')) : '') }).end(); return; }
    // /baseline/... serves an older build (BASELINE_DIR) for side-by-side comparison.
    const base = process.env.BASELINE_DIR && urlPath.indexOf('/baseline/') === 0 ? path.resolve(process.env.BASELINE_DIR) : ROOT;
    const rel = base === ROOT ? urlPath : urlPath.slice('/baseline'.length);
    const target = path.normalize(path.join(base, rel));
    if (!target.startsWith(base)) {
      res.writeHead(403).end('forbidden');
      return;
    }
    fs.readFile(target, (err, buf) => {
      if (err) {
        res.writeHead(404).end('not found: ' + urlPath);
        return;
      }
      res.writeHead(200, {
        'Content-Type': TYPES[path.extname(target)] || 'application/octet-stream',
        'Cache-Control': 'no-store'
      });
      res.end(buf);
    });
  })
  .listen(PORT, () => console.log('harness on http://localhost:' + PORT + '/test/frame.html'));
