# MiMo + Manim + HyperFrames 数学课程视频生产线

`video-studio/` 是独立的视频生产子项目，不改变现有 Next.js 教学平台。

## 环境

- Windows Node.js 22+
- `MIMO_API_KEY` 环境变量
- MP3/WAV 声音样本
- WSL2 Ubuntu 24.04：Python、Manim、FFmpeg、LibreOffice、Poppler、LaTeX 和中文字体
- HyperFrames：由渲染命令通过 `npx` 调用

首次初始化：

```powershell
wsl --install -d Ubuntu-24.04
# 重启后，在 WSL 中执行：
npm.cmd run video:setup -- --voice-sample "C:\path\to\voice.mp3"
```

`video:setup` 会输出 WSL 内需要执行的依赖安装命令；它不会自动修改 Windows 系统或强制重启。

## 从教案目录批量生成

目录中的 `.doc/.docx/.pdf/.png/.jpg/.jpeg/.webp/.bmp/.gif` 和常见纯文本会作为教学输入，`.mp4` 只作为风格参考而被排除。

```powershell
npm.cmd run video:make -- `
  --source "C:\Users\huangguan\Desktop\huangguanedu\video-studio\templates" `
  --voice-sample "C:\path\to\voice.mp3" `
  --batch-id geometry-series
```

整门课程按“每一讲目录”断点续跑：

```powershell
$env:QWEN_API_KEY = [Environment]::GetEnvironmentVariable("QWEN_API_KEY", "User")
$env:VIDEO_PLANNER_PROVIDER = "qwen"
npm.cmd run make-course -- `
  --source "D:\mishare\初中数学\数学中考总复习\数学中考总复习" `
  --course-id math-review-course `
  --voice-sample "C:\path\to\voice.mp3" `
  --resume
```

每讲目录会被独立记录；失败讲次写入 `course-manifest.json`，重新执行 `--resume` 可以继续。HyperFrames 最终合成按顺序执行以避免音频临时文件冲突。`--limit 1` 可先试跑一讲，`--start-id lesson-20-advanced` 可从指定讲次开始。

如果只想先生成结构、预览和审查报告，不执行 Manim/HyperFrames：

```powershell
npm.cmd run video:generate -- --source video-studio/templates --batch-id geometry-series
npm.cmd run video:preview -- --batch-id geometry-series
npm.cmd run video:review -- --batch-id geometry-series
```

完整批次输出在 `video-studio/runs/<batch-id>/`：

```text
manifest.json
source/extracted-text.json
source/page-images/
videos/<video-id>/
  source.json
  lesson-map.json
  teaching-plan.json
  geometry-program.json
  storyboard.json
  audio/
  manim/scene.py
  preview/index.html
  render/<video-id>.mp4
  review/report.json
  review/report.html
```

## 保留的单课 YAML 入口

```powershell
npm.cmd run video:make -- `
  --lesson video-studio/lessons/quadratic-extrema.yaml `
  --voice-sample "C:\path\to\voice.wav"

npm.cmd run video:preview -- --id quadratic-extrema
npm.cmd run video:review -- --id quadratic-extrema
npm.cmd run video:render -- --id quadratic-extrema
```

每条批量视频会按内容自动控制在约 90–195 秒：简单知识点不硬凑三分钟，例题和证明保留完整推导。分镜固定包含趣味引入、直觉、证明或原理、主解法、替代解法、易错点、总结和课程引导。没有经过复核的第二种解法时，不会编造步骤，并在报告中写入 `ALT_SOLUTION_UNAVAILABLE`。

视频输出为 720×1280、24fps、中文竖屏；字幕固定在底部并按实际音频时长逐字推进。数学警告、布局风险、Manim 降级和 TTS 缓存命中会写入每条视频的审查报告。
## 内容模型选择

批量教案规划默认优先使用 Qwen：

```powershell
$env:QWEN_API_KEY = "你的百炼密钥"
$env:QWEN_MODEL = "qwen-plus"
$env:VIDEO_PLANNER_PROVIDER = "qwen"
```

如果没有 Qwen 密钥，程序会自动回退到 `MIMO_API_KEY`。也可以显式设置 `VIDEO_PLANNER_PROVIDER=mimo`。Qwen 只负责教案理解、证明讲稿和解法规划；核心几何图形仍由本地模板和 Manim 生成，避免模型输出抽象或不稳定的图形。
