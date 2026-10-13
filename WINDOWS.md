# Run the gateway on your Windows PC

The gateway must run on your PC beside the authenticated Chrome session. This cloud
chat cannot control your PC or sign into your Google/Auth0/ngrok accounts. The files
are prepared; Windows execution and live Google Flow behavior have not been tested.
No HTTPS endpoint has been deployed.

## 1. Install prerequisites and gateway

Install Node.js 22+ from https://nodejs.org/, Git for Windows from
https://git-scm.com/downloads/win, and Google Chrome. Install ngrok by following your
https://dashboard.ngrok.com/get-started/setup/windows dashboard instructions.
Authenticate ngrok locally using that dashboard; never paste its token into chat.

Extract the supplied `flowmcp-windows.zip` to a normal local folder such as
`C:\FlowMCP\gateway`, outside OneDrive. This code is not pushed to GitHub; cloning
the original empty `abishek2605/flowmcp` repository will not retrieve these changes.
Open PowerShell in the extracted folder and run:

```powershell
powershell -NoProfile -File .\scripts\install-windows.ps1
```

If your PowerShell policy blocks a downloaded script, review the files and use your
organization's supported signing/unblocking procedure. Do not disable machine-wide
execution policy. Installation clones the pinned upstream backend into
`%LOCALAPPDATA%\FlowMCP\backend`, installs lockfile dependencies, builds, and runs
the gateway tests. It does not modify upstream source or existing backend revisions.

## 2. Obtain real HTTPS and OAuth values

In ngrok's dashboard, obtain the HTTPS domain assigned/reserved for your account
(Domains section). Use a stable domain. Whether your account requires a paid plan
for a particular domain is shown there; do not purchase a plan without reviewing it.
`FLOW_PUBLIC_URL` is that origin followed by `/mcp`.

In Auth0 (https://manage.auth0.com/):

1. Create/select a tenant. Obtain its exact issuer from the tenant's OIDC discovery
   document `https://<your-actual-tenant-domain>/.well-known/openid-configuration`;
   use the `issuer` value, normally with a trailing slash.
2. Applications → APIs → Create API. Use the real HTTPS `/mcp` URL as Identifier and
   RS256 signing. Under Permissions, add the `flow` permission/scope.
3. Set the tenant's Default Audience to that same API identifier, following the
   official OpenAI authenticated example. Enable Dynamic Client Registration under
   tenant Advanced settings, or configure a ChatGPT OAuth client explicitly if your
   current ChatGPT connection UI supports client credentials.
4. Create your own owner login under User Management → Users, or configure your
   own Google social connection and complete the first login. Login details stay
   inside Auth0's interface. Copy only your **User ID**. This is
   `FLOW_ALLOWED_SUBJECTS`; do not authorize strangers or other tenant users.
5. Ensure the authorization server grants the `flow` scope and returns RS256 access
   tokens with your exact API identifier as audience. The gateway rejects other
   audiences/users/scopes and expired tokens. Its JWKS lookup expects
   `/.well-known/jwks.json` under the issuer, as with Auth0.

The OAuth owner login grants access to the gateway. It does **not** sign Chrome into
Google Flow; those are separate sessions. Never use Google passwords or session
cookies as environment values.

Run this local wizard using the real public values above:

```powershell
node .\scripts\configure-windows.mjs
```

It saves `gateway.env` and `tunnel-domain.txt` under `%LOCALAPPDATA%\FlowMCP`, outside
the source repository. Use Windows file security to restrict this directory to
your own user and administrators. The configuration wizard does not deploy anything
or create Auth0/ngrok accounts. There are no placeholder URLs to fill into ChatGPT.

## 3. Start three terminals on your PC

From the gateway folder, use one PowerShell terminal for each command:

```powershell
# Terminal 1: dedicated Chrome login; keep it open
powershell -NoProfile -File .\scripts\start-windows.ps1 -Mode Login

# Terminal 2: OAuth-protected loopback MCP gateway
powershell -NoProfile -File .\scripts\start-windows.ps1 -Mode Gateway

# Terminal 3: HTTPS tunnel to gateway only
powershell -NoProfile -File .\scripts\start-windows.ps1 -Mode Tunnel
```

In the dedicated Chrome window, sign into Google manually and open a Flow project.
Default persistent profile: `%LOCALAPPDATA%\FlowMCP\flow-state\browser\chrome-profile`.
Outputs and job ledger live beside it. CDP binds to loopback port 9333. The gateway
binds to loopback port 3000. **Never tunnel port 9333 or expose the Chrome profile.**

Use the HTTPS forwarding URL ngrok actually reports. It must match the reserved
origin in `gateway.env`; the MCP endpoint is that origin plus `/mcp`. Keep the PC
awake and all three processes running. Closing Chrome, the gateway, or the tunnel
breaks access. After reboot, rerun these commands from your own logged-in desktop
session. You may configure Task Scheduler to start them at your user logon using
the same working directory and account; do not run Chrome in a noninteractive
service account. Interrupted jobs are not replayed; check Flow assets first.

## 4. Verify and connect ChatGPT

Run `npm.cmd test`. These are local transport/security tests using a mock Flow
backend, not proof of generation. Windows symlink escape validation may be unrun
without symlink privileges; the test reports that explicitly.

In your current ChatGPT Developer Mode UI, create an App/Connector with the actual
HTTPS `/mcp` URL, choose OAuth, and sign into the permitted Auth0 owner account.
Refresh tool discovery and call `flow_status`. It must report the actual Chrome
session and open project. Check that unauthorized HTTP requests to `/mcp` return
401 with OAuth metadata; this is expected, not a connectivity failure.

Do not claim deployment success until initialization, tools/list, OAuth login, and
browser status have been checked through that public URL. Generate only after you
explicitly approve the prompts and credit caps. No generation credits have been
authorized in this chat. See DEPLOYMENT.md for available tools and limitations.
