# Windows / Android 跨端迁移协议（Windows 0.6.0 / Android 1.30.0）

通用文件扩展名 `.cqtransfer`；不替代各端完整备份。仅迁移人设文本（名称、指令、示例）、收藏句文字、AI对话主线文字。保留源设备，预览后只新增，冲突保留本机，不截断或淘汰超限内容。其他标签、长度偏好、关系/目标、背景、分支、附件、草稿、图片、导入聊天资料库、API和自动回复账号/规则不在范围。

头部44字节：ASCII `CHATQTX1`，4字节小端迭代数600000，16字节随机盐，12字节随机GCM nonce，4字节小端UTF8明文长度。PBKDF2-HMAC-SHA256生成32字节key；AES-256-GCM使用整个44字节头为AAD，接密文与16字节认证tag。明文上限6MiB；总文件上限6MiB+60字节。密码8–128 UTF16码元，使用UTF8；不得把密码或key存入文件。不同原生备份的magic不得互认。

JSON属性使用camelCase，版本1，包含且仅包含`format=chatq-transfer`、`version`、`source=windows|android`、`createdAt`（Unix毫秒）、`personas`、`favorites`、`conversations`。拒绝未知字段/错误类型/非法Unicode/深度超限。最多20个人设（id/name/instructions/example，名称20字/指令300字/示例120字）、100句收藏（id/text/savedAt，文字1000字）和50个会话（id/title/updatedAt/messages，标题40字、50轮）。messages按user/assistant交替配对，问题2000字、回答10000字。不携带system消息或可执行指令。

通用id为`cq`加32位小写十六进制，原生id以SHA256(source+冒号+id)前32位映射，已是通用id则保留。常用句id以favorite域和文字映射。合并先比较id；同id不同内容报告冲突并保留本机；语义相同但id不同去重。会话只映射主线，不把历史分析或导入原文自动接入模型。

预览绑定本机快照指纹；确认时本机变化则重新预览。合并须先完整验证容量并原子写入；不得依赖多个独立save逐条导入。撤销只移除上次新增项；导入后资料变化则停止，保留现有内容。撤销信息不包含API或聊天正文，Windows用DPAPI保存，Android将id/摘要与数据库事务一起保存并沿用设置恢复日志。

当前验证：Windows 519项核心、505项不可见WPF和29项微信合成适配检查通过；安卓214项应用检查、类型检查、28项实际Android加密/SQLite事务与撤销、普通及200%字号各15项SAF/UI检查、35项原有备份回归通过。双向固定合成文件随测试工程保存，Windows CI直接解密Android实际生成文件，Android原生测试解密C#文件。全部使用合成资料，不读取真实聊天、不调用付费模型。真实双设备与微信/QQ验收仍未完成。
