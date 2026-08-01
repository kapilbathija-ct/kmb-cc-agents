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
    -> rate-limit middleware (in-memory, keyed by source IP)
    -> load conversation history (in-memory, keyed by identity: customerId or agentId + sessionId)
    -> Anthropic Messages API call
         system prompt  <- src/prompts/system-prompt.md
         mcp_servers    -> this app's own Managed MCP Server (fresh OAuth token per call, see below)
    -> save updated history back to the in-memory store
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

**Post-hoc authorization check on cart writes (storefront-agent only).**
commercetools' own docs are explicit that in API Client auth mode (what both
agents use), per-caller authorization isn't enforced by the Managed MCP
Server itself — "you are responsible for filtering the appropriate tools for
your users." Anthropic's native MCP connector also runs tool calls
server-side, so there's no hook to intercept a call before it executes.
`storefront-agent` works around this with a lightweight, non-invasive
pattern instead: after each Anthropic response comes back, it inspects the
`mcp_tool_use`/`mcp_tool_result` blocks already in that response and
confirms every `create_carts`/`update_carts` call actually landed on the
authenticated `customerId`'s own cart (failing closed — an unverifiable
result is treated as a violation) — see `src/services/authorization.service.js`.
No changes to `connect.yaml`, `MCP_SERVER_URL`, or the MCP server config are
needed; the model still talks to the same managed URL. This is a detective
control (the write already happened by the time it's checked), which is an
acceptable trade for a scope limited to cart operations (cheap to disregard/
revert) — not something to carry over as-is to a write that creates a
permanent financial record. `csr-agent` doesn't have this check: its
Order-creating writes aren't cleanly reversible, so a detective control
there is materially weaker and is called out as a real follow-up rather than
solved here.

**No long-lived MCP token embedded in config.** Managed MCP Server OAuth
tokens can live up to 30 days, but rather than deploy one and have it expire
mid-project, each app holds only the underlying API Client's `MCP_CLIENT_ID`/
`MCP_CLIENT_SECRET`/`MCP_SCOPE` and fetches (and proactively refreshes) its
own short-lived access token at runtime (`src/clients/mcp-auth.client.js`).

## Configuration

See `connect.yaml` for the full list. Per-app secrets (`MCP_SERVER_URL`,
`MCP_CLIENT_ID/SECRET/SCOPE`, `INBOUND_API_TOKEN`) are separate per app since
each agent talks to its own, differently-scoped Managed MCP Server. Shared
secrets (`ANTHROPIC_API_KEY`, Langfuse keys) are declared once via
`inheritAs`.

## Known limitations / follow-ups

- **State (rate limits, conversation context) is in-memory, not Redis.** This
  is a deliberate simplification for a single-instance prototype — it proves
  the agent pattern works without standing up an external dependency. Real
  costs: state resets on every restart/redeploy, and it will not work
  correctly if this app is ever scaled to more than one instance (each
  instance would rate-limit and hold conversation context independently).
  Swap `src/clients/memory-store.client.js` for a real Redis/Upstash-backed
  client (see git history for the original implementation) before that
  matters.
- **`X-Forwarded-For` as the client-IP source is unverified against a live
  Connect deployment** (`src/middlewares/rate-limit.middleware.js`) — correct
  for most reverse-proxy setups, but re-confirm against the first real
  request's logs once deployed, since Connect's own proxy layer isn't
  independently documented for this.
- **No frontend yet for either agent.** Test with `scripts/smoke-test.sh`
  (or plain `curl`/Postman) against the deployed service URL — see below.
- **Fail-open vs fail-closed:** the rate limiter fails **open** (an
  unexpected error there doesn't block real traffic) — everything else
  (auth, conversation context, the Anthropic/MCP call itself) fails
  **closed** (a dependency outage surfaces as a 5xx to the caller rather
  than silently degrading).
- **Test coverage is minimal by design for this prototype phase** — env
  validation, inbound-auth middleware, and the cart-ownership authorization
  check are covered; the Anthropic/MCP call path and Langfuse tracing are not
  yet unit-tested (would need mocking the Anthropic SDK and Langfuse client).
- **A single tool call can return enough data to overflow the context
  window.** Confirmed live: a malformed `read_product_projections` predicate
  didn't error, it silently returned an effectively-unfiltered ~130-product
  result set (500KB+ of JSON) — two of those in one conversation produced a
  real `400 "prompt is too long"` failure from Anthropic. Nothing here
  currently bounds a single tool result's size or a turn's total tool-result
  volume before it's sent back to the model; see the corresponding
  `commercetools-es-workspace` mcp-feedback entry for the platform-side gap.
  A client-side guard (truncate/summarize oversized tool results before
  replay) would need to sit in `agent.service.js` if this recurs in practice.
- **Model compliance with the injected identity is not 100% reliable.**
  Confirmed live: even with the customerId explicitly injected into the
  system prompt and the instruction to always use it, the model sometimes
  omitted `customerId` from a `create_carts` call anyway. This is exactly
  the failure mode `authorization.service.js` exists to catch (and it did,
  correctly blocking the reply) — but it's worth being explicit that the
  injected-identity approach reduces, not eliminates, the need for the
  post-hoc check.

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

Code lives at `github.com/kapilbathija-ct/kmb-cc-agents` (private). Standard
commercetools Connect flow from here (see prior connector deployments in
this project for the exact POST bodies):

```bash
#   POST /connectors/drafts
#   POST .../updatePreviewable
#   POST /deployments  (type: "preview")
```
