import express from 'express';
import { randomUUID, timingSafeEqual } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync, renameSync, realpathSync, readdirSync, statSync } from 'node:fs';
import { resolve, sep, basename } from 'node:path';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import { z } from 'zod';

const text = data => ({ content: [{ type: 'text', text: JSON.stringify(data) }] });
export function tokenAuthenticator(token) {
  if (!token || token.length < 32) throw new Error('Use a random token of at least 32 characters.');
  return async req => {
    const value = req.headers.authorization?.replace(/^Bearer /, '') ?? '';
    if (Buffer.byteLength(value) !== Buffer.byteLength(token) || !timingSafeEqual(Buffer.from(value), Buffer.from(token))) throw new Error('Invalid token');
    return 'owner';
  };
}
export function oauthAuthenticator({ issuer, audience, subjects, verificationKey }) {
  if (!issuer.startsWith('https://') || !audience?.startsWith('https://') || !subjects.length) throw new Error('HTTPS issuer, audience, and explicit authorized subject allowlist required.');
  const keys = verificationKey ?? createRemoteJWKSet(new URL('.well-known/jwks.json', issuer.endsWith('/') ? issuer : issuer + '/'));
  return async req => {
    const token = req.headers.authorization?.match(/^Bearer (.+)$/)?.[1];
    if (!token) throw new Error('Missing token');
    const { payload } = await jwtVerify(token, keys, { issuer, audience, algorithms: ['RS256'] });
    if (!payload.exp || !subjects.includes(payload.sub) || !String(payload.scope ?? '').split(' ').includes('flow')) throw new Error('Subject or scope denied');
    return payload.sub;
  };
}

