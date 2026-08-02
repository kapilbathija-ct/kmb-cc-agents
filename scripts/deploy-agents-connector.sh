#!/usr/bin/env bash
# Idempotent, repeatable deployment of the two conversational-commerce agent
# services (storefront-agent + csr-agent, source at
# github.com/kapilbathija-ct/kmb-cc-agents) into kmb-core-commerce-lab via
# commercetools Connect.
#
# Unlike Stripe (public/certified connector by key) or TaxJar (which needed
# Terraform to provision a dedicated commercetools API client), this repo
# needs NO new commercetools API client — both agents' MCP client
# credentials (KMB_CC_STOREFRONT_AGENT_MCP_*, KMB_CC_CSR_AGENT_MCP_*) were
# already provisioned during the Managed MCP Server setup and live in
# commercetools-es-workspace/.env. So there's no Terraform component here at
# all — this is a private custom connector, registered the same
# ConnectorStaged -> updatePreviewable -> preview-deployment way as TaxJar,
# just without the API-client-provisioning step first.
#
# Required env vars (source commercetools-es-workspace/.env):
#   CTP_PROJECT_KEY, CTP_CLIENT_ID, CTP_CLIENT_SECRET, CTP_AUTH_URL
#   ANTHROPIC_API_KEY
#   LANGFUSE_SECRET_KEY, LANGFUSE_PUBLIC_KEY, LANGFUSE_BASE_URL
#   KMB_CC_STOREFRONT_AGENT_MCP_URL, KMB_CC_STOREFRONT_AGENT_MCP_CLIENT_ID,
#     KMB_CC_STOREFRONT_AGENT_MCP_CLIENT_SECRET, KMB_CC_STOREFRONT_AGENT_MCP_SCOPE
#   KMB_CC_CSR_AGENT_MCP_URL, KMB_CC_CSR_AGENT_MCP_CLIENT_ID,
#     KMB_CC_CSR_AGENT_MCP_CLIENT_SECRET, KMB_CC_CSR_AGENT_MCP_SCOPE
# Optional overrides:
#   CTP_REGION (default us-central1.gcp)
#   CONNECTOR_KEY (default kmb-cc-agents)
#   DEPLOYMENT_KEY (default kmb-cc-agents)
#   CONNECTOR_REPO_URL / CONNECTOR_REPO_TAG
#   ANTHROPIC_MODEL (default claude-sonnet-5)
#   STOREFRONT_INBOUND_API_TOKEN / CSR_INBOUND_API_TOKEN (generated if unset)
#
# Safe to re-run: reuses an existing ConnectorStaged/Deployment by key and
# redeploys with current config instead of erroring.

set -euo pipefail

CTP_REGION="${CTP_REGION:-us-central1.gcp}"
CONNECTOR_KEY="${CONNECTOR_KEY:-kmb-cc-agents}"
DEPLOYMENT_KEY="${DEPLOYMENT_KEY:-kmb-cc-agents}"
CONNECTOR_REPO_URL="${CONNECTOR_REPO_URL:-https://github.com/kapilbathija-ct/kmb-cc-agents.git}"
CONNECTOR_REPO_TAG="${CONNECTOR_REPO_TAG:-v1.0.0}"
ANTHROPIC_MODEL="${ANTHROPIC_MODEL:-claude-sonnet-5}"
CONNECT_API_URL="https://connect.${CTP_REGION}.commercetools.com"

: "${CTP_PROJECT_KEY:?required — source commercetools-es-workspace/.env first}"
: "${CTP_CLIENT_ID:?required}"
: "${CTP_CLIENT_SECRET:?required}"
: "${CTP_AUTH_URL:?required}"
: "${ANTHROPIC_API_KEY:?required}"
: "${LANGFUSE_SECRET_KEY:?required}"
: "${LANGFUSE_PUBLIC_KEY:?required}"
: "${LANGFUSE_BASE_URL:?required}"
: "${KMB_CC_STOREFRONT_AGENT_MCP_URL:?required}"
: "${KMB_CC_STOREFRONT_AGENT_MCP_CLIENT_ID:?required}"
: "${KMB_CC_STOREFRONT_AGENT_MCP_CLIENT_SECRET:?required}"
: "${KMB_CC_STOREFRONT_AGENT_MCP_SCOPE:?required}"
: "${KMB_CC_CSR_AGENT_MCP_URL:?required}"
: "${KMB_CC_CSR_AGENT_MCP_CLIENT_ID:?required}"
: "${KMB_CC_CSR_AGENT_MCP_CLIENT_SECRET:?required}"
: "${KMB_CC_CSR_AGENT_MCP_SCOPE:?required}"

