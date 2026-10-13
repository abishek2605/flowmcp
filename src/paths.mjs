import { homedir } from 'node:os';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';

export function defaults(platform = process.platform, env = process.env, home = homedir()) {
  const base = platform === 'win32' ? join(env.LOCALAPPDATA ?? join(home, 'AppData', 'Local'), 'FlowMCP')
    : platform === 'darwin' ? join(home, '.flow-chatgpt') : '/workspace/shared';
  return {
    stateDir: resolve(env.FLOW_GATEWAY_STATE || join(base, 'flow-state')),
    backendDir: resolve(env.FLOW_BACKEND_DIR || join(base, platform === 'linux' ? 'flow-backend' : 'backend'))
  };
}

export function chromeExecutable(env = process.env) {
  const candidates = [env.FLOW_MCP_CHROME,
    env.PROGRAMFILES && join(env.PROGRAMFILES, 'Google', 'Chrome', 'Application', 'chrome.exe'),
    env['PROGRAMFILES(X86)'] && join(env['PROGRAMFILES(X86)'], 'Google', 'Chrome', 'Application', 'chrome.exe'),
    env.LOCALAPPDATA && join(env.LOCALAPPDATA, 'Google', 'Chrome', 'Application', 'chrome.exe'),
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/google-chrome', '/usr/bin/chromium'
  ].filter(Boolean);
  const executable = candidates.find(existsSync);
  if (!executable) throw new Error('Install Google Chrome, or set FLOW_MCP_CHROME to its executable path.');
  return executable;
}
