"use client";

import { useEffect, useState } from "react";

import { api } from "../components/api";
import { AuthGuard, type SafeUser } from "../components/AuthGuard";
import { LinkList } from "../components/LinkList";

function Dashboard() {
  const [user, setUser] = useState<SafeUser | null>(null);
  const [studentName, setStudentName] = useState("");

  useEffect(() => {
    api.get<{ user: SafeUser }>("/api/v1/auth/me").then(({ user }) => {
      setUser(user);
      if (user.role === "FAMILY") {
        api
          .get<{ student: { name: string } }>("/api/v1/me/student")
          .then((d) => setStudentName(d.student.name))
          .catch(() => undefined);
      }
    });
  }, []);

  if (!user) {
    return null;
  }

  if (user.role === "FAMILY") {
    return (
      <div className="space-y-8">
        <div>
          <h1 className="text-2xl font-bold">欢迎，{studentName || "同学"}</h1>
          <p className="mt-1 text-sm text-[#1e2a3a]/60">
            月卡包含周一至周四线下小班课，周末一对一可在网页预约
          </p>
        </div>
        <LinkList
          items={[
            { href: "/wrong-questions/new", label: "上传错题", description: "拍照上传一道题，AI 分析并生成解析" },
            { href: "/wrong-questions", label: "我的错题本", description: "查看历史错题、知识点与掌握情况" },
            { href: "/practice-sets", label: "数学模拟题", description: "查看老师生成的针对性数学练习" },
            { href: "/bookings", label: "预约课程", description: "查看周末一对一可预约时段" },
            { href: "/reports", label: "学习总结", description: "查看老师发布的周报/月报/学期总结" },
            { href: "/account", label: "账户设置", description: "查看账户资料、修改密码或退出登录" },
          ]}
        />
      </div>
    );
  }
  if (user.role === "TEACHER") {
    return (
      <div className="space-y-8">
        <h1 className="text-2xl font-bold">老师工作台</h1>
        <LinkList
          items={[
            { href: "/teacher/review", label: "待复核 AI 错题", description: "审核学生错题分析并修订" },
            { href: "/teacher/students", label: "我的学生", description: "查看负责学生列表" },
            { href: "/teacher/summaries", label: "学习总结审核", description: "审核并发布负责学生的学习总结" },
            { href: "/practice-sets", label: "生成数学模拟题", description: "按学生薄弱知识点生成 3–5 道练习" },
          ]}
        />
      </div>
    );
  }
  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-bold">管理后台</h1>
      <LinkList
        items={[
          { href: "/admin/students", label: "学生管理", description: "查看与修改学生信息" },
          { href: "/practice-sets", label: "生成数学模拟题", description: "为任意学生生成针对性数学练习" },
          { href: "/admin/teachers", label: "老师管理", description: "创建老师账号与重置密码" },
          { href: "/account", label: "账户设置", description: "查看账户资料、修改密码或退出登录" },
          { href: "/admin/slots", label: "课程时段", description: "管理小班与一对一课程时段" },
        ]}
      />
    </div>
  );
}

export default function Home() {
  return (
    <AuthGuard>
      <Dashboard />
    </AuthGuard>
  );
}
