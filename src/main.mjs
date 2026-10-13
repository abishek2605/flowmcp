import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { readFileSync, mkdirSync } from 'node:fs';
import { createGateway, oauthAuthenticator, tokenAuthenticator } from './gateway.mjs';
import { defaults } from './paths.mjs';

const { stateDir, backendDir } = defaults();
process.env.FLOW_MCP_HOME ??= resolve(stateDir, 'browser');
process.env.FLOW_MCP_OUTPUT ??= resolve(stateDir, 'outputs');
mkdirSync(process.env.FLOW_MCP_OUTPUT, { recursive: true, mode: 0o700 });
const { LocalCore } = await import(pathToFileURL(resolve(backendDir, 'dist/core.js')));
const publicUrl = process.env.FLOW_PUBLIC_URL;
const issuer = process.env.FLOW_OAUTH_ISSUER;
if (publicUrl && !/^https:\/\/[^/]+\/mcp$/.test(publicUrl)) throw new Error('FLOW_PUBLIC_URL must be the HTTPS /mcp endpoint.');
if (publicUrl && !issuer) throw new Error('Public deployment requires OAuth; static tokens are for local transport testing only.');
const authenticate = issuer ? oauthAuthenticator({ issuer, audience: publicUrl, subjects: (process.env.FLOW_ALLOWED_SUBJECTS ?? '').split(',').filter(Boolean) })
  : tokenAuthenticator(readFileSync(process.env.FLOW_TOKEN_FILE, 'utf8').trim());
const core = new LocalCore();
// Only attach to Chrome launched through the interactive login handoff. Do not
// auto-launch upstream's browser when there is no desktop or authenticated profile.
for (const method of ['status', 'generate', 'wait', 'assets', 'characters', 'download']) {
  const original = core[method].bind(core);
  core[method] = async args => {
    try {
      const response = await fetch(`http://127.0.0.1:${Number(process.env.FLOW_MCP_CDP_PORT ?? 9333)}/json/version`, { signal: AbortSignal.timeout(2000) });
      if (!response.ok) throw new Error('CDP unavailable');
    } catch { throw new Error('Chrome is not connected. On the interactive host run npm run login, sign into Google manually, open a Flow project, and keep Chrome open.'); }
    return original(args);
  };
}
const gateway = createGateway({ core, authenticate, issuer, publicUrl, stateDir, outputDir: process.env.FLOW_MCP_OUTPUT });
const listener = gateway.app.listen(Number(process.env.PORT ?? 3000), '127.0.0.1', () => console.log('Flow MCP gateway listening on loopback.'));
for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, async () => { await gateway.close(); listener.close(); process.exit(0); });
