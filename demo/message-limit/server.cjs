// Local-only demo proxy. The API key is supplied by the person testing the page.
const http = require('node:http');
const https = require('node:https');
const path = require('node:path');
const fs = require('node:fs');

const port = 5185;
const assistantId = 'gold_dog_venezuela';
const demoDir = __dirname;
const esbuild = require(path.resolve(__dirname, '../../../frontend/suntropy-ai-frontend/node_modules/esbuild'));
const allowedHosts = new Set([`127.0.0.1:${port}`, `localhost:${port}`]);
const remoteHosts = { prod: 'api.devic.ai', dev: 'api-dev.devic.ai' };

async function start() {
  const build = await esbuild.build({
    entryPoints: [path.join(demoDir, 'app.jsx')],
    bundle: true,
    write: false,
    outfile: '/app.js',
    format: 'esm',
    platform: 'browser',
    nodePaths: [path.resolve(__dirname, '../../node_modules')],
    define: { 'process.env.NODE_ENV': '"development"' },
  });
  const assets = new Map(build.outputFiles.map((file) => [`/${path.basename(file.path)}`, file.contents]));

  http.createServer((req, res) => {
    const host = req.headers.host;
    if (!allowedHosts.has(host) ||
        (req.headers.origin && req.headers.origin !== `http://${host}`) ||
        req.headers['sec-fetch-site'] === 'cross-site') {
      res.writeHead(403).end();
      return;
    }
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Referrer-Policy', 'no-referrer');

    const url = new URL(req.url, `http://${host}`);
    if (url.pathname.startsWith('/api/')) {
      const match = url.pathname.match(/^\/api\/(prod|dev)(\/api\/v1\/assistants\/gold_dog_venezuela(?:\/.*)?)$/);
      const auth = req.headers.authorization;
      if (!match || !['GET', 'POST'].includes(req.method) || !auth?.startsWith('Bearer devic-')) {
        res.writeHead(403).end();
        return;
      }
      const upstream = https.request({
        hostname: remoteHosts[match[1]],
        path: `${match[2]}${url.search}`,
        method: req.method,
        headers: {
          authorization: auth,
          accept: req.headers.accept || 'application/json',
          ...(req.headers['content-type'] ? { 'content-type': req.headers['content-type'] } : {}),
        },
      }, (response) => {
        res.writeHead(response.statusCode, {
          'content-type': response.headers['content-type'] || 'application/json',
          'cache-control': 'no-store',
        });
        response.pipe(res);
      });
      upstream.on('error', () => {
        if (!res.headersSent) res.writeHead(502);
        res.end('API unavailable');
      });
      res.on('close', () => upstream.destroy());
      req.pipe(upstream);
      return;
    }

    if (url.pathname === '/') {
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.end(fs.readFileSync(path.join(demoDir, 'index.html')));
    } else if (assets.has(url.pathname)) {
      res.setHeader('Content-Type', url.pathname.endsWith('.css') ? 'text/css' : 'text/javascript');
      res.end(assets.get(url.pathname));
    } else {
      res.writeHead(404).end();
    }
  }).listen(port, '127.0.0.1', () => {
    process.stdout.write(`Devic UI message-limit demo: http://127.0.0.1:${port}\n`);
  });
}

start().catch((error) => {
  process.stderr.write(`Could not start demo: ${error.message}\n`);
  process.exitCode = 1;
});
