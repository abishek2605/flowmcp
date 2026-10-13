import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:net';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
const dir = mkdtempSync(join(tmpdir(), 'flow-runtime-'));
const token = randomBytes(32).toString('hex');
const tokenFile = join(dir, 'token');
writeFileSync(tokenFile, token, { mode: 0o600 });
const reservation = createServer();
await new Promise(r => reservation.listen(0, '127.0.0.1', r));
const port = reservation.address().port;
await new Promise(r => reservation.close(r));
const env = { ...process.env, FLOW_TOKEN_FILE: tokenFile, FLOW_GATEWAY_STATE: dir, FLOW_MCP_OUTPUT: join(dir, 'outputs'), FLOW_MCP_HOME: join(dir, 'browser'), PORT: String(port) };
delete env.FLOW_PUBLIC_URL; delete env.FLOW_OAUTH_ISSUER;
const child = spawn(process.execPath, ['src/main.mjs'], { cwd: '/workspace/flowmcp', env, stdio: ['ignore', 'pipe', 'pipe'] });
let errors = ''; child.stderr.on('data', c => errors += c);
const client = new Client({ name: 'runtime-smoke', version: '1' });
try {
  await Promise.race([
    new Promise((ok, fail) => { child.stdout.once('data', ok); child.once('exit', code => fail(new Error(`Gateway exited ${code}: ${errors}`))); }),
    new Promise((_, fail) => setTimeout(() => fail(new Error('Startup timeout')), 10000).unref())
  ]);
  const url = new URL(`http://127.0.0.1:${port}/mcp`);
  const transport = new StreamableHTTPClientTransport(url, { requestInit: { headers: { Authorization: `Bearer ${token}` } } });
  await client.connect(transport);
  const tools = await client.listTools();
  if (tools.tools.length !== 7) throw new Error('Unexpected tool count');
  const status = await client.callTool({ name: 'flow_status', arguments: {} });
  if (!status.isError || !status.content[0].text.includes('npm run login')) throw new Error('Missing actionable disconnected-browser error');
  await transport.terminateSession();
  console.log('PASS: actual gateway entrypoint, installed upstream LocalCore, initialization, tools/list, actionable disconnected-browser error, and session termination. No live Flow operation invoked.');
} finally { await client.close(); child.kill('SIGTERM'); }
