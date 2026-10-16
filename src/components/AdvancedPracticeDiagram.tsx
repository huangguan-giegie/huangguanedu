"use client";

import { useId, type ReactNode } from "react";
import type { AdvancedDiagram } from "../lib/practice-advanced-diagram";

type Point = { x: number; y: number };
const ink = "#23405b";
const blue = "#286aaf";
const orange = "#ed8b55";
const teal = "#188fa1";
const label = { fill: ink, fontSize: 16, fontWeight: 650 };
const degrees = (value: number) => value * Math.PI / 180;
const polar = (cx: number, cy: number, r: number, angle: number): Point => ({
  x: cx + r * Math.cos(degrees(angle)),
  y: cy + r * Math.sin(degrees(angle)),
});

function Frame({ children, description, caption }: {
  children: ReactNode;
  description: string;
  caption: string;
}) {
  return (
    <figure className="practice-diagram">
      <svg viewBox="0 0 480 300" role="img" aria-label={description} className="w-full max-w-[480px]">
        {children}
      </svg>
      <figcaption>{caption}</figcaption>
    </figure>
  );
}

function MarkedPoint({ x, y, text, dx = 9, dy = -10, color = blue }: Point & {
  text: string; dx?: number; dy?: number; color?: string;
}) {
  return <g>
    <circle cx={x} cy={y} r="4.8" fill={color} stroke="white" strokeWidth="1.5" />
    <text x={x + dx} y={y + dy} {...label}>{text}</text>
  </g>;
}

// Graph coordinates are mathematically affine in both axes. Clips prevent
// the extended curves from covering the formula labels or other content.
const bounds = { xMin: -6, xMax: 6, yMin: -11, yMax: 11 };
const gx = (x: number) => 55 + (x - bounds.xMin) * 370 / (bounds.xMax - bounds.xMin);
const gy = (y: number) => 282 - (y - bounds.yMin) * 264 / (bounds.yMax - bounds.yMin);
type Curve = { name: string; color: string; fn: (x: number) => number; dashed?: boolean };
type GraphPoint = Point & { label: string };

function Graph({ curves, points, axisX, description, caption }: {
  curves: Curve[]; points: GraphPoint[]; axisX?: number;
  description: string; caption: string;
}) {
  const clipId = useId();
  return (
    <Frame description={description} caption={caption}>
      <defs><clipPath id={clipId}><rect x="55" y="18" width="370" height="264" /></clipPath></defs>
      <rect x="55" y="18" width="370" height="264" fill="#fff" stroke="#dbe6f2" />
      {Array.from({ length: 13 }, (_, i) => i - 6).map((x) => (
        <g key={x}>
          <line x1={gx(x)} y1="18" x2={gx(x)} y2="282" stroke="#e9eff5" />
          {x !== 0 && x % 2 === 0 && <text x={gx(x)} y={gy(0) + 15} fontSize="11" fill="#64788f" textAnchor="middle">{x}</text>}
        </g>
      ))}
      {Array.from({ length: 11 }, (_, i) => (i - 5) * 2).map((y) => (
        <g key={y}>
          <line x1="55" y1={gy(y)} x2="425" y2={gy(y)} stroke="#e9eff5" />
          {y !== 0 && y % 4 === 0 && <text x={gx(0) - 8} y={gy(y) + 4} fontSize="11" fill="#64788f" textAnchor="end">{y}</text>}
        </g>
      ))}
      <path d={`M 55 ${gy(0)} H 425 M ${gx(0)} 18 V 282`} stroke="#637e98" strokeWidth="1.6" fill="none" />
      <text x="429" y={gy(0) - 5} fontSize="14" fill={ink}>x</text>
      <text x={gx(0) + 8} y="15" fontSize="14" fill={ink}>y</text>
      <text x={gx(0) - 10} y={gy(0) + 14} fontSize="11" fill={ink}>0</text>
      <g clipPath={`url(#${clipId})`}>
        {axisX !== undefined && <line x1={gx(axisX)} y1="18" x2={gx(axisX)} y2="282" stroke="#8795ad" strokeWidth="1.8" strokeDasharray="6 5" />}
        {curves.map((curve) => (
          <path key={curve.name}
            d={Array.from({ length: 181 }, (_, i) => {
              const x = -6 + i / 15;
              return `${i === 0 ? "M" : "L"}${gx(x).toFixed(2)},${gy(curve.fn(x)).toFixed(2)}`;
            }).join(" ")}
            fill="none" stroke={curve.color} strokeWidth="2.8" strokeLinecap="round"
            strokeDasharray={curve.dashed ? "7 5" : undefined}
          />
        ))}
      </g>
      {points.map((p) => (
        <MarkedPoint key={p.label} x={gx(p.x)} y={gy(p.y)} text={p.label}
          dx={p.x >= 3 ? -30 : 11} dy={p.y >= 8 ? 20 : -10} />
      ))}
      <g>
        {curves.map((curve, i) => (
          <g key={curve.name}>
            <line x1={75 + i * 170} y1="293" x2={102 + i * 170} y2="293" stroke={curve.color} strokeWidth="3" />
            <text x={109 + i * 170} y="297" fontSize="12" fill={ink}>{curve.name}</text>
          </g>
        ))}
      </g>
    </Frame>
  );
}

