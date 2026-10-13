import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { mkdirSync, existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
if (process.platform !== 'win32') throw new Error('Run this configuration wizard on the Windows PC hosting Chrome.');
const dir = join(process.env.LOCALAPPDATA, 'FlowMCP');
mkdirSync(dir, { recursive: true });
const config = join(dir, 'gateway.env');
if (existsSync(config)) throw new Error(`Configuration already exists at ${config}; review it before replacing it.`);
const rl = createInterface({ input: stdin, output: stdout });
try {
  console.log('Enter public configuration only. Do not paste passwords, API secrets, or tokens.');
  const domain = (await rl.question('Your reserved ngrok HTTPS origin (from its Domains dashboard): ')).trim();
  const origin = new URL(domain);
  if (origin.protocol !== 'https:' || origin.username || origin.password || origin.search || origin.hash || origin.pathname !== '/') throw new Error('Enter only the real HTTPS origin, with no path, token, or query.');
  const issuer = (await rl.question('Exact OAuth issuer URL (Auth0 tenant, including trailing slash): ')).trim();
  const parsedIssuer = new URL(issuer);
  if (parsedIssuer.protocol !== 'https:' || parsedIssuer.username || parsedIssuer.password || parsedIssuer.search || parsedIssuer.hash) throw new Error('Invalid HTTPS issuer URL.');
  const subject = (await rl.question('Your Auth0 User ID: ')).trim();
  if (!subject || /[\r\n',]/.test(subject)) throw new Error('Enter one owner User ID.');
  const values = { FLOW_PUBLIC_URL: `${origin.origin}/mcp`, FLOW_OAUTH_ISSUER: issuer, FLOW_ALLOWED_SUBJECTS: subject };
  for (const value of Object.values(values)) if (/[\r\n']/.test(value)) throw new Error('Invalid configuration characters.');
  writeFileSync(config, Object.entries(values).map(([k, v]) => `${k}='${v}'`).join('\n') + '\n', { flag: 'wx', mode: 0o600 });
  writeFileSync(join(dir, 'tunnel-domain.txt'), origin.origin, { flag: 'wx', mode: 0o600 });
  console.log(`Saved configuration outside Git: ${config}`);
  console.log('Set the Auth0 API audience/default audience to: ' + values.FLOW_PUBLIC_URL);
  console.log('These values are saved, but the endpoint is not deployed until the gateway and tunnel are running.');
} finally { rl.close(); }
