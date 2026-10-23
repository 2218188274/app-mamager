# AI Keyboard - 智能风格化回复键盘

> 一款 iOS 自定义键盘，根据预设的说话风格，自动读取剪贴板内容并智能生成个性化回复。

---

## 项目简介

**AI Keyboard** 是一款创新的 iOS 第三方键盘应用。用户可以预设多种说话风格（如幽默、正式、暖心、毒舌等），并支持多种风格自由组合。当用户复制对方的一句话后，键盘会自动读取剪贴板内容，结合用户设定的语言风格，借助 AI 能力一键生成贴合风格的智能回复。

无论是社交聊天、工作沟通，还是恋爱对话，**AI Keyboard** 都能帮你用最合适的方式回应每一句话。

---

## 核心功能

### 1. 预制说话风格
- 内置多种说话风格模板（幽默、正式、温柔、犀利、文艺、商务等）
- 支持用户自定义风格，输入风格描述即可生成专属语言模型
- 每种风格可设置详细参数（语气、用词偏好、emoji 使用频率等）

### 2. 多风格组合
- 支持将多种风格叠加混搭，创造独一无二的表达方式
- 例如：「幽默 + 温柔」=「暖心搞笑风」
- 风格组合可保存为个人预设，一键切换

### 3. 智能剪贴板识别
- 自动检测剪贴板中复制的文本内容
- 智能分析对方话语的语义、情感和意图
- 无需手动粘贴，键盘界面直接展示识别结果

### 4. AI 智能回复生成
- 基于大语言模型（LLM）生成高质量回复
- 一次生成多条候选回复，用户可自由选择
- 支持对生成结果进行微调和二次编辑
- 回复考虑上下文语境，确保自然流畅

### 5. 订阅会员体系
- 提供免费版与付费订阅两种方案，满足不同用户需求
- 基于 StoreKit 2 实现应用内购买，流畅安全
- 支持月度/年度订阅周期，年度订阅享更多优惠
- 订阅状态跨设备同步，换机无忧
- 支持家庭共享（Family Sharing）

---

## 订阅方案

| 功能 | 免费版 | Pro 月度订阅 | Pro 年度订阅 |
|------|--------|-------------|-------------|
| 内置基础风格 | 3 种 | 全部解锁 | 全部解锁 |
| 自定义风格 | 1 个 | 无限制 | 无限制 |
| 风格组合 | - | 无限制 | 无限制 |
| 每日 AI 回复次数 | 10 次 | 无限制 | 无限制 |
| 候选回复数量 | 1 条 | 最多 5 条 | 最多 5 条 |
| 高级 AI 模型 | - | 可选 | 可选 |
| 回复历史记录 | - | 保留 30 天 | 保留 30 天 |
| 优先响应速度 | - | 优先队列 | 优先队列 |
| 价格 | 免费 | ¥18/月 | ¥128/年 (省 ¥88) |

> 所有付费功能均提供 **3 天免费试用**，试用期内可随时取消。

---

## 应用场景

| 场景 | 风格示例 | 效果 |
|------|---------|------|
| 朋友聊天 | 幽默 + 活泼 | 轻松有趣，活跃气氛 |
| 工作沟通 | 正式 + 专业 | 得体大方，高效沟通 |
| 恋爱对话 | 温柔 + 浪漫 | 甜蜜暖心，增进感情 |
| 长辈交流 | 礼貌 + 亲切 | 尊重有加，温馨和谐 |
| 网络社交 | 犀利 + 幽默 | 妙语连珠，个性鲜明 |

---

## 项目结构

本项目采用 **monorepo** 结构，iOS 客户端代码位于 `app/`，订阅相关的服务端代码位于 `server/`。

