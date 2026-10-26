#!/bin/sh
set -eu
# Password remains in the container environment, never in argv or probe output.
REDISCLI_AUTH=$(sed -n 's/^requirepass[[:space:]]\+//p' /run/private/valkey.conf | tr -d '"\r')
test -n "$REDISCLI_AUTH"
export REDISCLI_AUTH
test "$(valkey-cli -h 127.0.0.1 --no-auth-warning ping 2>/dev/null)" = PONG
