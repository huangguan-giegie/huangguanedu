# 数据模型

技术栈：Prisma 7 + PostgreSQL（本地 Docker / 测试 / 生产 RDS 统一）。模型定义见 `prisma/schema.prisma`，PostgreSQL 基线迁移见 `prisma/migrations/`。

## 认证与权限

| 模型 | 说明 | 关键字段 |
| --- | --- | --- |
| User | 用户（手机号登录） | phone 唯一、passwordHash、role、mustChangePassword、deletedAt |
| Session | 数据库会话 | tokenHash 唯一（仅存哈希）、expiresAt |
| AuditLog | 审计日志 | actor、action、targetType/targetId、summary、ip |
| SystemSetting | 系统设置（键值） | key 唯一、value |
| GuardianConsent | 监护人隐私同意 | version、consentedAt、ip、userAgent |

## 账户与学生/老师

| 模型 | 说明 |
| --- | --- |
| FamilyAccount | 家庭账户（与 User 一对一） |
| Student | 学生（与家庭账户一对一） |
| TeacherProfile | 老师档案（学历信息） |
| TeacherStudentAssignment | 老师-学生负责关系（endsAt 表示已结束） |

## 套餐、课程与预约

| 模型 | 说明 | 关键字段 |
| --- | --- | --- |
| PackagePlan | 套餐计划（小班月卡/一对一课时） | type、priceCents |
| StudentEntitlement | 学生权益 | paid、remainingHours、usedHours、monthlyOneOnOneHours；studentId+planId 唯一 |
| CourseSlot | 课程时段 | type、subject、teacherId、startTime/endTime、capacity、status |
| Booking | 预约 | status、lockedHours、entitlementId；studentId+slotId 唯一 |
| AttendanceRecord | 出勤记录 | status |
| MakeupCredit | 补课记录 | hours、reason、createdBy |
| Notification | 站内通知 | isRead |

## 错题与图片

| 模型 | 说明 | 关键字段 |
| --- | --- | --- |
| RawQuestionImage | 临时原图（不长期留存） | filePath（对象 Key）、expiresAt、reviewStatus、deletedAt |
| WrongQuestion | 结构化错题 | subject、status、识别/分析字段、老师修订、掌握状态 |
| WrongQuestionOccurrence | 同一题再次出错记录 | occurredAt |
| WrongQuestionKnowledgePoint | 错题知识点 | wrongQuestionId+knowledgePoint 唯一 |
| StudentAnswerAttempt | 再次作答记录 | answer、result |
| AnalysisJob | 异步分析任务 | status、attempts、nextRunAt、lockedAt、lastError、completedAt |

## 学习总结与练习

| 模型 | 说明 | 关键字段 |
| --- | --- | --- |
| LearningSummary | 学习总结（周报/月报/学期总结） | type、periodStart/periodEnd、status、stats、aiSuggestions、aiError、needsRetry、reviewerId；studentId+type+periodStart+periodEnd 唯一 |
| AcademicTerm | 学期（管理员配置） | name、startDate、endDate、isActive、createdById |
| PracticeSet | 练习/模拟题组（独立模块） | studentId、title、summaryId（可选溯源） |
| PracticeQuestion | 模拟题 | question、answer、explanation |

## 状态枚举

- UserRole: ADMIN / TEACHER / FAMILY
- CourseType: SMALL_CLASS / ONE_ON_ONE
- SlotStatus: OPEN / FULL / CANCELLED
- BookingStatus: PENDING / CONFIRMED / COMPLETED / CANCELLED / ABSENT
- Subject: MATH / ENGLISH
- WrongQuestionStatus: PROCESSING / PENDING_STUDENT_CONFIRMATION / PUBLISHED / NEEDS_REVIEW / REVIEWED
- AnalysisJobStatus: PENDING / RUNNING / COMPLETED / FAILED
- FeedbackValue: ACCURATE / NEEDS_REVIEW
- SummaryType: WEEKLY / MONTHLY / SEMESTER
- SummaryStatus: DRAFT / PENDING_REVIEW / REVIEWED / PUBLISHED

## 错题状态流转

```text
上传(PROCESSING) -> 分析完成(PENDING_STUDENT_CONFIRMATION)
  -> 学生确认 ACCURATE -> PUBLISHED（AI 初步生成）
  -> 学生 NEEDS_REVIEW / 7 天未反馈 / 任务失败 -> NEEDS_REVIEW -> 老师审核 -> REVIEWED（老师已审核）
```

## 学习总结周期与状态

```text
周报：周一 00:00 至下周一 00:00（含周一至周日）
月报：自然月首日 00:00 至下月首日 00:00
学期：AcademicTerm 配置开始日期 00:00 至结束日期次日 00:00

生成草稿(DRAFT) -> 审核(REVIEWED) -> 发布(PUBLISHED)（家庭端可见）
AI 建议失败：保留统计 + needsRetry，不自动发布
```
