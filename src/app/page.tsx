"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { api } from "../components/api";
import { AuthGuard, type SafeUser } from "../components/AuthGuard";
import { Icon } from "../components/icons";
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

  // 三个角色的欢迎语是 L0 展示标题，不是页面的 h1 —— 页面的 h1 由 AuthGuard
  // 的 .app-title 承担（"学习总览"）。原先这里是三个 <h1>，源码层面同级。
  if (user.role === "FAMILY") {
    return (
      <div>
        <section className="welcome-panel">
          <div className="welcome-copy">
            <p className="eyebrow">YOUR LEARNING STORY · 本周练习</p>
            <p className="welcome-title">错题，<br />是下一次做对的线索。</p>
            <p>
              欢迎回来，{studentName || "同学"}。月卡包含周一至周四线下小班课，
              周末一对一可在网页预约。
            </p>
            <Link href="/wrong-questions/new" className="welcome-action">
              <Icon name="upload" size={16} />
              上传一道错题
              <Icon name="arrow-right" size={16} />
            </Link>
          </div>
          {/* 装饰层：整块 aria-hidden，里面的符号对读屏与放大镜用户零信息量 */}
          <div className="welcome-art welcome-hud" aria-hidden="true">
            <span className="art-card"><Icon name="wrong-question" size={44} /></span>
            <i className="art-bar" />
            <i className="art-bar" />
            <i className="art-bar" />
          </div>
        </section>
        <h2 className="section-heading">
          <span>从这里继续</span>
          <small>把今天的小进步收进学习记录</small>
        </h2>
        <LinkList
          items={[
            { href: "/wrong-questions", label: "我的错题本", description: "按学科整理错题，复习知识点与掌握情况", icon: "wrong-question", tone: "primary" },
            { href: "/practice", label: "错题模拟练习", description: "选择英语或数学错题，生成同知识点的变式练习", icon: "practice", tone: "warm" },
            { href: "/review", label: "智能复习", description: "按遗忘曲线安排今天最该练的知识点", icon: "smart-review", tone: "success" },
            { href: "/bookings", label: "预约课程", description: "查看周末一对一课程的可预约时段", icon: "booking", tone: "info" },
            { href: "/reports", label: "学习总结", description: "阅读老师发布的周报、月报与学期总结", icon: "report", tone: "primary" },
          ]}
        />
        <div className="home-note">
          <Icon name="sparkle" size={16} />
          <span>每道错题都是线索，<b>复习一步，进步一步。</b></span>
        </div>
      </div>
    );
  }

  if (user.role === "TEACHER") {
    return (
      <div>
        <section className="welcome-panel">
          <div className="welcome-copy">
            <p className="eyebrow">TEACHER DESK · 今天的教学安排</p>
            <p className="welcome-title">让每条建议，<br />都成为有用的反馈。</p>
            <p>复核 AI 错题分析，或打开学生列表继续跟进学习情况。</p>
            <Link href="/teacher/review" className="welcome-action">
              <Icon name="pending-review" size={16} />
              查看待复核错题
              <Icon name="arrow-right" size={16} />
            </Link>
          </div>
          <div className="welcome-art welcome-hud" aria-hidden="true">
            <span className="art-card"><Icon name="check" size={44} /></span>
            <i className="art-bar" />
            <i className="art-bar" />
            <i className="art-bar" />
          </div>
        </section>
        <h2 className="section-heading"><span>老师工作台</span><small>常用教学入口</small></h2>
        <LinkList
          items={[
            { href: "/teacher/review", label: "待复核 AI 错题", description: "审核学生错题分析并补充老师建议", icon: "pending-review", tone: "warning" },
            { href: "/teacher/students", label: "我的学生", description: "查看负责学生的年级与学校信息", icon: "students", tone: "primary" },
            { href: "/practice", label: "错题模拟练习", description: "为学生生成英语、数学练习和几何函数图形", icon: "practice", tone: "warm" },
            { href: "/teacher/summaries", label: "学习总结审核", description: "审核周报、月报与学期总结并发布给家庭", icon: "summary-review", tone: "info" },
          ]}
        />
      </div>
    );
  }

  return (
    <div>
      <section className="welcome-panel">
        <div className="welcome-copy">
          <p className="eyebrow">ACADEMY CONTROL · 管理工作台</p>
          <p className="welcome-title">课程与学生，<br />都在这里有序展开。</p>
          <p>管理学生和老师账户，安排每一节小班课与一对一课程。</p>
          <Link href="/admin/students" className="welcome-action">
            <Icon name="student-management" size={16} />
            打开学生管理
            <Icon name="arrow-right" size={16} />
          </Link>
        </div>
        <div className="welcome-art welcome-hud" aria-hidden="true">
          <span className="art-card"><Icon name="sparkle" size={44} /></span>
          <i className="art-bar" />
          <i className="art-bar" />
          <i className="art-bar" />
        </div>
      </section>
      <h2 className="section-heading"><span>管理入口</span><small>账户与课程安排</small></h2>
      <LinkList
        items={[
          { href: "/admin/students", label: "学生管理", description: "查看学生资料与负责老师", icon: "student-management", tone: "primary" },
          { href: "/admin/teachers", label: "老师管理", description: "创建老师账号与重置登录密码", icon: "teacher-management", tone: "info" },
          { href: "/admin/slots", label: "课程时段", description: "安排小班课和一对一可预约时段", icon: "slots", tone: "primary" },
          { href: "/practice", label: "错题模拟练习", description: "按学生错题生成数学、英语练习，查看几何与函数图", icon: "practice", tone: "warm" },
          { href: "/teacher/review", label: "错题审核", description: "复核 AI 识别结果和解题过程", icon: "pending-review", tone: "info" },
          { href: "/teacher/summaries", label: "学习总结审核", description: "生成、审核并发布学生学习总结", icon: "summary-review", tone: "primary" },
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
