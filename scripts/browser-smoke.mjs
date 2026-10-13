import { chromium } from 'playwright-core';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
const profile = mkdtempSync(join(tmpdir(), 'flow-browser-smoke-'));
const context = await chromium.launchPersistentContext(profile, {
  executablePath: process.env.FLOW_MCP_CHROME ?? '/usr/bin/chromium', headless: true,
  args: ['--remote-debugging-address=127.0.0.1', '--remote-debugging-port=19333']
});
try {
  const version = await fetch('http://127.0.0.1:19333/json/version').then(r => r.json());
  if (!version.webSocketDebuggerUrl) throw new Error('Missing CDP endpoint');
  process.env.FLOW_MCP_CDP_PORT = '19333';
  const { getBrowser } = await import(pathToFileURL(join(process.env.FLOW_BACKEND_DIR ?? '/workspace/shared/flow-backend', 'dist/chrome.js')));
  const browser = await getBrowser();
  try {
    const page = browser.contexts()[0].pages()[0];
    await page.setContent('<title>CDP smoke test</title><p>browser connected</p>');
    if (await page.title() !== 'CDP smoke test') throw new Error('Browser execution failed');
    console.log('PASS: actual Chromium launch, upstream getBrowser private loopback CDP attachment, and page interaction. No Google login or generation tested.');
  } finally { await browser.close(); }
} finally { await context.close(); }
