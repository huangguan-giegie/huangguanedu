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
        <section className="academy-hero">
          <span className="academy-eyebrow">MY LEARNING SPACE · 学习中心</span>
          <h1>欢迎回来，{studentName || "同学"} <span aria-hidden>✦</span></h1>
          <p>从今天的复习开始，循序提升数学能力。错题分析、针对性练习和课程预约，都在同一个学习空间。</p>
        </section>
        <div className="academy-section-heading"><h2>探索你的学习工具</h2><span className="text-xs text-slate-500">选择一个入口开始</span></div>
        <LinkList
          items={[
            { href: "/wrong-questions/new", label: "上传错题", description: "拍照上传一道题，AI 分析并生成解析" },
            { href: "/wrong-questions", label: "我的错题本", description: "查看历史错题、知识点与掌握情况" },
            { href: "/review", label: "今日复习", description: "按掌握度和复习间隔生成今天最该练的内容" },
            { href: "/practice", label: "错题模拟题", description: "作答针对性练习、自动判题并向 AI 老师提问" },
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
        <section className="academy-hero"><span className="academy-eyebrow">TEACHER WORKSPACE · 教学管理</span><h1>老师工作台</h1><p>从复核错题到制定精准练习，让每一个教学决策都有依据。</p></section><div className="academy-section-heading"><h2>教学工具</h2></div>
        <LinkList
          items={[
            { href: "/teacher/review", label: "待复核 AI 错题", description: "审核学生错题分析并修订" },
            { href: "/teacher/students", label: "我的学生", description: "查看负责学生列表" },
            { href: "/teacher/summaries", label: "学习总结审核", description: "审核并发布负责学生的学习总结" },
            { href: "/practice", label: "生成错题模拟题", description: "基于学生错题生成数学或英语变式练习" },
          ]}
        />
      </div>
    );
  }
  return (
    <div className="space-y-8">
      <section className="academy-hero"><span className="academy-eyebrow">ADMIN CONSOLE · 管理中心</span><h1>管理后台</h1><p>统一管理学生、老师与课程计划，跟踪学习服务运转情况。</p></section><div className="academy-section-heading"><h2>管理工具</h2></div>
      <LinkList
        items={[
          { href: "/admin/students", label: "学生管理", description: "查看与修改学生信息" },
          { href: "/practice", label: "生成错题模拟题", description: "为任意学生生成针对性错题模拟题" },
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
