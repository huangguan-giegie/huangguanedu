"""从用户提供的试卷生成题库原卷图片；目录由命令行传入，不复制答案专册。"""
import argparse
import json
import subprocess
import tempfile
from pathlib import Path
from PIL import Image


def main():
    parser = argparse.ArgumentParser(description="导入数学实验室原卷图片")
    parser.add_argument("--catalog", required=True, type=Path)
    parser.add_argument("--gaokao-dir", required=True, type=Path)
    parser.add_argument("--middle-pdf", required=True, type=Path)
    parser.add_argument("--poppler", required=True, type=Path)
    parser.add_argument("--output", type=Path, default=Path("public/exam-bank"))
    args = parser.parse_args()
    catalog = json.loads(args.catalog.read_text(encoding="utf-8"))
    manifest = []
    with tempfile.TemporaryDirectory(prefix="hg-exam-bank-") as folder:
        for paper in catalog["papers"]:
            source = args.middle_pdf if paper["stage"] == "中考" else args.gaokao_dir / paper["file"]
            if not source.is_file():
                raise FileNotFoundError(f"缺少原卷：{source}")
            pages = sorted({page for q in catalog["questions"] if q["paper"] == paper["id"] for page in q["pages"]})
            output = args.output / paper["id"]
            output.mkdir(parents=True, exist_ok=True)
            for page in pages:
                prefix = Path(folder) / "page"
                subprocess.run([str(args.poppler), "-f", str(page), "-l", str(page), "-r", "200", "-singlefile", "-png", str(source), str(prefix)], check=True, capture_output=True)
                with Image.open(prefix.with_suffix(".png")) as img:
                    image = img.convert("RGB")
                    # 只裁掉空白页边，保留原题公式、图形、页码和来源标记。
                    ink = image.convert("L").point(lambda value: 255 if value < 150 else 0)
                    bbox = ink.getbbox()
                    if bbox:
                        margin = 45
                        image = image.crop((max(0, bbox[0] - margin), max(0, bbox[1] - margin), min(image.width, bbox[2] + margin), min(image.height, bbox[3] + margin)))
                    target = output / f"page-{page}.webp"
                    image.save(target, "WEBP", quality=92, method=6)
                    manifest.append({"paper": paper["id"], "page": page, "file": paper["file"], "asset": f"/exam-bank/{paper['id']}/page-{page}.webp", "width": image.width, "height": image.height, "dpi": 200})
            print(f"{paper['id']}：{len(pages)}页", flush=True)
    (args.output / "sources.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
