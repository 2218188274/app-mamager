#!/bin/sh
set -eu
export JAVA_HOME=${JAVA_HOME:-/opt/java/openjdk}
output=$(mktemp /tmp/chatq-mq-health.XXXXXX)
trap 'rm -f "$output"' EXIT
# The stock tools.sh reserves a 1 GB heap. A bounded one-shot client is enough.
if [ "$1" = namesrv ]; then
  "$JAVA_HOME/bin/java" -Xms16m -Xmx64m -Xmn16m -XX:MaxMetaspaceSize=64m -Drocketmq.log.root=/tmp/rocketmq-health -cp "$ROCKETMQ_HOME/lib/*" org.apache.rocketmq.tools.command.MQAdminStartup getNamesrvConfig -n 127.0.0.1:9876 >"$output" 2>&1
  grep -q 'kvConfigPath' "$output"
else
  "$JAVA_HOME/bin/java" -Xms16m -Xmx64m -Xmn16m -XX:MaxMetaspaceSize=64m -Drocketmq.log.root=/tmp/rocketmq-health -cp "$ROCKETMQ_HOME/lib/*" org.apache.rocketmq.tools.command.MQAdminStartup brokerStatus -n namesrv:9876 -b 127.0.0.1:10911 >"$output" 2>&1
  grep -q 'brokerVersionDesc' "$output"
fi
