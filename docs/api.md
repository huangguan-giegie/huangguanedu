# API 文档

所有接口位于 `/api/v1`，返回统一结构：

```json
{ "success": true, "data": { ... } }
{ "success": false, "error": { "code": "ERROR_CODE", "message": "中文提示" } }
```

认证：登录后通过 HttpOnly Cookie `yy_session` 维持会话；状态变更（POST/PATCH/DELETE）需携带 `X-CSRF-Token`（值来自非 HttpOnly Cookie `yy_csrf`）。

## 认证

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| POST | /auth/login | 手机号 + 密码登录，返回用户与 Cookie |
| POST | /auth/logout | 注销当前会话 |
| GET | /auth/me | 当前登录用户 |
| POST | /auth/change-password | 修改密码（新密码 ≥ 8 位） |
| POST | /auth/consent | 监护人隐私同意 |

## 家庭端

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | /me/student | 绑定学生与权益 |
| GET | /course-slots | 可预约的一对一时段 |
| POST | /bookings | 预约一对一（锁定 1 课时） |
| PATCH | /bookings/:id/cancel | 取消预约（提前 24h 释放课时） |
| GET | /wrong-questions | 错题列表（subject/mastered/knowledgePoint 筛选、分页） |
| POST | /wrong-questions | 上传单张错题图片（multipart：subject + image） |
| GET | /wrong-questions/:id | 错题详情（三层展示） |
| POST | /wrong-questions/:id/feedback | 反馈 ACCURATE / NEEDS_REVIEW |
| PATCH | /wrong-questions/:id/status | 标记 mastered |
| POST | /wrong-questions/:id/attempts | 记录再次作答（answer + result） |
| GET | /summaries | 学习总结列表（家庭仅已发布） |
| GET | /practice-sets | 练习/模拟题组（家庭仅自己学生的） |

## 老师端

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | /teacher/students | 负责的学生 |
| GET | /teacher/wrong-questions | 待复核队列 |
| PATCH | /teacher/wrong-questions/:id/review | 审核覆盖 AI 结果（写审计、删原图） |
| POST | /teacher/wrong-questions/:id/merge | 合并重复错题（body: targetId） |
| POST | /summaries/generate | 生成学习总结草稿（studentId + type + 周期） |
| PATCH | /summaries/:id/review | 审核学习总结 |
| POST | /summaries/:id/publish | 发布学习总结 |
| GET | /practice-sets | 查看负责学生的模拟题组 |
| POST | /practice-sets/generate | 按近期数学错题与薄弱知识点生成 3–5 道模拟题（studentId + count） |

生成总结请求体：

```json
{ "studentId": "xxx", "type": "WEEKLY|MONTHLY|SEMESTER" }
```

周期参数（三选一）：
- `periodStart` / `periodEnd`：显式 ISO 日期；
- `month: "2026-07"`：自然月（type=MONTHLY）；
- `week: "2026-07-06"`：该周周一起 7 天（type=WEEKLY）；
- `termId`：学期（type=SEMESTER，读取 AcademicTerm）。

重复生成同周期总结返回 `{ summaryId, created: false }`，保证幂等。

## 管理员端

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET/PATCH | /admin/students、/admin/students/:id | 学生列表/修改 |
| GET/POST | /admin/teachers | 老师列表/创建（返回一次性临时密码） |
| PATCH | /admin/teachers/:id | 修改老师资料 |
| POST | /admin/teachers/:id/reset-password | 重置密码（撤销会话） |
| POST/DELETE | /admin/assignments、/admin/assignments/:id | 分配关系 |
| GET/POST | /admin/course-slots | 时段列表/创建 |
| PATCH | /admin/course-slots/:id | 修改时段 |
| GET/PATCH | /admin/bookings、/admin/bookings/:id | 预约列表/状态变更（CONFIRM/COMPLETE/ABSENT/CANCEL） |
| POST | /admin/students/:studentId/makeup-credits | 补课 |
| PATCH | /admin/entitlements/:id | 调整权益 |
| GET/POST | /admin/academic-terms | 学期列表/创建 |
| PATCH | /admin/academic-terms/:id | 修改学期（名称/日期/启用状态） |
| GET | /practice-sets | 查看全部模拟题组 |
| POST | /practice-sets/generate | 为任意学生生成 3–5 道数学模拟题 |

## 兼容别名

| 旧路径 | 映射 |
| --- | --- |
| GET /reports | 学习总结列表（type=MONTHLY），保留 `month` 字段 |
| POST /reports/generate | 生成月报（studentId + month）→ MONTHLY 总结 |
| PATCH /reports/:id/review | 审核月报（兼容） |
| POST /reports/:id/publish | 发布月报（兼容） |

模拟题为独立练习模块：通过 `GET /practice-sets` 获取，通过 `POST /practice-sets/generate` 生成。生成时优先使用学生近期数学错题与薄弱知识点；没有历史错题时按年级生成基础综合题。

## 内部

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| POST | /internal/cleanup | 数据清理（Header `X-Cron-Secret`） |
| GET | /images/:id | 临时原图访问（权限受限；OSS 模式返回 302 签名 URL） |

## 上传约束

- 单字段 `image`，仅 JPG/JPEG/PNG，最大 8MB，多文件拒绝
- `subject` 必填（MATH/ENGLISH）
- 服务端 sharp 自动旋转、去 EXIF、最长边 2048px、压缩至约 1MB
- 返回 `{ status: "PROCESSING", wrongQuestionId, imageId, jobId }`

## 脚本

- `npm run analysis:process`：处理待执行分析任务（失败重试 2 次后进复核）
- `npm run summary:process`：检查已结束周期生成总结草稿并重试 AI
- `npm run data:cleanup`：清理过期原图、失败任务、7 天未反馈自动转复核
- `npm run scheduler`：ECS 一体化调度器（分析每分钟、总结/清理每日）
- `npm run db:migrate` / `db:deploy` / `db:seed`：数据库迁移与种子数据
