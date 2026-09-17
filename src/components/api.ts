// 客户端 API 封装：自动携带 CSRF 头，401 时跳转登录
"use client";

const CSRF_COOKIE_NAME = "yy_csrf";

function csrfToken(): string | null {
  const match = document.cookie
    .split("; ")
    .find((c) => c.startsWith(`${CSRF_COOKIE_NAME}=`));
  return match ? match.split("=")[1] ?? null : null;
}

async function request<T>(
  url: string,
  options: {
    method?: string;
    body?: unknown;
    formData?: FormData;
  } = {},
): Promise<T> {
  const headers: Record<string, string> = {};
  const token = csrfToken();
  if (token) {
    headers["X-CSRF-Token"] = token;
  }
  if (options.body !== undefined && !options.formData) {
    headers["Content-Type"] = "application/json";
  }

  const response = await fetch(url, {
    method: options.method ?? "GET",
    headers,
    credentials: "same-origin",
    body:
      options.formData ?? (options.body !== undefined
        ? JSON.stringify(options.body)
        : undefined),
  });

  if (response.status === 401) {
    throw new Error("未登录");
  }

  const data = (await response.json().catch(() => null)) as
    | { success: true; data: T }
    | { success: false; error: { code: string; message: string } }
    | null;
  if (!data || !data.success) {
    throw new Error(
      (data as { error?: { message?: string } })?.error?.message ??
        `请求失败（${response.status}）`,
    );
  }
  return data.data;
}

export const api = {
  get: <T>(url: string) => request<T>(url),
  post: <T>(url: string, body?: unknown) =>
    request<T>(url, { method: "POST", body }),
  patch: <T>(url: string, body?: unknown) =>
    request<T>(url, { method: "PATCH", body }),
  del: <T>(url: string) => request<T>(url, { method: "DELETE" }),
  upload: <T>(url: string, formData: FormData) =>
    request<T>(url, { method: "POST", formData }),
};
