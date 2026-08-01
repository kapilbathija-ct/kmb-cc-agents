#!/usr/bin/env bash
# Basic no-UI smoke test for either deployed agent service.
#
# Usage:
#   ./scripts/smoke-test.sh <base-url> <inbound-token> <identity-field> <identity-value> <session-id> "<message>"
#
# Examples:
#   ./scripts/smoke-test.sh https://<deployment>.<region>.commercetools.app/storefrontAgent \
#     "$INBOUND_API_TOKEN" customerId <a-real-customer-id> smoke-1 "Do you have any coffee mugs under \$10?"
#
#   ./scripts/smoke-test.sh https://<deployment>.<region>.commercetools.app/csrAgent \
#     "$INBOUND_API_TOKEN" agentId csr-test-1 smoke-1 "Look up order RETURN-TEST-1 for me"

set -euo pipefail

if [ "$#" -ne 6 ]; then
  echo "Usage: $0 <base-url> <inbound-token> <identity-field> <identity-value> <session-id> <message>" >&2
  exit 1
fi

BASE_URL="$1"
INBOUND_TOKEN="$2"
IDENTITY_FIELD="$3"
IDENTITY_VALUE="$4"
SESSION_ID="$5"
MESSAGE="$6"

BODY=$(printf '{"%s":"%s","sessionId":"%s","message":"%s"}' \
  "$IDENTITY_FIELD" "$IDENTITY_VALUE" "$SESSION_ID" "$MESSAGE")

curl -sS -X POST "${BASE_URL%/}/chat" \
  -H "Authorization: Bearer ${INBOUND_TOKEN}" \
  -H "Content-Type: application/json" \
  -d "$BODY" \
  -w '\nHTTP %{http_code}\n'
