#!/usr/bin/env node
// A local server that stands in for employers' job feeds, so the postings
// pipeline can be run with no request leaving this machine: by the unit
// checks, by tests/api/postings.sh, and over boards saved earlier.
//
//   node tests/api/postings/feeds.mjs --dir <folder> [--port 5999]
//
// The runner is pointed at it with `--feeds http://127.0.0.1:<port>`: a
// request for https://<host>/<path> arrives here as /<host>/<path>. It answers
// from the folder, in each system's own shape:
//   robots/<host>.txt                         the host's robots file (404 when there is none)
//   greenhouse/<token>.json, lever/<name>.json, ashby/<name>.json     the board, as the system answers
//   jibe/<host>.json                          { jobs: [...] }, served a page of 100 at a time
//   oracle/<host>/list.json                   the requisitions, served 100 at a time; detail-<id>.json each
//   workday/<tenant>/list.json                { jobPostings, facets }, served 20 at a time; detail/<path>.json each
//   successfactors/<host>.xml                 the feed
//   refuse/<host>                             a file holding 403, 429, challenge or reset: every request to that host gets it
// `requests` (GET /_requests) is every request it has answered, for a test to count.
import { createServer } from 'node:http';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const CHALLENGE = '<!DOCTYPE html><html><head><title>Just a moment...</title></head><body><div id="cf-chl-widget">Checking your browser</div></body></html>';

export function feedServer(dir) {
  const requests = [];
  const file = (...parts) => path.join(dir, ...parts);
  const json = (res, status, body) => {
    res.writeHead(status, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(body));
  };
  const send = (res, name, type = 'application/json') => {
    if (!existsSync(name)) return json(res, 404, { error: 'not found' });
    res.writeHead(200, { 'Content-Type': type });
    res.end(readFileSync(name));
  };

  const server = createServer((req, res) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => {
      const url = new URL(req.url, 'http://local');
      if (url.pathname === '/_requests') return json(res, 200, requests);
      const [, host, ...rest] = url.pathname.split('/');
      const route = `/${rest.join('/')}`;
      const body = chunks.length > 0 ? Buffer.concat(chunks).toString('utf8') : '';
      requests.push({ method: req.method, host, path: route, query: url.search, agent: req.headers['user-agent'] ?? '', body });

      // A host told to refuse does so to everything, its robots file included.
      const refusal = existsSync(file('refuse', host)) ? readFileSync(file('refuse', host), 'utf8').trim() : null;
      if (refusal === 'reset') return req.socket.destroy();
      if (refusal === 'challenge') {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        return res.end(CHALLENGE);
      }
      if (refusal) return json(res, Number(refusal), { error: 'refused' });

      if (route === '/robots.txt') return send(res, file('robots', `${host}.txt`), 'text/plain');

      let found;
      if ((found = /^\/v1\/boards\/([^/]+)\/jobs$/.exec(route))) return send(res, file('greenhouse', `${found[1]}.json`));
      if ((found = /^\/v0\/postings\/([^/]+)$/.exec(route))) return send(res, file('lever', `${found[1]}.json`));
      if ((found = /^\/posting-api\/job-board\/([^/]+)$/.exec(route))) return send(res, file('ashby', `${found[1]}.json`));
      if (route === '/api/jobs') {
        const name = file('jibe', `${host}.json`);
        if (!existsSync(name)) return json(res, 404, { error: 'not found' });
        const all = JSON.parse(readFileSync(name, 'utf8')).jobs;
        const page = Number(url.searchParams.get('page') ?? 1);
        const limit = Number(url.searchParams.get('limit') ?? 100);
        return json(res, 200, { jobs: all.slice((page - 1) * limit, page * limit), totalCount: all.length, count: all.length });
      }
      if (route.endsWith('/recruitingCEJobRequisitions')) {
        const name = file('oracle', host, 'list.json');
        if (!existsSync(name)) return json(res, 404, { error: 'not found' });
        const all = JSON.parse(readFileSync(name, 'utf8'));
        const finder = url.searchParams.get('finder') ?? '';
        const offset = Number(/offset=(\d+)/.exec(finder)?.[1] ?? 0);
        const limit = Number(/limit=(\d+)/.exec(finder)?.[1] ?? 100);
        return json(res, 200, { items: [{ TotalJobsCount: all.length, Offset: offset, Limit: limit, requisitionList: all.slice(offset, offset + limit) }], count: 1, hasMore: false });
      }
      if (route.endsWith('/recruitingCEJobRequisitionDetails')) {
        const id = /Id="?([^",;]+)"?/.exec(url.searchParams.get('finder') ?? '')?.[1] ?? '';
        return send(res, file('oracle', host, `detail-${id.replace(/[^A-Za-z0-9_-]/g, '')}.json`));
      }
      if ((found = /^\/wday\/cxs\/([^/]+)\/([^/]+)\/jobs$/.exec(route)) && req.method === 'POST') {
        const name = file('workday', found[1], 'list.json');
        if (!existsSync(name)) return json(res, 422, { errorCode: 'HTTP_422' });
        const board = JSON.parse(readFileSync(name, 'utf8'));
        const asked = JSON.parse(body || '{}');
        // With a filter applied, the postings marked as elsewhere are left out.
        const narrowed = Object.keys(asked.appliedFacets ?? {}).length > 0;
        const all = board.jobPostings.filter((posting) => !narrowed || posting.elsewhere !== true);
        const offset = Number(asked.offset ?? 0);
        return json(res, 200, { total: offset === 0 ? all.length : 0, jobPostings: all.slice(offset, offset + Number(asked.limit ?? 20)), facets: offset === 0 ? board.facets ?? [] : [] });
      }
      if ((found = /^\/wday\/cxs\/([^/]+)\/([^/]+)(\/job\/.+)$/.exec(route))) {
        return send(res, file('workday', found[1], 'detail', `${found[3].replace(/[^A-Za-z0-9]+/g, '_')}.json`));
      }
      if (existsSync(file('successfactors', `${host}.xml`))) return send(res, file('successfactors', `${host}.xml`), 'application/rss+xml');
      return json(res, 404, { error: 'not found' });
    });
  });

  return {
    requests,
    /** Starts listening; resolves to the address the runner's `--feeds` takes. */
    listen: (port = 0) => new Promise((resolve) => server.listen(port, '127.0.0.1', () => resolve(`http://127.0.0.1:${server.address().port}`))),
    close: () => new Promise((resolve) => server.close(resolve)),
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const arg = (name, fallback) => {
    const at = process.argv.indexOf(`--${name}`);
    return at > 0 ? process.argv[at + 1] : fallback;
  };
  const dir = arg('dir');
  if (!dir) {
    console.error('usage: node tests/api/postings/feeds.mjs --dir <folder> [--port 5999]');
    process.exit(2);
  }
  const address = await feedServer(path.resolve(dir)).listen(Number(arg('port', 5999)));
  console.log(`feeds: standing in for the feeds at ${address}, from ${path.resolve(dir)}`);
}
