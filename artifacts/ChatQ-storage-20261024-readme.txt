聊商安装包存储接入记录（2026-10-24）

用户已授权将服务器 103.149.91.78 上的 60 GB 数据盘供聊商使用。
只读检查发现 /dev/vdb1 已为 ext4、状态 clean，仅有 lost+found；未格式化。

当前布局
- 挂载点：/mnt/chatq-data
- UUID：c8d9568b-916d-4244-ab0a-296c73da1d4f
- 下载目录：/mnt/chatq-data/chatq/downloads
- 后续移动端发布暂存：/mnt/chatq-data/chatq/releases/<release-name>
- /opt/chatq/web/downloads 经原网站目录中的符号链接指向上述下载目录。
- /opt/chatq/releases 中原有移动端发布记录、API 发布目录和后台网页仍在原处。
- 数据盘已使用 UUID 写入 fstab，配置 systemd automount、nofail、10 秒设备等待和 nodev/nosuid/noexec。
- 挂载与自动挂载单元均为 active，fstab 校验通过；没有重启整台服务器测试。

后续发布必须先执行
  /opt/chatq/bin/prepare-mobile-release --check
  /opt/chatq/bin/prepare-mobile-release mobile-<version>-<date> --required-bytes <总上传字节数>

工具返回 JSON 中的 stage 和 downloads 路径，必须使用这两个路径作为本次发布目录。
它检查数据盘 UUID、目录、下载链接、文件系统与容量，预留 128 MiB；不发布文件、不改更新指针。
上传到 stage/downloads 后先校验大小和 SHA256，再以硬链接或原子文件替换发布到 downloads。
不可覆盖已发布的版本文件；更新中心 latest 指针必须在包、校验和、服务验证完成后最后切换。
历史 flow116-publish.py 等一次性脚本的路径断言仍针对旧磁盘布局，不可直接重跑或仅删除断言。
下次发布需使用本工具返回的新路径，同时保留原有私密配置、容器、版本文件保护和并发修改校验。

本次验证
- 135 个下载文件，923905949 字节，复制前后完整 SHA256 和权限一致。
- 经服务器本机 Caddy HTTP 路由完整读取全部 135 个文件，SHA256 全部一致。
- APK Range 206、更新清单 1.16.0、后台 /apps 和 API /health 正常。
- 从工作站复查公网 /health、更新清单及 APK 前 8192 字节通过；没有宣称完整公网 APK 下载验证。
- 7 个现有服务容器 ID 和启动时间未变，私有配置和 Caddy 配置未变。
- 发布工具的容量检查、非法路径拒绝和暂存目录到公开目录的硬链接已验证，测试文件已清理。
- 数据盘可用约 58.9 GB（54.9 GiB）；系统盘约 2.8 GB（2.6 GiB），仍需监控系统盘。

回退资料
- /opt/chatq/backups/storage-20261024/fstab.before
- /opt/chatq/backups/storage-20261024/before.json
- /opt/chatq/backups/storage-20261024/downloads.before
- /opt/chatq/backups/storage-20261024/result.json

原下载文件保留在 downloads.before，未删除旧安装包、源码包、旧备份或数据库，也未做 Docker 全局清理。
这是新增存储容量并切换下载，不是释放系统盘空间；回退副本保留占用。
当前回退副本包含切换时的 1.16.0 及全部旧下载；未来发布新版后，直接恢复这个副本会回退更新指针并缺少新包。
需要回退时应先保存数据盘上新增或变化的下载和 latest 指针，核对当时文件清单，然后原子交换下载链接与已验证的回退目录。
仅在没有任何路径依赖数据盘、并核对 fstab 未被其他维护修改后才可撤销挂载配置；不要用旧 fstab 整份覆盖后续配置。
不要重新格式化数据盘或删除 lost+found；不要移动其他项目、数据库、密钥与现有回滚备份。

机器可读验证报告：artifacts/ChatQ-storage-20261024.json