```
ai_keyboard/
│
├── app/                             # iOS 客户端 (App + Keyboard Extension)
│   ├── AIKeyboard/                  # 主应用 (Host App)
│   │   ├── App/                     # 应用入口与配置
│   │   ├── Views/                   # SwiftUI 视图
│   │   │   ├── StyleListView        # 风格列表管理
│   │   │   ├── StyleEditorView      # 风格编辑器
│   │   │   ├── SubscriptionView     # 订阅/付费墙页面
│   │   │   └── SettingsView         # 设置页面
│   │   ├── Models/                  # 数据模型
│   │   │   ├── SpeakingStyle        # 说话风格模型
│   │   │   ├── StyleCombination     # 风格组合模型
│   │   │   └── Subscription         # 订阅状态模型
│   │   ├── Services/                # 服务层
│   │   │   ├── AIService            # AI 接口服务
│   │   │   ├── ClipboardService     # 剪贴板监听服务
│   │   │   ├── StyleManager         # 风格管理服务
│   │   │   └── SubscriptionManager  # 订阅管理服务 (StoreKit 2)
│   │   └── Resources/               # 资源文件
│   │
│   ├── KeyboardExtension/           # 键盘扩展 (Keyboard Extension)
│   │   ├── KeyboardViewController   # 键盘主控制器
│   │   ├── Views/                   # 键盘 UI 组件
│   │   │   ├── ReplyCardView        # 回复卡片视图
│   │   │   ├── StyleSelectorView    # 风格快捷选择器
│   │   │   └── KeyboardLayoutView   # 键盘布局
│   │   └── Helpers/                 # 工具类
│   │
│   ├── Shared/                      # 主应用与扩展共享代码
│   │   ├── Models/                  # 共享数据模型
│   │   ├── Extensions/              # Swift 扩展
│   │   └── Constants/               # 常量定义
│   │
│   ├── Tests/                       # 单元测试 & UI 测试
│   └── AIKeyboard.xcodeproj         # Xcode 工程文件
│
├── server/                          # 服务端 (订阅验证 & AI 代理)
│   ├── src/
│   │   ├── app.ts                   # 应用入口
│   │   ├── config/
│   │   │   ├── env.ts               # 环境变量配置
│   │   │   └── apple.ts             # Apple API 证书与密钥配置
│   │   ├── routes/
│   │   │   ├── subscription.ts      # 订阅相关路由
│   │   │   ├── webhook.ts           # App Store Server Notifications 回调
│   │   │   └── ai.ts               # AI 回复生成代理路由
│   │   ├── services/
│   │   │   ├── appleService.ts      # App Store Server API 交互
│   │   │   ├── subscriptionService.ts # 订阅业务逻辑
│   │   │   └── aiService.ts         # AI 模型调用服务
│   │   ├── models/
│   │   │   ├── user.ts              # 用户模型
│   │   │   └── subscription.ts      # 订阅记录模型
│   │   ├── middlewares/
│   │   │   ├── auth.ts              # 用户认证中间件
│   │   │   └── rateLimit.ts         # 请求频率限制 (免费/Pro 分级)
│   │   └── utils/
│   │       ├── jws.ts               # JWS 签名验证工具
│   │       └── logger.ts            # 日志工具
│   │
│   ├── tests/                       # 服务端测试
│   ├── Dockerfile                   # Docker 部署
│   ├── docker-compose.yml           # Docker Compose 编排
│   ├── package.json                 # 依赖管理
│   └── tsconfig.json                # TypeScript 配置
│
├── README.md
└── CHANGELOG.md
```

---

## 技术栈

### 客户端 (app/)

| 类别 | 技术选型 |
|------|---------|
| 开发语言 | Swift 5.9+ |
| UI 框架 | SwiftUI + UIKit (键盘扩展) |
| 最低版本 | iOS 16.0+ |
| 应用内购买 | StoreKit 2 |
| 本地存储 | SwiftData / UserDefaults (App Group) |
| 数据共享 | App Group Container |
| 网络层 | URLSession + async/await |
| 架构模式 | MVVM |
| 包管理 | Swift Package Manager |

### 服务端 (server/)

| 类别 | 技术选型 |
|------|---------|
| 运行时 | Node.js 20+ |
| 开发语言 | TypeScript 5+ |
| Web 框架 | Express.js / Hono |
| 数据库 | PostgreSQL + Prisma ORM |
| 缓存 | Redis (订阅状态缓存) |
| AI 能力 | OpenAI API / 自定义 LLM 接口 |
| Apple 对接 | App Store Server API V2 / Server Notifications V2 |
| 认证 | JWT (设备绑定 Token) |
| 部署 | Docker + Docker Compose |
| 日志 | Pino |

---

## 快速开始

### 环境要求

- Xcode 15.0+
- iOS 16.0+ 真机或模拟器
- 有效的 Apple 开发者账号（键盘扩展需签名）
- Node.js 20+、pnpm（服务端）
- Docker & Docker Compose（服务端部署）
- PostgreSQL 15+、Redis 7+（服务端依赖）

### 一、启动服务端

```bash
# 1. 进入服务端目录
cd server

# 2. 安装依赖
pnpm install

# 3. 配置环境变量
cp .env.example .env
# 编辑 .env，填入以下必要配置：
#   DATABASE_URL        - PostgreSQL 连接串
#   REDIS_URL           - Redis 连接串
#   OPENAI_API_KEY      - OpenAI API 密钥
#   APPLE_BUNDLE_ID     - App Bundle ID
#   APPLE_SHARED_SECRET - App Store 共享密钥
#   APPLE_KEY_ID        - App Store Connect API Key ID
#   APPLE_ISSUER_ID     - App Store Connect Issuer ID
#   APPLE_PRIVATE_KEY   - App Store Connect 私钥 (.p8)

# 4. 初始化数据库
pnpm db:migrate

# 5. 启动开发服务器
pnpm dev
```