STOREFRONT_INBOUND_API_TOKEN="${STOREFRONT_INBOUND_API_TOKEN:-$(openssl rand -hex 24)}"
CSR_INBOUND_API_TOKEN="${CSR_INBOUND_API_TOKEN:-$(openssl rand -hex 24)}"

log() { echo "==> $*"; }

log "Getting a commercetools OAuth token"
TOKEN=$(curl -s -X POST "$CTP_AUTH_URL/oauth/token" -u "$CTP_CLIENT_ID:$CTP_CLIENT_SECRET" -d "grant_type=client_credentials" | jq -r .access_token)

# --- ConnectorStaged: create or reuse -------------------------------------

log "Checking for an existing ConnectorStaged (key: $CONNECTOR_KEY)"
HTTP_STATUS=$(curl -s -o /tmp/kmb-cc-agents-connector-staged.json -w "%{http_code}" \
  "$CONNECT_API_URL/connectors/drafts/key=$CONNECTOR_KEY" -H "Authorization: Bearer $TOKEN")

if [ "$HTTP_STATUS" = "200" ]; then
  echo "    Found — reusing."
elif [ "$HTTP_STATUS" = "404" ]; then
  echo "    Not found — creating."
  DRAFT=$(jq -n \
    --arg key "$CONNECTOR_KEY" \
    --arg repo_url "$CONNECTOR_REPO_URL" \
    --arg repo_tag "$CONNECTOR_REPO_TAG" \
    --arg private_project "${CTP_REGION}:${CTP_PROJECT_KEY}" \
    '{
      key: $key,
      name: "KMB Conversational Commerce Agents",
      description: "Storefront and CSR conversational agents (Anthropic native remote-MCP connector against per-agent Managed MCP Servers) for kmb-core-commerce-lab",
      creator: {name: "Kapil Bathija", email: "kapil.bathija@commercetools.com", company: "commercetools"},
      repository: {url: $repo_url, tag: $repo_tag},
      integrationTypes: ["other"],
      privateProjects: [$private_project],
      supportedRegions: ["us-central1.gcp"]
    }')
  curl -s -X POST "$CONNECT_API_URL/connectors/drafts" \
    -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
    -d "$DRAFT" -o /tmp/kmb-cc-agents-connector-staged.json -w "HTTP %{http_code}\n"
  if jq -e '.statusCode' /tmp/kmb-cc-agents-connector-staged.json >/dev/null 2>&1; then
    echo "    ERROR creating ConnectorStaged:" >&2
    cat /tmp/kmb-cc-agents-connector-staged.json >&2
    exit 1
  fi
else
  echo "    ERROR: unexpected HTTP $HTTP_STATUS checking ConnectorStaged:" >&2
  cat /tmp/kmb-cc-agents-connector-staged.json >&2
  exit 1
fi

IS_PREVIEWABLE=$(jq -r '.isPreviewable // false' /tmp/kmb-cc-agents-connector-staged.json)
if [ "$IS_PREVIEWABLE" != "true" ]; then
  log "Requesting previewable status"
  CONNECTOR_VERSION=$(jq -r '.version' /tmp/kmb-cc-agents-connector-staged.json)
  curl -s -X POST "$CONNECT_API_URL/connectors/drafts/key=$CONNECTOR_KEY" \
    -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
    -d "{\"version\": $CONNECTOR_VERSION, \"actions\": [{\"action\": \"updatePreviewable\"}]}" \
    -o /tmp/kmb-cc-agents-connector-staged.json -w "HTTP %{http_code}\n"

  log "Waiting for isPreviewable to become true (validation can take a few minutes)"
  for i in $(seq 1 40); do
    curl -s "$CONNECT_API_URL/connectors/drafts/key=$CONNECTOR_KEY" \
      -H "Authorization: Bearer $TOKEN" -o /tmp/kmb-cc-agents-connector-staged.json
    IS_PREVIEWABLE=$(jq -r '.isPreviewable // false' /tmp/kmb-cc-agents-connector-staged.json)
    STATUS=$(jq -r '.connectorStatus // .status // "unknown"' /tmp/kmb-cc-agents-connector-staged.json)
    echo "    [$i] isPreviewable=$IS_PREVIEWABLE status=$STATUS"
    [ "$IS_PREVIEWABLE" = "true" ] && break
    if echo "$STATUS" | grep -qi "fail"; then
      echo "    ERROR: previewable validation failed:" >&2
      jq '.publishingReport // .' /tmp/kmb-cc-agents-connector-staged.json >&2
      exit 1
    fi
    sleep 15
  done
  if [ "$IS_PREVIEWABLE" != "true" ]; then
    echo "    ERROR: timed out waiting for isPreviewable" >&2
    cat /tmp/kmb-cc-agents-connector-staged.json >&2
    exit 1
  fi
