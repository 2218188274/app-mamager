# 聊商会员与 Jeepay 接入（后端 1.23.1 / 安卓 1.23.0）

本版修复支付链路并完成隔离联调。用户已确认尚未开通正式商户，本次继续完善配置检查，保持正式收款关闭。服务器上的旧 Jeepay 是已停用的隔离候选环境，源清单明确为非生产用途；没有发现聊商正式商户配置、可用收款通道或已上架套餐。旧网关、数据库和密钥保持原状。没有真实扣款，也没有把模拟回调当作实付验收。

## 当前流程

1. 用户通过 HTTPS 注册或登录账号；免费输入不要求购买会员。
2. 后台上架启用的 CNY 月度或年度套餐，价格和时长以数据库为准，不接受客户端改价。
3. 购买前展示金额、天数和非自动续费说明；新订单必须绑定账号。长期会员禁止重复购买。
4. 同一幂等键或未确认的同档订单复用。超时不会重发扣款请求。
5. 外部收银台只接受私有配置中指定来源及已支持的 Jeepay 路由，打开前再次确认。返回应用会查询该原订单，刷新会员权益。
6. JSON/表单回调先验签，再独立签名查单；匹配商户、应用、订单、金额、币种和流水。事务锁保证并发、重放仅开通一次，同档续费顺延。
7. 已停止新售的应用仍能确认既有付款订单。过期支付入口隐藏；从未提交网关的 pending 过期可关闭，ready/unknown 需要网关确认，避免误建新单。
8. 网关退款状态进入 refund_review，支持部分退款的人工核对；付款期间权益被管理员变更则进入 entitlement_review，保留原有会员。不会自动降级长期会员或重复开通。

## 正式接通还需要

- 已开通的微信/支付宝商户及实际支付通道；Jeepay QR_CASHIER 能创建页面并不代表已具备收款能力。
- 管理员确定套餐价格、期限、售后与退款处理规则。测试中的 12 元 / 30 天仅为隔离夹具，未上架。
- 独立生产网关的 HTTPS API 根地址、收银台根域、商户号、商户应用 ID 与签名密钥。
- ChatQ 回调地址为 https://lt.youling.lol/api/aikeyboard/payments/notify；不要添加访问密码或改成管理后台页面。
- 确认商户通道允许实际使用场景及外部收银台回跳方式；进行授权小额下单、支付、回调重试、主动查单和退款验收。未完成验收前保持购买关闭。

不要把商户私钥写进 Git、APK、公开压缩包或聊天。已有配置如在服务器，只提供文件路径即可。

## 1.24.1 后台支付管理

