import path from "node:path";

export function normalizeWslPath(value: string): string {
  const normalized = value.replaceAll("\\", "/");
  const driveMatch = normalized.match(/^([A-Za-z]):\/(.*)$/);
  if (!driveMatch) return normalized;
  return `/mnt/${driveMatch[1].toLowerCase()}/${driveMatch[2]}`;
}

export function buildWslSetupCommand(): string {
  return [
    "sudo apt-get update",
    "sudo apt-get install -y python3 python3-venv python3-pip ffmpeg libreoffice-writer-nogui poppler-utils fonts-noto-cjk texlive-xetex texlive-latex-extra",
    "python3 -m venv ~/.video-studio-venv",
    "~/.video-studio-venv/bin/pip install --upgrade pip manim",
  ].join(" && ");
}

export function buildWslBashCommand(command: string, paths: string[] = []): string[] {
  const normalizedPaths = paths.map(normalizeWslPath);
  const fullCommand = [command, ...normalizedPaths].join(" ");
  return ["wsl.exe", "--", "bash", "-lc", fullCommand];
}

export function toWslWorkingDirectory(value: string): string {
  return path.posix.normalize(normalizeWslPath(value));
}
