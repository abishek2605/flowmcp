import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { createGateway, tokenAuthenticator } from '../src/gateway.mjs';

test('MCP transport, authentication, tools, jobs, downloads, and restart recovery', async t => {
  const dir = mkdtempSync(join(tmpdir(), 'flow-test-'));
  const stateDir = join(dir, 'state'); const outputDir = join(dir, 'outputs');
  mkdirSync(join(outputDir, 'demo'), { recursive: true });
  writeFileSync(join(outputDir, 'demo', 'image.png'), 'image-test');
  writeFileSync(join(dir, 'secret.png'), 'secret');
  let symlinkSupported = true;
  try { symlinkSync(join(dir, 'secret.png'), join(outputDir, 'demo', 'escape.png')); }
  catch (e) {
    if (process.platform !== 'win32' || e.code !== 'EPERM') throw e;
    symlinkSupported = false;
    t.diagnostic('Symlink escape subcheck unrun: Windows requires Developer Mode or symlink privileges. Other transport and authentication checks still run.');
  }
  let submissions = 0;
  const core = { status: async () => ({ signed_in: false, test_backend: true }), assets: async () => [], characters: async () => [],
    download: async () => ({ files: ['image.png'] }), generate: async () => { submissions++; return { jobs: [{ id: 'upstream-1' }] }; },
    wait: async () => ({ finished: true, jobs: [{ id: 'upstream-1', status: 'done' }] }) };
  const token = 'test-only-'.repeat(8);
  const gateway = createGateway({ core, authenticate: tokenAuthenticator(token), stateDir, outputDir });
  const listener = gateway.app.listen(0, '127.0.0.1');
  await new Promise(r => listener.once('listening', r));
  const url = new URL(`http://127.0.0.1:${listener.address().port}/mcp`);
  const transport = new StreamableHTTPClientTransport(url, { requestInit: { headers: { Authorization: `Bearer ${token}` } } });
  const client = new Client({ name: 'test', version: '1' });
  try {
    assert.equal((await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })).status, 401);
    assert.equal((await fetch(url, { headers: { Authorization: 'Bearer invalid' } })).status, 401);
    assert.equal((await fetch(url, { headers: { Authorization: `Bearer ${token}`, Origin: 'https://evil.example' } })).status, 403);
    await client.connect(transport);
    assert.ok(transport.sessionId);
    const listed = await client.listTools();
    assert.deepEqual(listed.tools.map(t => t.name).sort(), ['flow_status', 'flow_assets', 'flow_characters', 'flow_generate', 'flow_download', 'flow_job_status', 'flow_outputs'].sort());
    const status = await client.callTool({ name: 'flow_status', arguments: {} });
    assert.equal(JSON.parse(status.content[0].text).test_backend, true);
    const args = { project: 'demo', scenes: [{ prompt: 'test', type: 'video', max_credits: 5 }] };
    const denied = await client.callTool({ name: 'flow_generate', arguments: args });
    assert.equal(denied.isError, true); assert.equal(submissions, 0);
    const queued = JSON.parse((await client.callTool({ name: 'flow_generate', arguments: { ...args, confirmed: true } })).content[0].text);
    let job;
    for (let i = 0; i < 20; i++) {
      job = JSON.parse((await client.callTool({ name: 'flow_job_status', arguments: { job_id: queued.job_id } })).content[0].text);
      if (job.status === 'done') break;
      await new Promise(r => setTimeout(r, 10));
    }
    assert.equal(job.status, 'done'); assert.equal(submissions, 1);
    assert.equal((await fetch(new URL('/assets/demo/image.png', url))).status, 401);
    assert.equal(await (await fetch(new URL('/assets/demo/image.png', url), { headers: { Authorization: `Bearer ${token}` } })).text(), 'image-test');
    if (symlinkSupported) assert.equal((await fetch(new URL('/assets/demo/escape.png', url), { headers: { Authorization: `Bearer ${token}` } })).status, 404);
    const session = transport.sessionId;
    await transport.terminateSession();
    await client.close();
    assert.equal((await fetch(url, { headers: { Authorization: `Bearer ${token}`, 'mcp-session-id': session } })).status, 404);
    const history = JSON.parse(readFileSync(join(stateDir, 'jobs.json'), 'utf8'));
    history.push({ id: 'unfinished', owner: 'owner', status: 'running' });
    writeFileSync(join(stateDir, 'jobs.json'), JSON.stringify(history));
    const restarted = createGateway({ core, authenticate: tokenAuthenticator(token), stateDir, outputDir });
    assert.equal(restarted.jobs.get('unfinished').status, 'interrupted');
    assert.equal(submissions, 1);
    await restarted.close();
  } finally { await client.close(); await gateway.close(); await new Promise(r => listener.close(r)); }
});