入口：[系统配置 → 支付与订单](https://lt.youling.lol/settings/system?tab=payment)。管理员可按账号、订单号、支付流水和状态查找当前应用订单，显式核对原订单到账或退款状态。核对只查询原流水，不创建新付款或发起退款。

超级管理员可通过 HTTPS 保存商户配置。必须先关闭新订单销售；页面校验不会自动打开销售。首次需填写签名密钥，以后留空保留原密钥，接口不回显密钥，浏览器请求日志已关闭。保存使用版本摘要、独占锁和原子替换，旧配置保存在同一个私有目录供恢复。存在历史订单时禁止直接替换商户绑定或密钥，需维护人员保留旧配置后安排迁移。

当前部署采用 `/mnt/chatq-data/chatq/payment-private`（属主 1000:1000、目录 700）挂载到容器 `/payment-private`，环境变量 `CHATQ_PAYMENT_CONFIG_FILE=/payment-private/payments.json`，文件模式为 600。`CHATQ_PAYMENT_ADMIN_WRITE=true` 仅允许超级管理员保存，**不等于允许收款**。`CHATQ_PAYMENT_TRUST_PROXY=true` 仅适用于 API 绑定宿主回环地址、前置 Caddy 覆盖转发协议头的当前部署。不得在可被公网直连的 API 上盲目沿用此设置。

HTTP IP 访问支付管理接口会返回 426，含批量 tRPC 路径；HTTPS 未认证访问返回 401。正式商户未开通，当前配置文件尚未写入，销售关闭、没有上架套餐。安卓仍为 1.24.0/code 35，本轮只更新后台和后端。

后台表单支持 320px 起的窄屏布局，侧栏可收起，订单表格在自身区域横向滚动。查询失败、配置只读、无套餐、空订单和待核对状态均有明确提示。

## 手动只读挂载方式（可选）

服务器私有文件 /opt/chatq/private/payments.json，目录 700、文件 600。文件属主需与 API 容器运行用户的 UID/GID 一致，先用 docker exec chatq-api-1 id 确认；不要假设服务以 root 运行，也不要用放宽到 644 的方式解决读取失败。字段参考 payments.example.json：appId 为 ChatQ 应用 UUID，merchantAppId 为 Jeepay 商户应用 ID，二者不同。API/收银台填写 HTTPS 根地址，notifyUrl 使用上述完整路径。

参考 compose.payment.example.yaml 只读挂载并设置 CHATQ_PAYMENT_CONFIG_FILE；该文件是可选覆盖，不能带示例值直接启用。不修改原隔离测试环境或其他项目。配置缺失、无效、应用不匹配或没有合法套餐时，账号页显示实际准备状态；不得伪造配置就绪。

本地开发环境可在 npm run build 后执行 node scripts/payment-readiness.mjs。1.23.1 服务镜像已包含该脚本，可直接运行：

```sh
# 只检查私有配置，不需要数据库连接
docker exec chatq-api-1 node scripts/payment-readiness.mjs --config-only
# 同时以只读事务检查应用绑定、销售开关、合法套餐与待核对订单数
docker exec chatq-api-1 node scripts/payment-readiness.mjs
```

返回码 0 表示本次检查范围内配置齐备，2 表示准备不足，1 表示参数或数据库检查错误。脚本不调用网关、不创建订单、不修改销售开关、不输出密钥。configurationReady 仅表示配置齐备；livePaymentsVerified 固定为 false，仍需独立完成真实通道验收。--config-only 不读取数据库，不能判断实际销售开关。

配置状态区分 not_set（未指定文件）、file_missing、unreadable、invalid_json、invalid 和 ready。issues 只报告字段名称、错误码与脱敏提示，不回显输入内容。检查普通文件、32KB 限制、Linux 私有权限及 UTF-8/BOM JSON；REPLACE_/YOUR_/TODO 等占位商户值、示例域名、非 HTTPS、错误回调路径均不能通过生产校验。

每个应用的 blockingReasons 区分 merchant_not_configured / merchant_config_invalid / merchant_app_mismatch / sales_disabled / plans_missing。检查命令、账号页准备状态与实际下单共用套餐校验：仅支持 CNY、有效整数价格与天数的月度或年度套餐。配置错误只向用户显示购买暂未开放，详细配置问题保留在运维命令中；免费输入继续可用。

支付配置摘要发生变化会冻结旧订单自动处理，需管理员对照旧配置核对。不要随意轮换商户密钥或来源域名，避免把历史订单归到另一个商户。

## 协议与测试

使用 [Jeepay 官方支付接口](https://docs.jeequan.com/docs/jeepay/payment_api) 的 MD5 签名、统一下单与查单。官方 QR_CASHIER 地址来自 [DBApplicationConfig](https://github.com/jeequan/jeepay/blob/master/jeepay-core/src/main/java/com/jeequan/jeepay/core/model/DBApplicationConfig.java)：固定来源 /cashier/index.html#/hub/<AES hex token>；保留旧 /#/cashier/<hex> 路由兼容。拒绝其他来源、重定向路径、查询串和非规范 token。状态 6 表示已关闭，下单状态 2 仍需独立查单，不能凭浏览器页面成功开通权益。

- npm run build；node --test --test-concurrency=1 tests/*.test.mjs。
- tests/payments-postgres.mjs：所有写入限制在单连接 TEMP 表，回调处理注入同一隔离数据库，不写生产表。
- tests/accounts-postgres.mjs：注册、登录、恢复码、改密、令牌撤销和权益保留的 TEMP 表回归。
- scripts/feature-db-integration.mjs：仅允许严格命名的独立测试库，不得针对生产数据库运行。
- 安卓模拟器使用回环 HTTP 夹具；主应用正常字号和 200% 字号验收不代表微信/QQ 真机或真实支付验收。

暂无自动退款发起、自动权益退款扣减、跨档补差价和自动续费。退款/权益冲突由管理员核对原订单及后续续费后处理，保留订单记录与流水，不能直接删单解锁。正式 Android 商店发布还需正式签名与对应渠道审核；本次延续原内测签名，以便覆盖升级。

## 1.24.0 补充检查

订单列表读取及普通已到账查单不访问网关。用户主动点“核对到账与退款”时，提交 verifyReceipt=true，用原商户配置和流水向 Jeepay 查单；允许在停止新售后核对旧订单。网关不可用时保留已到账状态并显示错误；查到退款进入 refund_review，不重复开通，也不自动扣减会员。

候选宿主机可运行只读预检：

```sh
python3 server/scripts/jeepay-preflight.py --root /home/youling/jeepay-runtime-20261014/candidate --runtime
```

检查固定镜像摘要、端口、依赖健康检查、私有配置权限、磁盘、容器状态和聊商销售开关。不会启动容器、调用网关、修改私有配置、创建订单或输出密钥。返回码 2 表示候选环境或商户验收仍不满足生产条件；productionReady/livePaymentsVerified 不因静态配置通过而变为 true。当前候选环境保持停止，正式收款关闭。

账号可在已登录状态验证当前密码后重新生成恢复码。新码只展示一次；旧恢复码和其他设备会话失效，当前设备保存新会话，账号、订单和会员不变。本机凭据保存失败时仍展示新恢复码，并要求保存后重新登录。
