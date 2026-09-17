// 统一 API 响应包装类型：所有 /api/v1 接口返回该结构
export type ApiResponse<T> =
  | { success: true; data: T }
  | { success: false; error: { code: string; message: string } };