else
  echo "    Already previewable."
fi

CONNECTOR_ID=$(jq -r '.id' /tmp/kmb-cc-agents-connector-staged.json)
rm -f /tmp/kmb-cc-agents-connector-staged.json

# --- global + per-app configuration ----------------------------------------

build_global_standard_config() {
  jq -n \
    --arg project_key "$CTP_PROJECT_KEY" \
    --arg auth_url "$CTP_AUTH_URL" \
    --arg model "$ANTHROPIC_MODEL" \
    '[
      {key: "CTP_PROJECT_KEY", value: $project_key},
      {key: "CTP_AUTH_URL", value: $auth_url},
      {key: "ANTHROPIC_MODEL", value: $model},
      {key: "CONTEXT_TTL_SECONDS", value: "1800"},
      {key: "RATE_LIMIT_MAX_REQUESTS", value: "20"},
      {key: "RATE_LIMIT_WINDOW_SECONDS", value: "60"}
    ]'
}

build_global_secured_config() {
  jq -n \
    --arg anthropic_key "$ANTHROPIC_API_KEY" \
    --arg lf_secret "$LANGFUSE_SECRET_KEY" \
    --arg lf_public "$LANGFUSE_PUBLIC_KEY" \
    --arg lf_url "$LANGFUSE_BASE_URL" \
    '[
      {key: "ANTHROPIC_API_KEY", value: $anthropic_key},
      {key: "LANGFUSE_SECRET_KEY", value: $lf_secret},
      {key: "LANGFUSE_PUBLIC_KEY", value: $lf_public},
      {key: "LANGFUSE_BASE_URL", value: $lf_url}
    ]'
}

build_storefront_standard_config() {
  jq -n --arg url "$KMB_CC_STOREFRONT_AGENT_MCP_URL" '[{key: "MCP_SERVER_URL", value: $url}]'
}

build_storefront_secured_config() {
  jq -n \
    --arg client_id "$KMB_CC_STOREFRONT_AGENT_MCP_CLIENT_ID" \
    --arg client_secret "$KMB_CC_STOREFRONT_AGENT_MCP_CLIENT_SECRET" \
    --arg scope "$KMB_CC_STOREFRONT_AGENT_MCP_SCOPE" \
    --arg inbound_token "$STOREFRONT_INBOUND_API_TOKEN" \
    '[
      {key: "MCP_CLIENT_ID", value: $client_id},
      {key: "MCP_CLIENT_SECRET", value: $client_secret},
      {key: "MCP_SCOPE", value: $scope},
      {key: "INBOUND_API_TOKEN", value: $inbound_token}
    ]'
}

build_csr_standard_config() {
  jq -n --arg url "$KMB_CC_CSR_AGENT_MCP_URL" '[{key: "MCP_SERVER_URL", value: $url}]'
}

build_csr_secured_config() {
  jq -n \
    --arg client_id "$KMB_CC_CSR_AGENT_MCP_CLIENT_ID" \
    --arg client_secret "$KMB_CC_CSR_AGENT_MCP_CLIENT_SECRET" \
    --arg scope "$KMB_CC_CSR_AGENT_MCP_SCOPE" \
    --arg inbound_token "$CSR_INBOUND_API_TOKEN" \
    '[
      {key: "MCP_CLIENT_ID", value: $client_id},
      {key: "MCP_CLIENT_SECRET", value: $client_secret},
      {key: "MCP_SCOPE", value: $scope},
      {key: "INBOUND_API_TOKEN", value: $inbound_token}
    ]'
}

build_deployment_draft() {
  local global_standard global_secured sf_standard sf_secured csr_standard csr_secured
  global_standard=$(build_global_standard_config)
  global_secured=$(build_global_secured_config)
  sf_standard=$(build_storefront_standard_config)
  sf_secured=$(build_storefront_secured_config)
  csr_standard=$(build_csr_standard_config)
  csr_secured=$(build_csr_secured_config)

  jq -n \
    --arg key "$DEPLOYMENT_KEY" \
    --arg region "$CTP_REGION" \
    --arg connector_id "$CONNECTOR_ID" \
    --argjson global_standard "$global_standard" \
    --argjson global_secured "$global_secured" \
    --argjson sf_standard "$sf_standard" \
    --argjson sf_secured "$sf_secured" \
    --argjson csr_standard "$csr_standard" \
    --argjson csr_secured "$csr_secured" \
    '{
      key: $key,
      type: "preview",
      region: $region,
      connector: {id: $connector_id, staged: true},
      globalConfiguration: {standardConfiguration: $global_standard, securedConfiguration: $global_secured},
      configurations: [
        {applicationName: "storefront-agent", standardConfiguration: $sf_standard, securedConfiguration: $sf_secured},
        {applicationName: "csr-agent", standardConfiguration: $csr_standard, securedConfiguration: $csr_secured}
      ]
    }'
}

