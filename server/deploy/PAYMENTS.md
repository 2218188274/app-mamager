# 聊商支付接入

1.14.0 已提供 Jeepay 开源版 MD5 接口适配、套餐下单、外部收银台、主动查单、验签回调和幂等开通。当前服务器只有隔离测试代码，没有可用商户网关和正式商户配置，因此购买入口保持关闭。没有发起真实支付。

## 商户接通前

- 独立搭建并完善 Jeepay 网关/商户应用，确认 QR_CASHIER 通道可用。与用户原有其他项目完全分开，不修改其他项目的支付服务。
- 使用 HTTPS 的 API 根地址、收银台根域和 ChatQ 回调地址。当前 ChatQ 只有 HTTP IP 访问，不满足正式支付回调要求；需要域名与 HTTPS。
- 从商户后台取得 mchNo、merchantAppId 和应用签名密钥，填入服务器私有文件 /opt/chatq/private/payments.json。不要写入 Git、APK、公开源码包或对话。示例 payments.example.json 不可直接使用。
- appId 是 ChatQ apps 表中应用的 UUID，merchantAppId 是 Jeepay 商户应用标识，两者不同。目录权限 700，文件 600，由管理员写入；无效配置会关闭购买入口。
- 可参考 compose.payment.example.yaml，只读挂载私有文件并设置 CHATQ_PAYMENT_CONFIG_FILE。保持现有两个 Compose 配置文件；部署前备份数据库和配置。不在此版本自动启用示例覆盖文件。

## 联调与验收

需在商户沙箱/授权小额订单验证实际网关版本、签名算法、响应字段、QR_CASHIER payData 格式和支付通道。适配器要求统一下单 /api/pay/unifiedOrder、查单 /api/pay/query、响应 data 的信封 sign，以及固定来源的 /#/cashier/<hex> URL。不同 Jeepay 分支需要对应调整，不能把隔离回归当作真实收款验证。

- 下单只接受启用的 CNY 套餐，以数据库中的分价/时长创建不可变快照。同一设备同一幂等键或未确认套餐重复点击复用原订单。
- 回调路径 /api/aikeyboard/payments/notify 支持 JSON/表单。先验签，再独立查询网关，匹配应用、商户、订单、币种、金额和流水；只有明确支付成功才在同一事务中开通套餐并标记到账。并发/重放只开通一次。
- 超时或结果未知保留原订单，用户主动查单，不自动创建新订单或自动扣费。收银台链接只接受配置来源，应用打开前再次确认。
- 权益按当前设备标识绑定，没有跨设备套餐迁移。换机前先联系管理员。当前非自动续费，不保存银行卡信息。
- 跨档升级、退款自动回退、账单对账和正式售后规则尚未实现；退款必须通过商户后台及 ChatQ 管理员人工核对处理。正式开放收款前应完成这些运营规则和真实商户验收。

## 回归

npm run build 后，单元回归 node --test --test-concurrency=1 tests/*.test.mjs 使用本地伪网关，无真实费用。
scripts/feature-db-integration.mjs 只允许 NODE_ENV=test 且数据库名严格匹配 chatq_feature114_test_<8hex> 的独立测试库，覆盖并发/重放、跨用户/跨租户、禁用用户、同步 CAS、签名/金额/流水与回调；不能针对生产数据库执行。

迁移 server/deploy/migrate-1.14.sql 是新增两张表和索引，不改变原表。回滚运行镜像时保留新增表及已产生订单/同步密文，不删除数据。
