# 舆元 AI Academy MVP 实施计划（修订版：学生确认可跳过审核）

## 1. 技术与业务范围

- 在空工作区 `C:\Users\huangguan\Desktop\huangguanedu` 初始化 Git + Next.js App Router + TypeScript + Prisma + Tailwind CSS + Vitest/Playwright。
- SQLite 开发库，保持 PostgreSQL 兼容；数据库 Session + HttpOnly Cookie；`/api/v1` REST/JSON 接口；核心逻辑放服务端。
- 视觉方向：米白背景、深墨蓝文字、暖橙强调色；中文界面与中文注释。
- 演示账号（虚构资料）：管理员 `13800000001`、老师 `13800000002`（黄冠，中国石油大学数学本科、Monash AI 硕士）、家庭账户 `13800000003` 绑定虚构学生“演示学生 A”，首次登录强制改密。
- 周一至周四小班课完全线下管理，网页只显示月卡权益说明；系统只实现周末一对一预约与课时管理。
- 错题 MVP 仅支持数学、英语；不实现注册、在线支付、微信/小程序 UI；通知只做站内，短信/微信留 `NotificationProvider` 接口。

## 2. 项目与安全基础（阶段一）

- `.env.example`、中文 `README.md`、Prisma schema/迁移/seed、服务端配置校验。
- 密码哈希用 `crypto.scrypt` + 随机盐 + timing-safe 比较；Cookie 只存随机 token，数据库只存 token 哈希；HttpOnly、Secure、SameSite=Lax；状态变更接口做同源 Origin 和 CSRF 校验。
- 登录失败限制：同一手机号/IP 15 分钟最多 5 次失败，触发 15 分钟锁定；管理员重置密码后强制临时密码并撤销全部 Session。
- 无注册接口和注册页面；管理员/老师写操作、老师修订和审核操作写 `AuditLog`。

## 3. 数据模型与权限

- `User`、`Session`、`AuditLog`、`SystemSetting`、`FamilyAccount`、`Student`、`TeacherProfile`、`TeacherStudentAssignment`、`GuardianConsent`。
- `PackagePlan`、`StudentEntitlement`、`CourseSlot`、`Booking`、`AttendanceRecord`、`MakeupCredit`、`Notification`。
- `RawQuestionImage`（临时图，含 `expiresAt`、`reviewStatus`、`deletedAt`）、`WrongQuestion`、`WrongQuestionOccurrence`、`WrongQuestionKnowledgePoint`、`StudentAnswerAttempt`、`AnalysisJob`、`MonthlyReport`、`PracticeSet`、`PracticeQuestion`。
- 权限固定在服务端：家庭账户只读自己绑定的一个学生；老师只读自己负责的学生；管理员可读全部；老师只能改自己学生的 AI 分析。
- 课程时段：类型（小班/一对一）、年级、科目、老师、日期、时间、地点（默认 712 社区）、容量；小班上限 5、一对一上限 1，硬校验。
- 预约在数据库事务中完成：防重复预约、防学生/老师时间冲突、防超容量；状态支持待确认/已确认/已完成/已取消/缺席；管理员可确认、取消、调整课时、补课。

## 4. 上传与异步识别流程

- `POST /api/v1/wrong-questions` 用 `multipart/form-data` 单字段 `image`：仅 JPG/JPEG/PNG、默认最大 8MB、拒绝多文件/错误 MIME/超大文件；页面明确“每次仅上传一道题”。
- 图片处理：浏览器端压缩最长边约 2048px → 服务端 `sharp` 自动旋转、去 EXIF、压缩到约 1—2MB → 保存临时规范化图片，原图不进长期错题本。
- 异步任务：上传接口保存临时图、创建 `WrongQuestion` + `AnalysisJob` 后立即返回 `PROCESSING`；前端轮询 `GET /api/v1/wrong-questions/:id`。任务表含 `status`、`attempts`、`nextRunAt`、`lockedAt`、`lastError`、`completedAt`；Qwen 调用失败/超时或 JSON 校验失败最多重试 2 次。
- 识别质量异常标记（低置信度、模糊、多道题、无法识别、复杂图形）：分析完成后进入“待学生确认”状态，前端先展示基础识别结果并询问“识别是否准确？”，不直接展示完整解答。
- 学生确认后：
  - 选择“识别准确”（`ACCURATE`）：完整解答直接生成并发布，无需老师审核；原图按普通题规则最多保留 24 小时后删除。
  - 选择“需要老师审核”（`NEEDS_REVIEW`）：进入老师复核队列，原图保留至审核完成，最长 7 天。
  - 7 天内未反馈：自动转为老师复核，原图最长保留 7 天。