# --- Deployment: create or redeploy ----------------------------------------

log "Checking for an existing deployment (key: $DEPLOYMENT_KEY)"
HTTP_STATUS=$(curl -s -o /tmp/kmb-cc-agents-deployment.json -w "%{http_code}" \
  "$CONNECT_API_URL/$CTP_PROJECT_KEY/deployments/key=$DEPLOYMENT_KEY" -H "Authorization: Bearer $TOKEN")

if [ "$HTTP_STATUS" = "200" ]; then
  echo "    Found — redeploying with current config."
  CURRENT_VERSION=$(jq -r '.version' /tmp/kmb-cc-agents-deployment.json)
  DRAFT=$(build_deployment_draft)
  UPDATE=$(jq -n \
    --argjson version "$CURRENT_VERSION" \
    --argjson global "$(echo "$DRAFT" | jq '.globalConfiguration')" \
    --argjson configs "$(echo "$DRAFT" | jq '.configurations')" \
    '{version: $version, actions: [{action: "redeploy", globalConfiguration: $global, configurationValues: $configs}]}')
  curl -s -X POST "$CONNECT_API_URL/$CTP_PROJECT_KEY/deployments/key=$DEPLOYMENT_KEY" \
    -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
    -d "$UPDATE" -o /tmp/kmb-cc-agents-deployment.json -w "HTTP %{http_code}\n"
elif [ "$HTTP_STATUS" = "404" ]; then
  echo "    Not found — creating."
  DRAFT=$(build_deployment_draft)
  curl -s -X POST "$CONNECT_API_URL/$CTP_PROJECT_KEY/deployments" \
    -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
    -d "$DRAFT" -o /tmp/kmb-cc-agents-deployment.json -w "HTTP %{http_code}\n"
else
  echo "    ERROR: unexpected HTTP $HTTP_STATUS checking deployment:" >&2
  cat /tmp/kmb-cc-agents-deployment.json >&2
  exit 1
fi

if jq -e '.statusCode and (.statusCode | type == "number") and (.statusCode >= 400)' /tmp/kmb-cc-agents-deployment.json >/dev/null 2>&1; then
  echo "    ERROR deploying:" >&2
  cat /tmp/kmb-cc-agents-deployment.json >&2
  exit 1
fi

log "Waiting for the deployment to finish deploying"
for i in $(seq 1 60); do
  curl -s "$CONNECT_API_URL/$CTP_PROJECT_KEY/deployments/key=$DEPLOYMENT_KEY" \
    -H "Authorization: Bearer $TOKEN" -o /tmp/kmb-cc-agents-deployment.json
  STATUS=$(jq -r '.status' /tmp/kmb-cc-agents-deployment.json)
  echo "    [$i] status: $STATUS"
  [ "$STATUS" = "Deployed" ] && break
  [ "$STATUS" = "Failed" ] && { echo "    ERROR: deployment failed" >&2; jq '.details' /tmp/kmb-cc-agents-deployment.json >&2; exit 1; }
  sleep 15
done

if [ "$STATUS" != "Deployed" ]; then
  echo "ERROR: timed out waiting for deployment" >&2
  exit 1
fi

STOREFRONT_URL=$(jq -r '.applications[] | select(.applicationName=="storefront-agent") | .url' /tmp/kmb-cc-agents-deployment.json)
CSR_URL=$(jq -r '.applications[] | select(.applicationName=="csr-agent") | .url' /tmp/kmb-cc-agents-deployment.json)
rm -f /tmp/kmb-cc-agents-deployment.json
unset TOKEN

log "Done."
log "storefront-agent: ${STOREFRONT_URL}/storefrontAgent  (INBOUND_API_TOKEN: $STOREFRONT_INBOUND_API_TOKEN)"
log "csr-agent:        ${CSR_URL}/csrAgent  (INBOUND_API_TOKEN: $CSR_INBOUND_API_TOKEN)"
log "Save these INBOUND_API_TOKEN values — commercetools never returns secured configuration values again after this."
