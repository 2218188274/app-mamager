# 话题生成 1.6.0

`POST /api/aikeyboard/topics` 使用现有应用连接码和已注册的 deviceId。请求示例：

```json
{"category":"daily","prompt":"刚认识，想自然开场","candidateCount":3,"customPrompt":"自然真诚，不编造经历","avoid":["上一批开场白"]}
```

分类：daily / food / hobbies / weekend / care / reconnect / work / closer。prompt 可为空；最大 1000 字（客户端背景最多 200 字）。avoid 最多 6 条、每条最多 300 字。可继续提供 context、sceneId、relationId、personaTagWeights。结果沿用 `{success,data:{result,candidates,style,tokens,generatedAt}}`。

REST 入口强制话题任务，校验后复用 protectedProcedure、人设解析、应用 AI 配置以及 generateUserReply 的事务/用户锁/每日额度。一次成功请求记一次，与聊天回复共享额度；失败不计数，不自动重试。实际候选数量受现有套餐上限控制。未授权返回 401、非法参数 400、额度不足 403、上游失败 502。新增接口不改变数据库结构，不需要新供应商密钥。离线话题数据随客户端发布，不需要网络或后台额度。

部署时保留 /opt/chatq/.env 和数据库，备份本次涉及的服务端文件，再从项目根目录执行：

```sh
docker build --target runtime -t chatq-api:topics-1.6.0 .
docker compose --env-file /opt/chatq/.env -f deploy/compose.yaml -f server/deploy/compose.input.yaml up -d --no-build api
curl -fsS http://127.0.0.1:13000/health
```

当前部署复用原运行时依赖，仅替换严格 TypeScript 编译后的 dist；供应商配置仍由数据库读取。回滚时恢复备份中的 compose.input.yaml，并用相同两份 compose 文件启动 api；保留原 chatq-api:input-1.4.0 镜像。不要改动 Whisper、数据库或其他项目容器。
