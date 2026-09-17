// 演示种子数据(全部为虚构资料,不得包含真实学生信息)
// 幂等:重复执行不会产生重复账号或重复课程时段
import "dotenv/config";

import { PrismaPg } from "@prisma/adapter-pg";

import { hashPassword } from "../src/lib/password";
import { PrismaClient } from "../src/generated/prisma/client";
import type { CourseType, Subject } from "../src/generated/prisma/enums";

const adapter = new PrismaPg({
  connectionString:
    process.env.DATABASE_URL ??
    "postgresql://postgres:postgres@127.0.0.1:5432/huangguanedu",
});
const prisma = new PrismaClient({ adapter });

// 演示账号临时密码(首次登录强制修改)
const TEMP_PASSWORD = "Temp@123456";

/** 计算下一个指定星期几的日期(0=周日,6=周六),用于生成可用的示例课程时段 */
function nextWeekday(dayOfWeek: number, weekOffset = 1): Date {
  const now = new Date();
  const date = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate() + weekOffset * 7,
  );
  const diff = (dayOfWeek - date.getDay() + 7) % 7;
  date.setDate(date.getDate() + diff);
  return date;
}

async function main() {
  // 1. 系统设置
  const settings: Array<{ key: string; value: string; description: string }> = [
    {
      key: "ai_confidence_threshold",
      value: "0.85",
      description: "AI 识别置信度阈值,低于该值标记为低置信度",
    },
    {
      key: "raw_image_retention_hours_normal",
      value: "24",
      description: "普通题临时原图保留小时数,超过后清理",
    },
    {
      key: "raw_image_retention_days_review",
      value: "7",
      description: "待老师复核题的临时原图保留天数,审核完成后立即删除",
    },
    {
      key: "booking_cancel_deadline_hours",
      value: "24",
      description: "预约取消截止时间,开课前提前的小时数",
    },
  ];
  for (const setting of settings) {
    await prisma.systemSetting.upsert({
      where: { key: setting.key },
      update: { value: setting.value, description: setting.description },
      create: setting,
    });
  }

  // 2. 演示账号(管理员 / 老师 / 家庭)
  const admin = await prisma.user.upsert({
    where: { phone: "13800000001" },
    update: {},
    create: {
      phone: "13800000001",
      passwordHash: await hashPassword(TEMP_PASSWORD),
      role: "ADMIN",
      name: "系统管理员",
      mustChangePassword: true,
    },
  });

  const teacher = await prisma.user.upsert({
    where: { phone: "13800000002" },
    update: {},
    create: {
      phone: "13800000002",
      passwordHash: await hashPassword(TEMP_PASSWORD),
      role: "TEACHER",
      name: "黄冠",
      mustChangePassword: true,
    },
  });

  // 老师档案:中国石油大学数学本科、Monash AI 硕士
  await prisma.teacherProfile.upsert({
    where: { userId: teacher.id },
    update: {
      university: "中国石油大学 / Monash University",
      major: "数学 / 人工智能",
      degree: "本科 / 硕士",
    },
    create: {
      userId: teacher.id,
      university: "中国石油大学 / Monash University",
      major: "数学 / 人工智能",
      degree: "本科 / 硕士",
    },
  });

  const family = await prisma.user.upsert({
    where: { phone: "13800000003" },
    update: {},
    create: {
      phone: "13800000003",
      passwordHash: await hashPassword(TEMP_PASSWORD),
      role: "FAMILY",
      name: "演示家长",
      mustChangePassword: true,
    },
  });

  // 3. 家庭账户与虚构学生
  const familyAccount = await prisma.familyAccount.upsert({
    where: { userId: family.id },
    update: {},
    create: { userId: family.id },
  });

  const student = await prisma.student.upsert({
    where: { familyAccountId: familyAccount.id },
    update: { name: "演示学生 A", grade: "初二", school: "演示中学" },
    create: {
      familyAccountId: familyAccount.id,
      name: "演示学生 A",
      grade: "初二",
      school: "演示中学",
    },
  });

  // 4. 老师负责该学生
  const teacherProfile = await prisma.teacherProfile.findUniqueOrThrow({
    where: { userId: teacher.id },
  });
  await prisma.teacherStudentAssignment.upsert({
    where: {
      teacherId_studentId: {
        teacherId: teacherProfile.id,
        studentId: student.id,
      },
    },
    update: {},
    create: {
      teacherId: teacherProfile.id,
      studentId: student.id,
    },
  });

  // 5. 默认套餐
  const smallClassPlan = await prisma.packagePlan.upsert({
    where: { id: "plan-small-class-monthly" },
    update: {},
    create: {
      id: "plan-small-class-monthly",
      name: "一站式月卡",
      type: "SMALL_CLASS",
      priceCents: 120000,
      periodText: "每月",
      description: "小班课月卡权益(周一到周四线下管理,网页仅展示权益说明)",
    },
  });
  await prisma.packagePlan.upsert({
    where: { id: "plan-one-on-one-hourly" },
    update: {},
    create: {
      id: "plan-one-on-one-hourly",
      name: "一对一课时",
      type: "ONE_ON_ONE",
      priceCents: 30000,
      periodText: "按小时",
      description: "周末一对一课程按课时计费",
    },
  });

  // 6. 演示学生权益(一站式月卡已付款)
  await prisma.studentEntitlement.upsert({
    where: {
      studentId_planId: {
        studentId: student.id,
        planId: smallClassPlan.id,
      },
    },
    update: {},
    create: {
      studentId: student.id,
      planId: smallClassPlan.id,
      startsAt: new Date(new Date().setDate(1)),
      endsAt: new Date(new Date().setMonth(new Date().getMonth() + 1)),
      paid: true,
      remainingHours: 4,
      monthlyOneOnOneHours: 4,
    },
  });

  // 7. 一对一课时权益(演示学生可用于周末一对一预约)
  const oneOnOnePlan = await prisma.packagePlan.findUniqueOrThrow({
    where: { id: "plan-one-on-one-hourly" },
  });
  await prisma.studentEntitlement.upsert({
    where: {
      studentId_planId: {
        studentId: student.id,
        planId: oneOnOnePlan.id,
      },
    },
    update: {},
    create: {
      studentId: student.id,
      planId: oneOnOnePlan.id,
      startsAt: new Date(new Date().setDate(1)),
      endsAt: new Date(new Date().setMonth(new Date().getMonth() + 1)),
      paid: true,
      remainingHours: 4,
      monthlyOneOnOneHours: 4,
    },
  });

  // 8. 课程时段示例(周末一对一为主 + 一个小班时段)
  const slotDateSaturday = nextWeekday(6);
  const slotDateSunday = nextWeekday(0);

  const slots: Array<{
    id: string;
    type: CourseType;
    grade: string;
    subject: Subject;
    date: Date;
    startTime: Date;
    endTime: Date;
    capacity: number;
  }> = [
    {
      id: "slot-sat-math-001",
      type: "ONE_ON_ONE",
      grade: "初二",
      subject: "MATH",
      date: slotDateSaturday,
      startTime: new Date(
        slotDateSaturday.getFullYear(),
        slotDateSaturday.getMonth(),
        slotDateSaturday.getDate(),
        9,
        0,
      ),
      endTime: new Date(
        slotDateSaturday.getFullYear(),
        slotDateSaturday.getMonth(),
        slotDateSaturday.getDate(),
        10,
        0,
      ),
      capacity: 1,
    },
    {
      id: "slot-sat-eng-001",
      type: "ONE_ON_ONE",
      grade: "初二",
      subject: "ENGLISH",
      date: slotDateSaturday,
      startTime: new Date(
        slotDateSaturday.getFullYear(),
        slotDateSaturday.getMonth(),
        slotDateSaturday.getDate(),
        10,
        30,
      ),
      endTime: new Date(
        slotDateSaturday.getFullYear(),
        slotDateSaturday.getMonth(),
        slotDateSaturday.getDate(),
        11,
        30,
      ),
      capacity: 1,
    },
    {
      id: "slot-sun-math-001",
      type: "ONE_ON_ONE",
      grade: "初二",
      subject: "MATH",
      date: slotDateSunday,
      startTime: new Date(
        slotDateSunday.getFullYear(),
        slotDateSunday.getMonth(),
        slotDateSunday.getDate(),
        14,
        0,
      ),
      endTime: new Date(
        slotDateSunday.getFullYear(),
        slotDateSunday.getMonth(),
        slotDateSunday.getDate(),
        15,
        0,
      ),
      capacity: 1,
    },
    {
      id: "slot-smallclass-math-wk",
      type: "SMALL_CLASS",
      grade: "初二",
      subject: "MATH",
      date: slotDateSaturday,
      startTime: new Date(
        slotDateSaturday.getFullYear(),
        slotDateSaturday.getMonth(),
        slotDateSaturday.getDate(),
        16,
        0,
      ),
      endTime: new Date(
        slotDateSaturday.getFullYear(),
        slotDateSaturday.getMonth(),
        slotDateSaturday.getDate(),
        17,
        30,
      ),
      capacity: 5,
    },
  ];

  for (const slot of slots) {
    await prisma.courseSlot.upsert({
      where: { id: slot.id },
      update: {
        type: slot.type,
        grade: slot.grade,
        subject: slot.subject,
        teacherId: teacherProfile.id,
        date: slot.date,
        startTime: slot.startTime,
        endTime: slot.endTime,
        capacity: slot.capacity,
      },
      create: {
        ...slot,
        teacherId: teacherProfile.id,
      },
    });
  }

  console.log("种子数据写入完成:");
  console.log(`  管理员 ${admin.phone} / 老师 ${teacher.phone} / 家庭 ${family.phone}`);
  console.log(`  学生:${student.name}(${student.grade}, ${student.school})`);
  console.log(`  课程时段:${slots.length} 个(周末一对一为主)`);
}

main()
  .catch((error) => {
    console.error("种子数据写入失败:", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
