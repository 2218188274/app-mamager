# 提供的导出安装包：静态格式审查

审查日期：2026-11-04。仅读取用户指定压缩包目录、内嵌元数据与常量；没有解压执行、导入DLL、启动微信、获取密钥或读取真实记录。

文件：微信聊天导出工具_安装包.zip；80,997,679字节、417条ZIP目录项。SHA256：`5d4478f2d8191cda5cc9f0b695b69d721e86a03d45bbbf9159dc9000aed8211d`。

包含.NET9 WPF自定义界面`WxKeyCaptureTest`、`wx_key.dll`及Go程序`chatlog_alpha.exe`。Go构建元数据模块名为`github.com/piperTang/chatlog_alpha`。界面常量显示其流程涉及数据准备、调用外部解密程序、SQLite查询、单会话JSON/CSV导出及agent_data读取包。这是静态行为线索，不代表执行验证或安全/微信版本兼容背书。

可确认的导出字段：

- 单会话：`ExportPayload.Session`（含显示名/用户名）、`ExportedAt`、`Messages`。
- 结构化消息：`Id, ServerId, Talker, Sender, IsSelf, Type, Time, Content`。
- 中文CSV：`时间,发送人,类型,内容`。内容可能包含逗号、引号、换行。
- 读取包：`manifest.json`、`sessions.json`、`contacts.json`、`messages/*.json`。聊商只接收明确选择或聊天ZIP内的消息文件，不读取其提示词或manifest路径，不加载联系人与媒体。

聊商使用独立实现的解析器和合成的对应格式验证；未复制、捆绑或运行这些二进制，也未取得实际导出样本。该工具真实导出与当前微信版本支持仍待用户验收。

公开来源核对：[Go模块对应仓库](https://github.com/piperTang/chatlog_alpha)在本次访问返回451，raw说明/许可未能取得；[sjzar/chatlog](https://github.com/sjzar/chatlog)仅保留2025-10-20项目移除说明。没有据此推断原包的授权或把它作为聊商运行依赖。

本次实现和验证见[0.5.0审查](ChatQ-Windows-0.5.0-audit.json)。
