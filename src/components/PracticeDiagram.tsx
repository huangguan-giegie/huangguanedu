import type { PracticeDiagram as Diagram } from "../lib/practice-diagram";

/** Render only validated, structured figures; do not render AI-authored SVG/HTML. */
export function PracticeDiagram({ diagram }: { diagram: Diagram }) {
  const common = {
    fill: "none",
    stroke: "#233c5a",
    strokeWidth: 3,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };
  const label = { fill: "#263b54", fontSize: 17, fontWeight: 600 };
  if (diagram.type === "rectangle") {
    const scale = Math.min(236 / diagram.width, 150 / diagram.height);
    const w = diagram.width * scale;
    const h = diagram.height * scale;
    const x = (480 - w) / 2;
    const y = (285 - h) / 2;
    return (
      <figure className="practice-diagram">
        <svg role="img" aria-label={`长方形 ABCD，长 ${diagram.width} 厘米，宽 ${diagram.height} 厘米`} viewBox="0 0 480 300" className="w-full max-w-[480px]">
          <rect x={x} y={y} width={w} height={h} {...common} fill="#e8f2ff" />
          <g {...label}>
            <text x={x - 15} y={y - 8}>A</text>
            <text x={x + w + 8} y={y - 8}>B</text>
            <text x={x + w + 8} y={y + h + 18}>C</text>
            <text x={x - 15} y={y + h + 18}>D</text>
            <text x={x + w / 2} y={y - 14} textAnchor="middle">{diagram.width} cm</text>
            <text x={x + w + 15} y={y + h / 2} dominantBaseline="middle">{diagram.height} cm</text>
          </g>
          <path d={`M ${x + 12} ${y} V ${y + 12} H ${x}`} stroke="#6083b5" strokeWidth="1.5" fill="none" />
        </svg>
        <figcaption>按题目数值精确绘制 · 图形比例仅供参考</figcaption>
      </figure>
    );
  }
  if (diagram.type === "right_triangle") {
    const [a, b, c] = diagram.triple.split("-").map(Number);
    const unit = Math.min(170 / a, 220 / b);
    const A = { x: 135, y: 235 };
    const B = { x: A.x, y: A.y - a * unit };
    const C = { x: A.x + b * unit, y: A.y };
    return (
      <figure className="practice-diagram">
        <svg role="img" aria-label={`直角三角形 ABC，A 是直角，AB 为 ${a} 厘米，AC 为 ${b} 厘米，BC 为 ${c} 厘米`} viewBox="0 0 480 300" className="w-full max-w-[480px]">
          <path d={`M ${A.x} ${A.y} L ${B.x} ${B.y} L ${C.x} ${C.y} Z`} {...common} fill="#e8f2ff" />
          <path d={`M ${A.x} ${A.y - 18} H ${A.x + 18} V ${A.y}`} fill="none" stroke="#6083b5" strokeWidth="2" />
          <g {...label}>
            <text x={A.x - 17} y={A.y + 19}>A</text>
            <text x={B.x - 17} y={B.y - 7}>B</text>
            <text x={C.x + 7} y={C.y + 19}>C</text>
            <text x={A.x - 14} y={(A.y + B.y) / 2} textAnchor="end">{a} cm</text>
            <text x={(A.x + C.x) / 2} y={A.y + 26} textAnchor="middle">{b} cm</text>
            <text x={(B.x + C.x) / 2 + 15} y={(B.y + C.y) / 2 - 12}>{c} cm</text>
          </g>
        </svg>
        <figcaption>直角、边长及顶点由同一组勾股数确定</figcaption>
      </figure>
    );
  }
  // Grid: x in [-5,5], y in [-8,8]. Points A and B are always visible.
  const xPos = (x: number) => 240 + x * 36;
  const yPos = (y: number) => 150 - y * 16;
  const { slope, intercept } = diagram;
  const yB = slope + intercept;
  return (
    <figure className="practice-diagram">
      <svg role="img" aria-label={`直线经过点 A，坐标为零与 ${intercept}；点 B，坐标为一与 ${yB}`} viewBox="0 0 480 300" className="w-full max-w-[480px]">
        <defs><clipPath id="practice-coordinate-clip"><rect x="59" y="16" width="362" height="268" /></clipPath></defs>
        <rect x="58" y="16" width="364" height="268" fill="#fff" stroke="#dbe6f2" />
        {Array.from({ length: 11 }, (_, i) => i - 5).map((x) => (
          <line key={`x${x}`} x1={xPos(x)} y1="16" x2={xPos(x)} y2="284" stroke="#e7edf5" />
        ))}
        {Array.from({ length: 17 }, (_, i) => i - 8).map((y) => (
          <line key={`y${y}`} x1="58" y1={yPos(y)} x2="422" y2={yPos(y)} stroke="#e7edf5" />
        ))}
        <path d={`M 58 150 H 422 M 240 284 V 16`} stroke="#7188a4" strokeWidth="1.5" />
        <g clipPath="url(#practice-coordinate-clip)">
          <line x1={xPos(-5)} y1={yPos(-5 * slope + intercept)} x2={xPos(5)} y2={yPos(5 * slope + intercept)} stroke="#ed8750" strokeWidth="3" />
        </g>
        <circle cx={xPos(0)} cy={yPos(intercept)} r="5" fill="#245b9b" stroke="white" strokeWidth="2" />
        <circle cx={xPos(1)} cy={yPos(yB)} r="5" fill="#245b9b" stroke="white" strokeWidth="2" />
        <g fill="#263b54" fontSize="14" fontWeight="600">
          <text x={xPos(0) - 12} y={yPos(intercept) - 11} textAnchor="end">{`A(0, ${intercept})`}</text>
          <text x={xPos(1) + 12} y={yPos(yB) - 11}>{`B(1, ${yB})`}</text>
          <text x="428" y="155">x</text>
          <text x="246" y="14">y</text>
          <text x="226" y="166">0</text>
        </g>
      </svg>
      <figcaption>坐标与直线斜率均由题目参数计算</figcaption>
    </figure>
  );
}
