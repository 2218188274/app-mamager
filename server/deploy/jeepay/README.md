# Jeepay 候选环境健康检查

这是原 Jeepay 测试部署的增量覆盖文件，不包含商户密钥，也不会开放公网端口或新订单销售。

将 `compose.health.json` 和 `health/` 放在现有 `compose.json` 同一目录。先检查合并配置，再在隔离候选环境验证：

```sh
docker compose -f compose.json -f compose.health.json config --quiet
docker compose -f compose.json -f compose.health.json config --format json > compose.merged.json
chmod 600 compose.merged.json
python3 jeepay-preflight.py --root . --compose-json compose.merged.json
```

启动时必须同时指定两份 Compose 文件。依赖就绪检查涵盖 MySQL 查询、带认证的 Valkey PING、RocketMQ 名称服务配置查询、Broker 状态查询，以及支付查询接口的空请求响应。最后一项不创建订单，也不调用支付渠道。RocketMQ 探针使用独立 64 MB Java 堆，避免默认工具预留 1 GB 堆导致小服务器内存不足。

2026-10-26 在授权数据盘的独立克隆验证；原数据库、私有配置和停用容器保留。验证网络设为 `internal: true`，无发布端口。验收后停止克隆以释放内存，保留其数据和报告。

健康检查通过只证明候选服务依赖和接口能够工作。正式商户入驻、微信/支付宝渠道配置、HTTPS 网关与收银台、通道业务规则及小额实付/退款验收仍需另外完成。`productionReady` 和 `livePaymentsVerified` 不会因健康检查通过而变成 `true`。