- 任务失败（Qwen 失败/超时、JSON 多次校验失败）没有结构化结果可供确认，无学生确认入口，直接进入老师复核队列。
- 老师审核完成后立即删除原图；超期未审核删除原图并标记“复核材料已过期”。
- 提供 `npm run data:cleanup`、受 `CRON_SECRET` 保护的内部清理接口，生产由外部 cron 每日调用；学生数据软删除 90 天后硬删除。

## 5. Qwen 接口规格（默认 Mock，可配置 live）

- 模型 `qwen3.7-plus`（官方视觉理解推荐，支持图文输入与 JSON 输出；`qwen3.7-flash` 留作低成本备选；不串联额外 OCR 模型）。
- OpenAI 兼容接口：`POST {DASHSCOPE_BASE_URL}/chat/completions`，`Authorization: Bearer ${DASHSCOPE_API_KEY}`；图片用短期签名 HTTPS URL（生产 OSS/S3），本地真实测试可用百炼临时 `oss://` URL 并带 `X-DashScope-OssResourceResolve: enable`；不要把本地文件路径直接传给 Qwen。
- 请求体固定含 system/user 提示（必须含 `JSON` 关键词）、`image_url` + `max_pixels: 4194304`、`response_format: {"type":"json_object"}`、`enable_thinking: false`；不发送学生姓名/手机号等身份信息。
- `.env.example` 固定：`QWEN_MODE`、`DASHSCOPE_API_KEY`、`DASHSCOPE_BASE_URL`（北京 `https://dashscope.aliyuncs.com/compatible-mode/v1`）、`DASHSCOPE_MODEL`、`QWEN_IMAGE_TRANSPORT`、`QWEN_MAX_PIXELS`、`QWEN_REQUEST_TIMEOUT_MS=30000`、`QWEN_MAX_RETRIES=2`、`QWEN_ENABLE_THINKING=false`。
- 规则：`mock` 模式不要求 Key；`live` 模式缺 Key/Base URL 必须报配置错误，禁止静默回退 Mock；Key 不进浏览器、前端 bundle、数据库或日志；日志只记模型、耗时、任务 ID、HTTP 状态和 request ID。
- 服务端解析 `choices[0].message.content` 后：`JSON.parse` → Zod 校验完整结构 → 失败重试 → 仍失败标记任务失败（进老师复核）；只保存结构化结果，不保存 Qwen 原始响应。
- 结构化结果字段：`recognizedQuestion`、`subject`、`questionType`、`studentWorkDetected`、`studentWorkTranscription`、`studentApproach`、`firstErrorStep`、`misconception`、`whatStudentDidWell`、`thinkingHint`、`correctSteps[]`、`finalAnswer`、`errorCauses[]`、`knowledgePoints[]`、`difficulty`、`aiConfidence`、`needsTeacherReview`、`reviewReasons[]`、`remedialPractice[]`；有学生演算过程时必填过程字段，没有则为 `null` 不得臆测。

## 6. 反馈、审核与错题本

- `POST /api/v1/wrong-questions/:id/feedback`，取值 `ACCURATE` / `NEEDS_REVIEW`。
- 学生选择 `ACCURATE` 后：所有识别质量类异常（低置信度、模糊、多道题、无法识别、复杂图形）均直接发布完整解答，不再强制老师审核；题目标记为已发布，显示“AI 初步生成”，不标注“老师已审核”。
- 学生选择 `NEEDS_REVIEW` 或超时未反馈：进入老师复核；老师审核后显示“老师已审核”。
- 老师仍可随时修订任何已发布题目（含学生确认发布的）；修订直接覆盖当前结构化字段（不保留旧版本），只写“谁何时改了哪道题”的操作日志，修订后标记“老师已审核”。
- 支持合并重复错题、记录多次错误、按错误次数和最近错误时间计算薄弱知识点；错题详情三层展示：题目识别与思路提示 → 错误原因与知识点 → 完整解答；错题本支持按科目/知识点筛选、标记已理解/仍不会、记录再次作答结果。
- 月报：每生每自然月最多一份，手动生成（管理员或负责老师选择学生和月份），本地统计错题数、学科分布、知识点与错误原因；AI 只生成下月建议和 3—5 道模拟题；流程为草稿 → 老师/管理员审核 → 发布给家庭账户；查看月报不重复调用 AI；报告与模拟题均带草稿/待审核/已审核/已发布状态。

