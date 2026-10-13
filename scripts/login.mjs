import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { defaults, chromeExecutable } from '../src/paths.mjs';
const profile = resolve(process.env.FLOW_MCP_HOME || resolve(defaults().stateDir, 'browser'), 'chrome-profile');
mkdirSync(profile, { recursive: true, mode: 0o700 });
const port = Number(process.env.FLOW_MCP_CDP_PORT ?? 9333);
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('Invalid private CDP port.');
let occupied = false;
try { occupied = (await fetch(`http://127.0.0.1:${port}/json/version`, { signal: AbortSignal.timeout(1000) })).ok; } catch {}
if (occupied) throw new Error(`CDP port ${port} is already in use. If your dedicated Flow Chrome is open, leave it running and start the gateway; otherwise close the other debugging browser first.`);
// Launch ordinary Chrome, matching upstream's interactive handoff. No automated
// password entry and no Playwright launch flags are needed for Google sign-in.
const child = spawn(chromeExecutable(), [
  `--user-data-dir=${profile}`, '--remote-debugging-address=127.0.0.1',
  `--remote-debugging-port=${port}`, '--no-first-run', '--no-default-browser-check',
  'https://flow.google.com/'
], { stdio: 'inherit' });
child.on('error', error => { console.error(error.message); process.exitCode = 1; });
child.on('exit', code => { if (code) process.exitCode = code; });
console.log('Sign into Google interactively in the dedicated Chrome window, open a Flow project, and keep Chrome open. Never send credentials to chat.');