export function AdvancedPracticeDiagram({ diagram }: { diagram: AdvancedDiagram }) {
  if (diagram.type === "circle_sector") {
    const cx = 235, cy = 148, r = 98;
    const a = polar(cx,cy,r,-90);
    const b = polar(cx,cy,r,-90 + diagram.centralAngle);
    const smallArc = diagram.centralAngle > 180 ? 1 : 0;
    const sector = `M ${cx} ${cy} L ${a.x} ${a.y} A ${r} ${r} 0 ${smallArc} 1 ${b.x} ${b.y} Z`;
    const p = polar(cx,cy,34,-90 + diagram.centralAngle / 2);
    return (
      <Frame description={`圆 O，半径 ${diagram.radius} 厘米，圆心角 AOB 为 ${diagram.centralAngle} 度`} caption="圆心角、半径与扇形均由同一参数确定">
        <circle cx={cx} cy={cy} r={r} stroke="#a6bed1" strokeWidth="2" fill="#f9fcff" />
        <path d={sector} fill="#d6eef0" stroke={teal} strokeWidth="2" />
        <path d={`M ${a.x} ${a.y} A ${r} ${r} 0 ${smallArc} 1 ${b.x} ${b.y}`} fill="none" stroke={orange} strokeWidth="4" />
        <path d={`M ${cx} ${cy - 27} A 27 27 0 0 1 ${polar(cx,cy,27,-90+diagram.centralAngle).x} ${polar(cx,cy,27,-90+diagram.centralAngle).y}`} fill="none" stroke={blue} strokeWidth="1.8" />
        <text x={p.x + 12} y={p.y + 4} fontSize="15" fill={ink}>{diagram.centralAngle}°</text>
        <text x={cx - 36} y={cy - r / 2} fontSize="14" fill={ink}>{diagram.radius} cm</text>
        <MarkedPoint x={cx} y={cy} text="O" dx={-19} dy={18}/>
        <MarkedPoint {...a} text="A" dx={-9} dy={-12}/>
        <MarkedPoint {...b} text="B" dx={14} dy={12}/>
      </Frame>
    );
  }
  if (diagram.type === "circle_inscribed_angle") {
    const cx = 240, cy = 150, r = 107;
    const A = polar(cx,cy,r,-40);
    const B = polar(cx,cy,r,-40 + diagram.centralAngle);
    const C = polar(cx,cy,r,160 + diagram.centralAngle / 2);
    const aAngle = -40, bAngle = aAngle + diagram.centralAngle;
    const arcB = polar(cx,cy,32,bAngle);
    const radA = polar(cx,cy,32,aAngle);
    const textPos = polar(cx,cy,56,(aAngle+bAngle)/2);
    return (
      <Frame description={`圆 O，圆心角 AOB 为 ${diagram.centralAngle} 度；C 位于另一段圆弧上，连接 CA 与 CB`} caption="C 不在劣弧 AB 上，圆周角严格对应相同的弧">
        <circle cx={cx} cy={cy} r={r} stroke="#5d839d" strokeWidth="2.5" fill="#f8fcff" />
        <path d={`M ${A.x} ${A.y} L ${cx} ${cy} L ${B.x} ${B.y}`} stroke={teal} strokeWidth="2.5" fill="none" />
        <path d={`M ${A.x} ${A.y} L ${C.x} ${C.y} L ${B.x} ${B.y}`} stroke={blue} strokeWidth="2.6" fill="none" />
        <path d={`M ${radA.x} ${radA.y} A 32 32 0 0 1 ${arcB.x} ${arcB.y}`} stroke={orange} strokeWidth="2.5" fill="none" />
        <text x={textPos.x + 3} y={textPos.y + 5} fontSize="15" fill={ink}>{diagram.centralAngle}°</text>
        <MarkedPoint x={cx} y={cy} text="O" dx={-20} dy={-10}/>
        <MarkedPoint {...A} text="A" dx={10} dy={-8}/>
        <MarkedPoint {...B} text="B" dx={12} dy={15}/>
        <MarkedPoint {...C} text="C" dx={-24} dy={-10}/>
      </Frame>
    );
  }
  if (diagram.type === "triangle_altitude") {
    const xa = 72, xb = 412, baseline = 244, top = 55;
    const ratio = diagram.foot === "LEFT" ? .3 : diagram.foot === "RIGHT" ? .7 : .5;
    const footX = xa + (xb-xa) * ratio;
    return (
      <Frame description={`三角形 ABC，AB 底边为 ${diagram.base} 厘米，CD 是垂直于 AB 的高，为 ${diagram.height} 厘米`} caption="CD 是垂足 D 对应的辅助高线，直角关系精确构造">
        <path d={`M ${xa} ${baseline} L ${footX} ${top} L ${xb} ${baseline} Z`} stroke={ink} strokeWidth="3" fill="#edf6fe" />
        <path d={`M ${footX} ${top} V ${baseline}`} stroke={teal} strokeWidth="2.8" strokeDasharray="7 5" />
        <path d={`M ${footX} ${baseline-14} H ${footX+14} V ${baseline}`} fill="none" stroke={orange} strokeWidth="2" />
        <g {...label}>
          <text x={xa-16} y={baseline+22}>A</text><text x={xb+6} y={baseline+22}>B</text>
          <text x={footX-6} y={top-12}>C</text><text x={footX+7} y={baseline+20}>D</text>
          <text x={(xa+xb)/2} y={baseline+40} textAnchor="middle">{diagram.base} cm</text>
          <text x={footX+14} y={(top+baseline)/2}>{diagram.height} cm</text>
        </g>
      </Frame>
    );
  }
  if (diagram.type === "triangle_midline") {
    const A={x:240,y:47},B={x:76,y:247},C={x:410,y:247};
    const M={x:(A.x+B.x)/2,y:(A.y+B.y)/2};
    const N={x:(A.x+C.x)/2,y:(A.y+C.y)/2};
    return (
      <Frame description={`三角形 ABC，M 为 AB 的中点，N 为 AC 的中点，中位线 MN 平行于 BC，BC 为 ${diagram.base} 厘米`} caption="M、N 由边的精确中点计算，MN∥BC">
        <path d={`M ${A.x} ${A.y} L ${B.x} ${B.y} L ${C.x} ${C.y} Z`} stroke={ink} strokeWidth="3" fill="#f6fbff" />
        <line x1={M.x} y1={M.y} x2={N.x} y2={N.y} stroke={orange} strokeWidth="3.5" />
        <MarkedPoint {...M} text="M" dx={-24} dy={4}/>
        <MarkedPoint {...N} text="N" dx={12} dy={4}/>
        <g {...label}>
          <text x={A.x-6} y={A.y-16}>A</text><text x={B.x-18} y={B.y+17}>B</text>
          <text x={C.x+8} y={C.y+17}>C</text>
          <text x={(B.x+C.x)/2} y={B.y+28} textAnchor="middle">{diagram.base} cm</text>
          <text x={(M.x+N.x)/2} y={M.y-13} textAnchor="middle">MN = ?</text>
        </g>
      </Frame>
    );
  }
  if (diagram.type === "quadratic_vertex") {
    const { a,h,k }=diagram;
    return <Graph
      curves={[{name:"抛物线",color:orange,fn:(x)=>a*(x-h)**2+k}]}
      points={[{x:h,y:k,label:"V"}]} axisX={h}
      description={`二次函数图像，开口${a>0?"向上":"向下"}，顶点 V(${h}, ${k})，对称轴 x 等于 ${h}`}
      caption="虚线为对称轴，顶点与整条曲线由顶点式计算"
    />;
  }
  if (diagram.type === "linear_intersection") {
    const [m1,m2] = diagram.slopes.split(",").map(Number);
    const b1=diagram.y-m1*diagram.x,b2=diagram.y-m2*diagram.x;
    return <Graph
      curves={[
        {name:"l₁",color:orange,fn:(x)=>m1*x+b1},
        {name:"l₂",color:teal,fn:(x)=>m2*x+b2},
      ]}
      points={[{x:diagram.x,y:diagram.y,label:"P"}]}
      description={`两直线 l1 与 l2 交于 P，斜率分别为 ${m1} 与 ${m2}`}
      caption="两条直线恰好穿过同一个代数交点 P"
    />;
  }
  const [r1,r2]=diagram.roots.split(",").map(Number);
  const { slope:m,intercept:b }=diagram;
  return <Graph
    curves={[
      {name:"抛物线",color:orange,fn:(x)=>(x-r1)*(x-r2)+m*x+b},
      {name:"直线",color:teal,fn:(x)=>m*x+b},
    ]}
    points={[{x:r1,y:m*r1+b,label:"A"},{x:r2,y:m*r2+b,label:"B"}]}
    description={`二次函数与直线的两个交点 A 和 B，横坐标分别为 ${r1} 与 ${r2}`}
    caption="曲线与直线共同代入验证 A、B 两个交点"
  />;
}
