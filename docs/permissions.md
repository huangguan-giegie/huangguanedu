# 权限模型

所有权限在服务端强制校验，前端只做展示。认证方式：数据库 Session + HttpOnly Cookie（`yy_session`），状态变更接口要求同源 Origin + 双提交 CSRF Cookie（`yy_csrf` + `X-CSRF-Token` 头）。

## 角色

- **FAMILY 家庭账户**：绑定一个学生
- **TEACHER 老师**：负责若干学生（TeacherStudentAssignment）
- **ADMIN 管理员**：全部数据

## 数据隔离规则

| 数据 | 家庭 | 老师 | 管理员 |
| --- | --- | --- | --- |
| 学生信息 | 仅自己绑定的学生 | 仅负责的学生 | 全部 |
| 错题 | 仅自己的 | 仅负责学生的（含 AI 分析修改/合并） | 全部 |
| 学习总结 | 仅自己的，且仅已发布 | 仅负责学生的（可生成/审核/发布） | 全部 |
| 练习/模拟题 | 仅自己学生的 | 仅负责学生的 | 全部 |
| 预约 | 仅自己的 | - | 全部 |
| 图片 | 仅自己的 | 仅负责学生的 | 全部 |
| 学期 | - | - | 全部（可管理） |

## 接口权限矩阵

| 接口组 | 允许角色 |
| --- | --- |
| /auth/login、/auth/logout | 公开（登录豁免 CSRF） |
| /auth/me、/auth/change-password、/auth/consent | 登录用户 |
| /me/student | FAMILY |
| /teacher/students、/teacher/wrong-questions、审核、合并 | TEACHER、ADMIN |
| /course-slots、/bookings、/wrong-questions（上传/列表/详情/反馈/状态/作答） | FAMILY |
| /summaries（列表）、/practice-sets | FAMILY（仅已发布/自己学生）、TEACHER（负责学生）、ADMIN（全部） |
| /summaries/generate、/summaries/:id/review、/summaries/:id/publish | TEACHER（仅负责学生）、ADMIN |
| /admin/**（含 academic-terms） | ADMIN |
| /internal/cleanup | CRON_SECRET 保护 |

## 审计日志

以下操作写入 AuditLog：
- 修改密码（CHANGE_PASSWORD）
- 管理员创建/修改老师、修改学生、建立/解除分配、重置密码、创建/修改课程时段、调整权益、补课
- 预约状态变更（BOOKING_*）
- 老师审核（TEACHER_REVIEW）、合并错题（MERGE_WRONG_QUESTION）
- 学习总结生成/审核/发布（GENERATE_SUMMARY / REVIEW_SUMMARY / PUBLISH_SUMMARY）
- 学期创建/修改（CREATE_ACADEMIC_TERM / UPDATE_ACADEMIC_TERM）
- 旧月报兼容接口沿用 GENERATE_REPORT / REVIEW_REPORT / PUBLISH_REPORT

## 安全措施

- 密码：`crypto.scrypt` + 随机盐 + timing-safe 比较，存储格式 `scrypt:N:r:p:salt:hash`
- 会话：随机 32 字节 token，数据库仅存 SHA-256 哈希，7 天过期；HttpOnly + SameSite=Lax + 生产 Secure
- 登录锁定：同一手机号/IP 15 分钟最多 5 次失败，触发 15 分钟锁定
- 重置密码后撤销该用户全部 Session 并强制改密
- 客户端 IP：仅在 `TRUSTED_PROXY=true` 时信任 `X-Forwarded-For`，按 `TRUSTED_PROXY_HOPS` 取真实地址
- Qwen/OSS AccessKey 只在服务端环境变量，不进前端、数据库或日志
- 生产环境严格校验必需环境变量，禁止静默回退 Mock/本地存储
