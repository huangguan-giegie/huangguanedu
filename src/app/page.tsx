"use client";

import Link from "next/link";
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
          .then((data) => setStudentName(data.student.name))
          .catch(() => undefined);
      }
    });
  }, []);

  if (!user) return null;

  if (user.role === "FAMILY") {
    return (
      <div className="dashboard-page">
        <section className="welcome-panel">
          <div className="welcome-copy">
            <p className="eyebrow">YOUR LEARNING STORY · 本周练习</p>
            <h1>错题，<br />是下一次做对的线索。</h1>
            <p>
              欢迎回来，{studentName || "同学"}。月卡包含周一至周四线下小班课，
              周末一对一可在网页预约。
            </p>
            <Link href="/wrong-questions/new" className="welcome-action">＋ 上传一道错题　→</Link>
          </div>
          <div className="welcome-art" aria-hidden="true">
            <span className="art-card">?</span>
            <i className="art-bar" />
            <i className="art-bar" />
            <i className="art-bar" />
          </div>
        </section>
        <div className="section-heading">
          <span>从这里继续</span>
          <small>把今天的小进步收进学习记录</small>
        </div>
        <LinkList
          items={[
            { href: "/wrong-questions", label: "我的错题本", description: "按学科整理错题，复习知识点与掌握情况" },
            { href: "/practice", label: "错题模拟练习", description: "选择英语或数学错题，生成同知识点的变式练习" },
            { href: "/bookings", label: "预约课程", description: "查看周末一对一课程的可预约时段" },
            { href: "/reports", label: "学习总结", description: "阅读老师发布的周报、月报与学期总结" },
          ]}
        />
        <div className="home-note"><span aria-hidden="true">✳</span><span>每道错题都是线索，<b>复习一步，进步一步。</b></span></div>
      </div>
    );
  }

  if (user.role === "TEACHER") {
    return (
      <div className="dashboard-page">
        <section className="welcome-panel">
          <div className="welcome-copy">
            <p className="eyebrow">TEACHER DESK · 今天的教学安排</p>
            <h1>让每条建议，<br />都成为有用的反馈。</h1>
            <p>复核 AI 错题分析，或打开学生列表继续跟进学习情况。</p>
            <Link href="/teacher/review" className="welcome-action">查看待复核错题　→</Link>
          </div>
          <div className="welcome-art" aria-hidden="true"><span className="art-card">✓</span><i className="art-bar" /><i className="art-bar" /><i className="art-bar" /></div>
        </section>
        <div className="section-heading"><span>老师工作台</span><small>常用教学入口</small></div>
        <LinkList
          items={[
            { href: "/teacher/review", label: "待复核 AI 错题", description: "审核学生错题分析并补充老师建议" },
            { href: "/teacher/students", label: "我的学生", description: "查看负责学生的年级与学校信息" },
            { href: "/practice", label: "错题模拟练习", description: "为学生生成英语、数学练习和几何函数图形" },
            { href: "/teacher/summaries", label: "学习总结审核", description: "审核周报、月报与学期总结并发布给家庭" },
          ]}
        />
      </div>
    );
  }

  return (
    <div className="dashboard-page">
      <section className="welcome-panel">
        <div className="welcome-copy">
          <p className="eyebrow">ACADEMY CONTROL · 管理工作台</p>
          <h1>课程与学生，<br />都在这里有序展开。</h1>
          <p>管理学生和老师账户，安排每一节小班课与一对一课程。</p>
          <Link href="/admin/students" className="welcome-action">打开学生管理　→</Link>
        </div>
        <div className="welcome-art" aria-hidden="true"><span className="art-card">✦</span><i className="art-bar" /><i className="art-bar" /><i className="art-bar" /></div>
      </section>
      <div className="section-heading"><span>管理入口</span><small>账户与课程安排</small></div>
      <LinkList
        items={[
          { href: "/admin/students", label: "学生管理", description: "查看学生资料与负责老师" },
          { href: "/admin/teachers", label: "老师管理", description: "创建老师账号与重置登录密码" },
          { href: "/admin/slots", label: "课程时段", description: "安排小班课和一对一可预约时段" },
          { href: "/practice", label: "错题模拟练习", description: "按学生错题生成数学、英语练习，查看几何与函数图" },
          { href: "/teacher/review", label: "错题审核", description: "复核 AI 识别结果和解题过程" },
          { href: "/teacher/summaries", label: "学习总结审核", description: "生成、审核并发布学生学习总结" },
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
