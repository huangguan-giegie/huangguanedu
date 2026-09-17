"use client";

import { useEffect, useState } from "react";

import { api } from "../../components/api";
import { AuthGuard } from "../../components/AuthGuard";

interface CourseSlot {
  id: string;
  subject: "MATH" | "ENGLISH";
  date: string;
  startTime: string;
  endTime: string;
  location: string;
  teacherName: string;
}

function Bookings() {
  const [slots, setSlots] = useState<CourseSlot[]>([]);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    api
      .get<{ slots: CourseSlot[]; smallClassNote: string }>("/api/v1/course-slots")
      .then((d) => {
        if (!cancelled) {
          setSlots(d.slots);
        }
      })
      .catch((e) => {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "加载失败");
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function book(slotId: string) {
    setMessage("");
    setError("");
    try {
      await api.post("/api/v1/bookings", { slotId });
      setMessage("预约成功，等待老师确认");
      // 刷新时段
      const d = await api.get<{ slots: CourseSlot[] }>("/api/v1/course-slots");
      setSlots(d.slots);
    } catch (e) {
      setError(e instanceof Error ? e.message : "预约失败");
    }
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">预约课程</h1>
      <p className="text-sm text-[#1e2a3a]/60">
        月卡包含周一至周四线下小班课；以下是可预约的周末一对一课程
      </p>
      {message && <div className="rounded bg-green-100 p-3 text-sm text-green-700">{message}</div>}
      {error && <div className="rounded bg-red-100 p-3 text-sm text-red-700">{error}</div>}
      <div className="grid gap-3 sm:grid-cols-2">
        {slots.map((slot) => (
          <div key={slot.id} className="rounded-xl border border-[#1e2a3a]/10 bg-white p-4">
            <div className="font-semibold">
              {slot.subject === "MATH" ? "数学" : "英语"}一对一
            </div>
            <div className="mt-1 text-sm text-[#1e2a3a]/70">
              {new Date(slot.startTime).toLocaleString("zh-CN")} -{" "}
              {new Date(slot.endTime).toLocaleTimeString("zh-CN", {
                hour: "2-digit",
                minute: "2-digit",
              })}
            </div>
            <div className="text-sm text-[#1e2a3a]/70">
              老师：{slot.teacherName} ｜ 地点：{slot.location}
            </div>
            <button
              className="mt-3 rounded-lg bg-[#e8863a] px-4 py-1.5 text-sm font-semibold text-white"
              onClick={() => book(slot.id)}
            >
              预约
            </button>
          </div>
        ))}
        {slots.length === 0 && !error && (
          <p className="text-sm text-[#1e2a3a]/50">暂无可预约时段</p>
        )}
      </div>
    </div>
  );
}

export default function BookingsPage() {
  return (
    <AuthGuard>
      <Bookings />
    </AuthGuard>
  );
}