export function createGateway({ core, authenticate, publicUrl, issuer, stateDir, outputDir }) {
  const app = express();
  const sessions = new Map();
  const jobs = new Map();
  let chain = Promise.resolve();
  mkdirSync(stateDir, { recursive: true, mode: 0o700 });
  const ledger = resolve(stateDir, 'jobs.json');
  try {
    for (const job of JSON.parse(readFileSync(ledger, 'utf8'))) {
      if (['running', 'queued'].includes(job.status)) Object.assign(job, { status: 'interrupted', error: 'Process restarted. Check Flow assets before resubmitting; never automatically retry paid generation.' });
      jobs.set(job.id, job);
    }
  } catch (err) { if (err.code !== 'ENOENT') throw err; }
  function persist() {
    writeFileSync(ledger + '.tmp', JSON.stringify([...jobs.values()]), { mode: 0o600 });
    renameSync(ledger + '.tmp', ledger);
  }
  persist();
  const enqueue = (owner, kind, work) => {
    if (jobs.size >= 10000) throw new Error('Job ledger full. Archive completed jobs before submitting more.');
    const job = { id: randomUUID(), owner, kind, status: 'queued', created: new Date().toISOString() };
    jobs.set(job.id, job); persist();
    chain = chain.then(async () => {
      job.status = 'running'; persist();
      try {
        job.result = await work(); job.status = 'done';
        if (job.result?.jobs?.some(j => ['failed', 'cancelled'].includes(j.status))) {
          job.status = 'failed'; job.error = 'One or more upstream generations failed or were cancelled; inspect the result and Flow assets before resubmitting.';
        }
      }
      catch (e) { job.status = 'failed'; job.error = e.message; }
      persist();
    });
    return { job_id: job.id, status: job.status, note: 'Poll flow_job_status. Do not resubmit if a request times out.' };
  };
  app.disable('x-powered-by');
  app.use((req, res, next) => {
    res.set('Cache-Control', 'no-store');
    const allowed = new Set(['127.0.0.1', 'localhost', ...(publicUrl ? [new URL(publicUrl).hostname] : [])]);
    if (!allowed.has(req.hostname)) return res.status(403).json({ error: 'Host denied' });
    if (req.headers.origin && (!publicUrl || req.headers.origin !== new URL(publicUrl).origin)) return res.status(403).json({ error: 'Origin denied' });
    next();
  });
  if (issuer && publicUrl) {
    const metadata = { resource: publicUrl, authorization_servers: [issuer], scopes_supported: ['flow'], bearer_methods_supported: ['header'] };
    app.get(['/.well-known/oauth-protected-resource', '/.well-known/oauth-protected-resource/mcp'], (_req, res) => res.json(metadata));
  }
  app.get('/health', (_req, res) => res.json({ service: 'flow-chatgpt-gateway', status: 'running', browser: 'not checked' }));
  app.use(async (req, res, next) => {
    try { req.owner = await authenticate(req); next(); }
    catch {
      res.set('WWW-Authenticate', issuer && publicUrl ? `Bearer resource_metadata="${new URL('/.well-known/oauth-protected-resource/mcp', publicUrl)}", scope="flow"` : 'Bearer');
      res.status(401).json({ error: 'Authentication required. Connect using the configured OAuth provider.' });
    }
  });
  app.use(express.json({ limit: '256kb' }));
  app.get('/assets/:project/:file', (req, res) => {
    try {
      const root = realpathSync(outputDir);
      const file = realpathSync(resolve(root, req.params.project, req.params.file));
      if (!file.startsWith(root + sep) || !/\.(mp4|png|jpg|jpeg|webp|webm)$/i.test(file)) return res.sendStatus(404);
      res.download(file, basename(file));
    } catch { res.sendStatus(404); }
  });
  const scene = z.object({ prompt: z.string().min(1).max(4000), type: z.enum(['image', 'video']), model: z.string().max(100).optional(), aspect_ratio: z.enum(['16:9', '9:16', '1:1', '4:3', '3:4']).optional(), max_credits: z.number().int().min(0).max(1000), variants: z.number().int().min(1).max(4).default(1), retries: z.literal(0).default(0) });
  function serverFor(owner) {
    const server = new McpServer({ name: 'flow-chatgpt-gateway', version: '0.1.0' });
    const tool = (name, description, inputSchema, readOnly, fn) => server.registerTool(name, {
      description, inputSchema, annotations: { readOnlyHint: readOnly, destructiveHint: !readOnly, openWorldHint: true },
      ...(issuer ? { securitySchemes: [{ type: 'oauth2', scopes: ['flow'] }] } : {})
    }, async args => {
      try { return text(await fn(args)); }
      catch (e) { return { ...text({ error: e.message, action: 'Check Chrome, Google login, and an open Flow project. Never retry a paid submission without checking job status and assets.' }), isError: true }; }
    });
    tool('flow_status', 'Check browser connection, Google login, open project and credit balance. No generation.', { detailed: z.boolean().default(true) }, true, a => core.status(a));
    tool('flow_assets', 'List media in the currently open Flow project. No project enumeration is implemented upstream.', { kind: z.enum(['image', 'video', 'scene']).optional() }, true, a => enqueue(owner, 'assets', () => core.assets(a)));
    tool('flow_characters', 'List reusable characters in the currently open project; verified upstream feature.', {}, true, () => enqueue(owner, 'characters', () => core.characters()));
    tool('flow_generate', 'Generate images or videos. MAY SPEND GOOGLE FLOW CREDITS. Ask the user for explicit approval of these exact prompts and per-scene credit caps before setting confirmed=true. Returns a persistent job ID. Never retry automatically.', {
      project: z.string().regex(/^[A-Za-z0-9_-]{1,80}$/), scenes: z.array(scene).min(1).max(10), confirmed: z.literal(true).describe('Set only after the user explicitly approves generation and the stated credit caps.')
    }, false, ({ confirmed, ...a }) => enqueue(owner, 'generation', async () => {
      const queued = await core.generate(a);
      const ids = queued.jobs?.map(j => j.id);
      if (!ids?.length) throw new Error('Upstream returned no job IDs; inspect Flow before resubmitting.');
      for (;;) {
        const result = await core.wait({ job_ids: ids, timeout_seconds: 5 });
        if (result.finished) return result;
      }
    }));
    tool('flow_download', 'Download existing media to the host; original quality only, no regeneration. Poll the returned job ID, then flow_outputs for authenticated HTTPS download links.', {
      project: z.string().regex(/^[A-Za-z0-9_-]{1,80}$/), assets: z.array(z.string().min(1).max(200)).min(1).max(30)
    }, false, a => enqueue(owner, 'download', () => core.download({ ...a, quality: 'original' })));
    tool('flow_job_status', 'Poll a persistent gateway job. Interrupted jobs are never automatically replayed after restart.', { job_id: z.string().uuid() }, true, a => {
      const job = jobs.get(a.job_id);
      if (!job || job.owner !== owner) throw new Error('Unknown job ID');
      const { owner: ignored, ...view } = job; return view;
    });
    tool('flow_outputs', 'List downloaded files. Links require the same Bearer authentication; do not put tokens in URLs.', { project: z.string().regex(/^[A-Za-z0-9_-]{1,80}$/) }, true, a => {
      const root = realpathSync(outputDir);
      const dir = realpathSync(resolve(root, a.project));
      if (!dir.startsWith(root + sep)) throw new Error('Output path denied');
      return readdirSync(dir).filter(f => /\.(mp4|png|jpg|jpeg|webp|webm)$/i.test(f)).map(f => {
        const file = realpathSync(resolve(dir, f));
        if (!file.startsWith(root + sep) || !statSync(file).isFile()) throw new Error('Output symlink denied');
        return { name: f, ...(publicUrl ? { url: new URL(`/assets/${encodeURIComponent(a.project)}/${encodeURIComponent(f)}`, publicUrl).href } : {}) };
      });
    });
    return server;
  }
  app.all('/mcp', async (req, res) => {
    try {
      const id = req.headers['mcp-session-id'];
      let session = id && sessions.get(id);
      if (id && (!session || session.owner !== req.owner)) return res.status(404).json({ error: 'Session expired. Initialize a new MCP session.' });
      if (!session) {
        if (req.method !== 'POST' || !isInitializeRequest(req.body)) return res.status(400).json({ error: 'Initialize MCP first.' });
        if (sessions.size >= 100) return res.status(503).json({ error: 'Session limit reached' });
        const server = serverFor(req.owner);
        const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: randomUUID, enableJsonResponse: true,
          onsessioninitialized: id => sessions.set(id, session) });
        session = { owner: req.owner, server, transport, touched: Date.now() };
        transport.onclose = () => sessions.delete(transport.sessionId);
        await server.connect(transport);
      }
      session.touched = Date.now();
      await session.transport.handleRequest(req, res, req.body);
    } catch { if (!res.headersSent) res.status(500).json({ error: 'MCP transport failure. Initialize a new session.' }); }
  });
  const timer = setInterval(() => {
    for (const s of sessions.values()) if (Date.now() - s.touched > 30 * 60 * 1000) void s.server.close();
  }, 60000).unref();
  return { app, jobs, close: async () => { clearInterval(timer); await Promise.all([...sessions.values()].map(s => s.server.close())); } };
}
