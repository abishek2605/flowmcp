# Flow MCP for ChatGPT

Authenticated Streamable HTTP gateway for a local Google Flow Chrome session.
Implementation, setup, OAuth, HTTPS deployment, available tools, restart behavior,
and current blockers: [DEPLOYMENT.md](DEPLOYMENT.md).

For a Windows PC hosting Chrome, use [WINDOWS.md](WINDOWS.md).

No public endpoint has been deployed. Local transport and browser attachment tests
have passed; live Google login and generation remain untested.

```sh
bash scripts/install.sh
npm test
node scripts/runtime-smoke.mjs
node scripts/browser-smoke.mjs
```
