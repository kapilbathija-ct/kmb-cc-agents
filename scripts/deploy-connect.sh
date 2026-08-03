#!/usr/bin/env bash
# Rolls a new git tag out through commercetools Connect: point the
# ConnectorStaged at the tag, publish it, re-verify previewable status (a
# repository change resets isPreviewable to "none" - see
# .claude/skill-overrides/commercetools-connect.md in the ES workspace), then
# redeploy the running Deployment against the newly-published Connector.
#
# Mirrors the exact manual sequence used to ship v1.0.10 by hand (see
# commercetools-es-workspace session notes, 2026-08-03) - same API calls,
# same poll-until-terminal-status pattern, just parameterized and non-
# interactive so CI can run it unattended.
#
# Required env: CTP_PROJECT_KEY, CTP_AUTH_URL, CTP_CLIENT_ID, CTP_CLIENT_SECRET
# Required args: $1 = connect region base URL (e.g. connect.us-central1.gcp.commercetools.com)
#                $2 = connector/connectorStaged key
#                $3 = deployment key
#                $4 = git tag to deploy
set -euo pipefail

CONNECT_BASE_URL="$1"
CONNECTOR_KEY="$2"
DEPLOYMENT_KEY="$3"
GIT_TAG="$4"

: "${CTP_PROJECT_KEY:?}" "${CTP_AUTH_URL:?}" "${CTP_CLIENT_ID:?}" "${CTP_CLIENT_SECRET:?}"

TOKEN=$(curl -sf -X POST "$CTP_AUTH_URL/oauth/token" \
  -u "$CTP_CLIENT_ID:$CTP_CLIENT_SECRET" \
  -d "grant_type=client_credentials" | jq -r .access_token)

api() {
  curl -sf "https://$CONNECT_BASE_URL/$1" -H "Authorization: Bearer $TOKEN" "${@:2}"
}

echo "== Reading current ConnectorStaged ($CONNECTOR_KEY) =="
draft=$(api "connectors/drafts/key=$CONNECTOR_KEY")
version=$(echo "$draft" | jq -r .version)
current_tag=$(echo "$draft" | jq -r .repository.tag)
repo_url=$(echo "$draft" | jq -r .repository.url)
echo "Current tag: $current_tag -> target: $GIT_TAG"

echo "== Setting repository tag =="
draft=$(api "connectors/drafts/key=$CONNECTOR_KEY" -X POST -H "Content-Type: application/json" \
  -d "{\"version\":$version,\"actions\":[{\"action\":\"setRepository\",\"url\":\"$repo_url\",\"tag\":\"$GIT_TAG\"}]}")
version=$(echo "$draft" | jq -r .version)

echo "== Publishing =="
draft=$(api "connectors/drafts/key=$CONNECTOR_KEY" -X POST -H "Content-Type: application/json" \
  -d "{\"version\":$version,\"actions\":[{\"action\":\"publish\",\"certification\":false}]}")
version=$(echo "$draft" | jq -r .version)

echo "== Waiting for publish to finish =="
for _ in $(seq 1 40); do
  sleep 15
  draft=$(api "connectors/drafts/key=$CONNECTOR_KEY")
  status=$(echo "$draft" | jq -r .status)
  echo "  status=$status"
  [ "$status" != "Processing" ] && break
done
if [ "$status" != "Published" ]; then
  echo "Publish did not reach Published (got $status)"; echo "$draft" | jq .publishingReport; exit 1
fi
version=$(echo "$draft" | jq -r .version)

echo "== Re-requesting previewable status (repository change resets it) =="
draft=$(api "connectors/drafts/key=$CONNECTOR_KEY" -X POST -H "Content-Type: application/json" \
  -d "{\"version\":$version,\"actions\":[{\"action\":\"updatePreviewable\"}]}")

echo "== Waiting for previewable verification =="
for _ in $(seq 1 40); do
  sleep 15
  draft=$(api "connectors/drafts/key=$CONNECTOR_KEY")
  previewable=$(echo "$draft" | jq -r .isPreviewable)
  echo "  isPreviewable=$previewable"
  [ "$previewable" != "pending" ] && break
done
if [ "$previewable" != "true" ]; then
  echo "isPreviewable did not reach true (got $previewable)"; echo "$draft" | jq .previewableReport; exit 1
fi

echo "== Redeploying $DEPLOYMENT_KEY =="
deployment=$(api "$CTP_PROJECT_KEY/deployments/key=$DEPLOYMENT_KEY")
dversion=$(echo "$deployment" | jq -r .version)
api "$CTP_PROJECT_KEY/deployments/key=$DEPLOYMENT_KEY" -X POST -H "Content-Type: application/json" \
  -d "{\"version\":$dversion,\"actions\":[{\"action\":\"redeploy\",\"updateConnector\":true}]}" > /dev/null

echo "== Waiting for redeploy to finish =="
for _ in $(seq 1 40); do
  sleep 15
  deployment=$(api "$CTP_PROJECT_KEY/deployments/key=$DEPLOYMENT_KEY")
  dstatus=$(echo "$deployment" | jq -r .status)
  echo "  status=$dstatus"
  [ "$dstatus" != "Deploying" ] && [ "$dstatus" != "Queued" ] && break
done
if [ "$dstatus" != "Deployed" ]; then
  echo "Deployment did not reach Deployed (got $dstatus)"; exit 1
fi

deployed_tag=$(echo "$deployment" | jq -r .connector.repository.tag)
echo "== Done: $DEPLOYMENT_KEY is running $deployed_tag =="
