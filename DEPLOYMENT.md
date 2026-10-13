# Google Flow MCP gateway

## Current state

Implemented and tested locally, **not deployed**. There is no public endpoint URL.
This machine has Chromium but no interactive display, authenticated Google session,
hosting integration, OAuth tenant binding, or tunnel credentials. Flow HTTP access
returned proxy HTTP 403. Generation has not been tested and no credits were spent.

## Architecture and source review

ChatGPT → HTTPS `/mcp` → OAuth-authenticated Node gateway → upstream LocalCore →
loopback CDP → dedicated authenticated Chrome profile. Run everything on the machine
with the user's Flow browser. The gateway binds only to `127.0.0.1:3000`; never tunnel
9333 or the upstream Studio port. This is a single-owner integration, not a shared
multi-user service. Everyone in the OAuth subject allowlist can operate that owner's
Flow account and read its outputs. Keep the allowlist restricted to that owner.

Upstream: https://github.com/GTAI-1/flow-mcp at
`06ceeab230da519a7686a12c6c9711eae20ea165`. Source uses the MCP TypeScript SDK,
playwright-core, Zod, a local browser and an in-memory generation queue. TypeScript
build passed. Package metadata says ISC; no LICENSE file or complete license notice
exists. Backend is installed separately; none of its source was copied into this
repository. Resolve the upstream license notice before redistributing its code.

Official OpenAI source inspected:
https://github.com/openai/openai-apps-sdk-examples at
`18cc38e78a968712c357bacdc3c79fead5bfc6b4`, especially
`authenticated_server_python/README.md`. It documents Streamable HTTP, OAuth
protected-resource metadata, Auth0 dynamic registration, and ngrok HTTPS tunneling.
Direct requests to the current Apps SDK build/auth/connect guides returned 403;
full current documentation and a real ChatGPT connection remain unverified.

## Installation and interactive login

Node 22+, Google Chrome/Chromium, a working desktop display, and an authorized Google
Flow account are required. Install using `bash scripts/install.sh` from
`/workspace/flowmcp`. This uses existing isolated checkouts; do not create worktrees.
For another machine, adapt the absolute installation directories explicitly.

Use the same `FLOW_MCP_HOME` for login and the gateway. Run `npm run login` on the
host's interactive desktop. Google login occurs in the dedicated Chrome window;
open or create a project manually and leave Chrome running. Never provide passwords,
cookies, or profile contents through chat. Retain the private profile directory and
outputs across restarts, with owner-only access. If the host has no interactive
desktop, provision a secured interactive desktop or use the user's own machine.
Do not substitute a headless smoke test for Google login.

## OAuth and HTTPS deployment

Configure a real OAuth provider (the inspected OpenAI example uses Auth0), HTTPS
issuer discovery, authorization-code flow with PKCE S256, and either dynamic client
registration or ChatGPT's supported configured client credentials. Set the API
audience to the final HTTPS `/mcp` URL; configure the `flow` scope and allow only the
owner's provider subject ID. If using Auth0, follow the official example's default
audience configuration to receive an RS256 access token. This implementation expects
RS256, exact issuer/audience, expiry, scope, and keys at issuer `/.well-known/jwks.json`.
Do not use an ID token as an access token.

Store configuration in a private file outside the repository. Set `FLOW_PUBLIC_URL`,
`FLOW_OAUTH_ISSUER` (exact issuer including any trailing slash), and
`FLOW_ALLOWED_SUBJECTS` (comma-separated subject IDs). Start with:

```sh
cd /workspace/flowmcp
node --env-file=/secure/path/flow.env src/main.mjs
```

Use an authorized named ngrok tunnel with a stable HTTPS domain forwarding **only**
port 3000: `ngrok http 3000 --url=<your-reserved-domain>`. Use the actual reserved
domain supplied by ngrok, not this documentation example. Tunnel authentication
belongs in ngrok's private configuration outside Git. Alternatively use the host's
authenticated reverse proxy with TLS and a stable domain. Ensure it preserves the
Authorization and MCP session headers and supports streaming responses. A temporary
anonymous tunnel is not a durable authenticated deployment.

Public metadata is at `/.well-known/oauth-protected-resource/mcp` and points to the
configured issuer. All MCP calls and downloads require a valid access token.
No credentials appear in download URLs. `/health` is public and does not attest to
browser login. Limit traffic at the reverse proxy. Do not expose the local testing
token mode publicly; the startup code refuses a public URL without OAuth.

## ChatGPT connection steps (after deployment)

Enable Developer Mode where available, then open Settings → Apps/Connectors → Create
and enter the **actual deployed HTTPS `/mcp` URL**, with OAuth authentication. Complete
the provider login, then refresh tool discovery. Check `flow_status` first. The UI
labels and account availability must be verified in the user's current ChatGPT;
no successful ChatGPT connection has been claimed here.

## Tools and credits

- `flow_status`: browser/session/current project/credits.
- `flow_assets`: current project's media; returns a job ID.
- `flow_characters`: current project's characters; returns a job ID.
- `flow_generate`: image/video scenes, explicit `confirmed=true`, bounded per-scene
  `max_credits`, no automatic retries, gateway job ID returned immediately.
- `flow_job_status`: progress/results/errors for gateway jobs.
- `flow_download`: download original existing assets, asynchronous.
- `flow_outputs`: authenticated HTTPS links to downloaded files.

Ask the user to approve the exact generation prompts and credit caps before calling
`flow_generate`. `confirmed=true` is an explicit tool acknowledgement, not independent
proof of a human approval. The caller must enforce the user approval step. Costs
depend on Flow's current quote; never promise that image generation is free.
Do not run live generation during deployment testing without credit authorization.
Asset URLs need a Bearer token; they are not public browser download links.

**Project listing is not implemented:** upstream has no verified project enumeration
API. Switch projects manually in Chrome. Character creation/editing is present in
upstream but deliberately not exposed in this initial gateway.

## Restart and operational checks

Run the gateway and tunnel under the host's process supervisor, with restart on
failure, private configuration, persistent state/profile storage, and the same
unprivileged desktop owner. Start the interactive browser before the gateway.
Re-run login interactively if Google expires the session. Never disable TLS or
browser certificate validation. Session IDs expire after 30 minutes of inactivity
and never survive a process restart; clients must initialize again.

`jobs.json` retains gateway job IDs/results. Running or queued jobs become
`interrupted` after restart and are **not replayed**. The upstream queue is not
durable. A generation may already have spent credits or completed; check Flow assets
manually before resubmitting. Back up state securely. Do not start a second gateway
against the same Chrome profile; only one owner process should control the browser.

Validate externally with an OAuth-enabled MCP client: initialize, tools/list,
unauthenticated 401 + WWW-Authenticate metadata, valid user flow_status, wrong
audience/subject rejection, authenticated asset download, session deletion/restart.
Use `npm test` for local protocol/security tests; these use a mock Flow backend and
do not prove Google Flow functionality. The browser smoke check uses actual
Chromium/CDP without a Google login and costs no credits.
