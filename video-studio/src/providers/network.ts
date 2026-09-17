import { setDefaultResultOrder } from "node:dns";

let configured = false;

/**
 * Windows 某些网络环境会优先尝试不可达的 IPv6 地址，导致 Node fetch 超时。
 * 统一优先 IPv4，避免模型和音频接口被网络解析顺序误伤。
 */
export function configureProviderNetwork(): void {
  if (configured || process.platform !== "win32") return;
  setDefaultResultOrder("ipv4first");
  configured = true;
}
