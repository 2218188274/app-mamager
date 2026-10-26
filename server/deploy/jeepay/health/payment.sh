#!/bin/sh
set -eu
output=$(mktemp /tmp/chatq-payment-health.XXXXXX)
trap 'rm -f "$output"' EXIT
# A deliberately unsigned empty query validates the HTTP handler without creating an order.
status=$(curl -sS --max-time 8 -o "$output" -w '%{http_code}' -H 'Content-Type: application/json' -d '{}' http://127.0.0.1:9216/api/pay/query)
case "$status" in 200|400) ;; *) exit 1;; esac
grep -Eq '"code"[[:space:]]*:[[:space:]]*[0-9]+' "$output"
