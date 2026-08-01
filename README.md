# kmb-cc-agents

Two commercetools Connect apps hosting the conversational AI agents for the
`kmb-core-commerce-lab` project — one repo, two `deployAs` apps, following the
same pattern as `kmb-cc-taxjar-connector`.

| App | Runs where | Triggered by | Domain |
|---|---|---|---|
| `storefront-agent` | post-login section of the ecommerce website | the storefront's own BFF (not the browser directly) | product discovery + cart building (`create_carts`/`update_carts` only — **no order/checkout creation**, that's a separate dedicated flow) |
| `csr-agent` | a Merchant Center custom app/view | that custom app's own backend | order/customer/payment lookups + returns and cancellations via the project's **separate-return-order pattern** (Order Edits are deliberately never used — see `.claude/skill-overrides/commercetools-commerce-patterns.md` in the `commercetools-es-workspace` repo) |

Both apps are thin orchestration layers: each exposes one authenticated HTTP
endpoint that calls the Anthropic Messages API using its **native remote-MCP
connector** (`mcp_servers` + `tools: [{type: "mcp_toolset", ...}]`, beta
header `mcp-client-2025-11-20`) pointed at that agent's own commercetools
Managed MCP Server. Anthropic's infrastructure runs the full tool-discovery
and tool-invocation loop server-side — there is no hand-rolled MCP client
here.

## Architecture per request

```
caller (BFF / MC custom-app backend)
  -> POST /{app}/chat  (Authorization: Bearer <INBOUND_API_TOKEN>)
    -> rate-limit middleware (Redis/Upstash, keyed by source IP)
    -> load conversation history (Redis/Upstash, keyed by identity: customerId or agentId + sessionId)
    -> Anthropic Messages API call
         system prompt  <- src/prompts/system-prompt.md
         mcp_servers    -> this app's own Managed MCP Server (fresh OAuth token per call, see below)
    -> save updated history back to Redis
    -> Langfuse trace/generation for the whole turn
  <- { "reply": "..." }
```

**Context is bound to identity, not IP.** IP is used only for rate limiting.
Conversation context is keyed by the authenticated customer's id (storefront)
or the authenticated CSR's own employee/user id (csr), because both agents
run in contexts where the caller already knows who the real user is
(post-login; an authenticated Merchant Center session) — IP is a poor proxy
for identity (NAT, shared networks, mobile carrier IPs) and would leak
context across unrelated users behind the same address.

**No long-lived MCP token embedded in config.** Managed MCP Server OAuth
tokens can live up to 30 days, but rather than deploy one and have it expire
mid-project, each app holds only the underlying API Client's `MCP_CLIENT_ID`/
`MCP_CLIENT_SECRET`/`MCP_SCOPE` and fetches (and proactively refreshes) its
own short-lived access token at runtime (`src/clients/mcp-auth.client.js`).

## Configuration

See `connect.yaml` for the full list. Per-app secrets (`MCP_SERVER_URL`,
`MCP_CLIENT_ID/SECRET/SCOPE`, `INBOUND_API_TOKEN`) are separate per app since
each agent talks to its own, differently-scoped Managed MCP Server. Shared
secrets (`ANTHROPIC_API_KEY`, Langfuse keys, Upstash Redis credentials) are
declared once via `inheritAs`.

## Known limitations / follow-ups

- **Redis (Upstash) not yet provisioned for this deployment** — both apps
  require `UPSTASH_REDIS_REST_URL`/`UPSTASH_REDIS_REST_TOKEN` and will fail
  their `postDeploy` dependency check without them. Create a free database at
  the Upstash console, REST API (not the TCP/Redis-protocol endpoint), and
  drop the two values into each app's config before deploying.
- **`X-Forwarded-For` as the client-IP source is unverified against a live
  Connect deployment** (`src/middlewares/rate-limit.middleware.js`) — correct
  for most reverse-proxy setups, but re-confirm against the first real
  request's logs once deployed, since Connect's own proxy layer isn't
  independently documented for this.
- **No frontend yet for either agent.** Test with `scripts/smoke-test.sh`
  (or plain `curl`/Postman) against the deployed service URL — see below.
- **Fail-open vs fail-closed:** the rate limiter fails **open** (a Redis
  hiccup doesn't block real traffic) — everything else (auth, conversation
  context, the Anthropic/MCP call itself) fails **closed** (a dependency
  outage surfaces as a 5xx to the caller rather than silently degrading).
- **Test coverage is minimal by design for this prototype phase** — env
  validation and inbound-auth middleware are covered; the Anthropic/MCP call
  path, Redis interactions, and Langfuse tracing are not yet unit-tested
  (would need mocking the Anthropic SDK, Upstash client, and Langfuse client).

## Local development

```bash
cd storefront-agent   # or csr-agent
cp .env.example .env  # fill in real values
npm install
npm run start:dev
```

## Testing without a UI

Once deployed, each app is a plain authenticated JSON endpoint — test it
directly with `curl`, Postman, or the included script:

```bash
./scripts/smoke-test.sh \
  https://<your-deployment>.<region>.commercetools.app/storefrontAgent \
  "$INBOUND_API_TOKEN" customerId <a-real-customer-id> smoke-1 \
  "Do you have any coffee mugs under \$10?"

./scripts/smoke-test.sh \
  https://<your-deployment>.<region>.commercetools.app/csrAgent \
  "$INBOUND_API_TOKEN" agentId csr-test-1 smoke-1 \
  "Look up order RETURN-TEST-1 for me"
```

A healthy service also responds to `GET /{app}/status` with `{"status":"ok"}`
without requiring auth or touching any dependency (liveness only).

## Deploying

Standard commercetools Connect flow (private GitHub repo → connector draft →
preview deployment):

```bash
gh repo create kmb-cc-agents --private --source=. --push
# then, via the commercetools API (see managed-mcp-server-setup / prior
# connector deployments in this project for the exact POST bodies):
#   POST /connectors/drafts
#   POST .../updatePreviewable
#   POST /deployments  (type: "preview")
```