**Docker 一键部署：**

```bash
cd server
docker-compose up -d
```

### 二、运行 iOS 客户端

```bash
# 1. 进入客户端目录
cd app

# 2. 使用 Xcode 打开项目
open AIKeyboard.xcodeproj

# 3. 在 Xcode 中配置服务端地址
# Shared/Constants/APIConfig.swift → 修改 baseURL 为你的服务端地址

# 4. 选择目标设备，运行项目
```

### 三、启用键盘

1. 运行应用后，前往 **设置 → 通用 → 键盘 → 键盘 → 添加新键盘**
2. 选择 **AI Keyboard**
3. 开启 **允许完全访问**（剪贴板读取需要此权限）
4. 在任意输入场景切换至 AI Keyboard 即可使用

---

## 使用流程

```
复制对方的消息 → 切换到 AI Keyboard → 自动识别剪贴板内容
                                          ↓
                               选择/切换说话风格
                                          ↓
                              AI 生成多条候选回复
                                          ↓
                           选择满意的回复 → 一键输入
```

---

## 服务端 API

### 订阅相关

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/subscription/verify` | 验证 App Store 收据，激活/更新订阅状态 |
| GET | `/api/subscription/status` | 查询当前用户的订阅状态与到期时间 |
| POST | `/api/subscription/restore` | 恢复购买，重新同步订阅状态 |
| POST | `/api/webhook/apple` | 接收 App Store Server Notifications V2 回调 |

### AI 回复

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/ai/generate` | 根据对方消息 + 风格配置，生成 AI 回复 |
| GET | `/api/ai/models` | 获取可用的 AI 模型列表 |

### 用户

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/user/register` | 设备注册，获取访问 Token |
| POST | `/api/user/refresh` | 刷新 Token |

> 所有 API 均需通过 `Authorization: Bearer <token>` 认证（`/api/webhook/apple` 除外，使用 Apple JWS 签名验证）。
> 免费用户受请求频率限制（10 次/天），Pro 用户无限制。

---

## 隐私与安全

- 剪贴板数据仅在本地处理，不会未经授权上传
- AI 请求使用 HTTPS 加密传输
- 不存储用户聊天记录
- 遵循 Apple App Store 隐私政策要求
- 用户可随时关闭剪贴板读取权限
- 订阅付款通过 Apple 官方支付系统处理，不收集任何支付信息
- 订阅可随时在系统设置中管理与取消

---

## 开发计划

### Phase 1 - 基础功能
- [x] 项目架构设计
- [ ] 基础键盘扩展搭建
- [ ] 说话风格预设系统
- [ ] 多风格组合引擎
- [ ] 剪贴板自动读取与解析
- [ ] AI 回复生成集成

### Phase 2 - 订阅与商业化
- [ ] **客户端**：StoreKit 2 集成与商品配置
- [ ] **客户端**：订阅付费墙页面（SubscriptionView）
- [ ] **客户端**：免费/Pro 功能权限管控
- [ ] **客户端**：订阅状态监听与自动续期处理
- [ ] **客户端**：免费试用（Free Trial）流程
- [ ] **客户端**：订阅恢复购买功能
- [ ] **客户端**：家庭共享支持
- [ ] **服务端**：项目初始化与基础架构搭建
- [ ] **服务端**：用户设备注册与 JWT 认证
- [ ] **服务端**：App Store 收据验证接口
- [ ] **服务端**：订阅状态查询与缓存
- [ ] **服务端**：App Store Server Notifications V2 Webhook 接入
- [ ] **服务端**：AI 回复生成代理接口（含频率限制）
- [ ] **服务端**：Docker 容器化与部署配置

### Phase 3 - 体验优化
- [ ] 主应用风格管理界面
- [ ] 键盘 UI 交互优化
- [ ] 支持更多 AI 模型接入
- [ ] 多语言回复支持（中/英/日等）
- [ ] Widget 小组件快捷操作
- [ ] iCloud 风格同步

---

## 贡献指南

欢迎提交 Issue 和 Pull Request！

1. Fork 本仓库
2. 创建功能分支 (`git checkout -b feature/amazing-feature`)
3. 提交更改 (`git commit -m 'Add amazing feature'`)
4. 推送分支 (`git push origin feature/amazing-feature`)
5. 创建 Pull Request

---

## 许可证

本项目采用 [MIT License](LICENSE) 开源协议。

---

## 作者

**Jaxon**

---

> "用 AI 的力量，让每一次回复都恰到好处。" 