## 7. 核心 API（统一 `/api/v1`，返回 `ApiResponse<T>`）

- `POST /auth/login`、`POST /auth/logout`、`GET /auth/me`、`POST /auth/change-password`、`POST /auth/consent`。
- `GET /me/student`、`GET /course-slots`、`POST /bookings`、`PATCH /bookings/:id/cancel`。
- `GET|POST /wrong-questions`、`GET /wrong-questions/:id`、`PATCH /wrong-questions/:id/status`、`POST /wrong-questions/:id/feedback`、`PATCH /teacher/wrong-questions/:id/review`、`POST /teacher/wrong-questions/:id/merge`。
- `GET /reports`、`POST /reports/generate`、`PATCH /reports/:id/review`、`POST /reports/:id/publish`。
- 管理员账户/老师/分配/课程/预约/权益/设置/审计日志 CRUD。
- 交付文档：`docs/api.md`、`docs/openapi.yaml`、`docs/data-model.md`、`docs/permissions.md`。

## 8. 测试与验收（TDD，先写失败测试）

- 无注册入口；密码不明文；登录锁定；首次改密；重置后旧 Session 失效；家庭/老师/管理员数据隔离。
- 小班上限 5、一对一上限 1；重复预约与时间冲突拒绝；老师时间冲突拒绝；多文件/错误格式/超大图片拒绝；图片压缩与临时留存规则。
- Mock 无 Key 可用；异步任务状态、重试、失败入复核；请求体用 `/chat/completions`、`image_url`、`max_pixels`、`response_format` 正确；Prompt 含 `JSON`；非法 JSON/429/5xx/超时按 2 次重试，4xx 不无限重试；Key 不出现在前端。
- 学生确认与审核流程：
  - 低置信度 + 学生 `ACCURATE` → 完整解答直接发布，无需老师审核。
  - 模糊/多道题/无法识别/复杂图形 + 学生 `ACCURATE` → 同样直接发布完整解答，无需老师审核。
  - 学生 `NEEDS_REVIEW` → 进入老师复核，审核完成后原图删除。
  - 异常题 7 天内无反馈 → 自动转为老师复核。
  - 任务失败（Qwen 失败/JSON 无效）无确认入口，直接进老师复核。
  - 学生确认发布的题显示“AI 初步生成”；老师修订后显示“老师已审核”并写审计日志。
- 学生过程字段正确保存；原图不进长期记录；普通 24h/复核 7 天清理；月报不重复调用 AI；管理员操作有审计日志。
- 验证命令：`npm run lint`、`npm run test`、`npm run test:e2e`、`npm run build`、`npx prisma validate`、`npx prisma migrate deploy`、`npm run db:seed`。
- Playwright 至少覆盖移动端流程：登录 → 改临时密码 → 学生首页 → 预约课程 → 上传错题 → 确认识别准确 → 查看直接生成的完整解答。
- 执行细节：PowerShell 下 npm 脚本用 `npm.cmd` / `npx.cmd` 调用（当前执行策略禁止 `npm.ps1`）。

## 9. 默认假设

- 只做网页端；未来小程序复用 `/api/v1` 和服务层。
- 不引入 Redis/队列/Cron 服务；异步任务用数据库任务表，清理由外部 cron 调用受保护接口。
- 开发用本地文件存储，生产可换 S3/OSS 兼容存储；生产通过环境变量启用 HTTPS、Secure Cookie、PostgreSQL。
- 学生确认仅对“已生成结构化结果”的题有效；任务失败无结果可确认，仍强制老师复核（兜底）。
- 异常题未反馈超时默认自动进入老师复核，避免悬挂状态。
- Qwen 默认 Mock；若需真实调用，用户提供 `DASHSCOPE_API_KEY` 并按地域配置 Base URL 后改为 live 模式。