import type { ExamStep, Point } from "./verified-exam-casebook";

export const LOCAL_EXAM_CASES = [
  { id: "square", title: "正方形中的相似与定值", paper: "2025 武汉中考", question: "第23题", file: "中考数学.pdf", page: 7, topic: "几何证明", summary: "全等 → 线段乘积 → 比值表达式" },
  { id: "quadratic", title: "抛物线与动点综合", paper: "2025 武汉中考", question: "第24题", file: "中考数学.pdf", page: 8, topic: "函数与几何", summary: "交点 → 线段相等的两解 → 面积比反求直线" },
  { id: "badminton", title: "羽毛球轨迹与不等式", paper: "2025 武汉中考", question: "第22题", file: "中考数学.pdf", page: 6, topic: "实际建模", summary: "数据建模 → 最高点 → 过网与落点的联合限制" },
  { id: "hyperbola", title: "双曲线中的斜率约束", paper: "2022 新高考Ⅰ卷", question: "第21题", file: "2022全国新高考I卷数学真题.pdf", page: 5, topic: "湖北高考", summary: "确定曲线 → 斜率和为零 → 角度条件求面积" },
  { id: "ellipse", title: "椭圆、反演构造与最值", paper: "2025 全国Ⅰ卷", question: "第18题", file: "2025全国一卷数学真题.pdf", page: 4, topic: "湖北高考", summary: "标准方程 → 射线上构点 → 圆轨迹与全局最大值" },
] as const;
export type LocalExamId = typeof LOCAL_EXAM_CASES[number]["id"];
export const SQUARE_SEGMENT_LIMIT = (Math.sqrt(5) - 1) / 2;
export const WUHAN_EQUAL_LENGTH_ROOTS = [6 - 4 * Math.sqrt(3), 2] as const;
const EPS = 1e-9;
export const measure = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);
const finite = (...values: number[]) => {
  if (!values.every(Number.isFinite)) throw new Error("实验参数必须是有限数值");
};

// 取 A(0,s)、B(0,0)、C(s,0)、D(s,s)，t=DE/s，CF=DE 始终随动。
export function analyzeWuhanSquare(side: number, t: number) {
  finite(side, t);
  if (side <= 0 || t < 0 || t > 1) throw new Error("正方形边长须为正，E 须位于 CD 上");
  const A = { x: 0, y: side }, B = { x: 0, y: 0 };
  const C = { x: side, y: 0 }, D = { x: side, y: side };
  const E = { x: side, y: side * (1 - t) }, F = { x: side * (1 + t), y: 0 };
  const G = { x: side / (1 + t), y: side / (1 + t) };
  const u = 1 - t * t > EPS ? t / (1 - t * t) : null;
  const H = u === null ? null : { x: side * (1 + t * u), y: side * (1 - u) };
  const valid = t > EPS && u !== null && u <= 1 + EPS;
  const AG = measure(A, G), GE = measure(G, E);
  const EH = H ? measure(E, H) : null, GH = H ? measure(G, H) : null;
  const DH = H ? measure(D, H) : null, DF = measure(D, F);
  const n = EH !== null && EH > EPS ? GE / EH : null;
  return { A, B, C, D, E, F, G, H, valid, u, AG, GE, EH, GH, DH, DF, n,
    productLeft: EH === null ? null : AG * EH,
    productRight: GH === null ? null : GE * GH,
    ratio: valid && DH !== null ? DH / DF : null };
}

export const wuhanParabola = (x: number) => x * x / 4 - 3;
export function analyzeWuhanQuadratic(x: number, slope: number) {
  finite(x, slope);
  const A = { x: -2, y: -2 }, B = { x: 6, y: 6 }, O = { x: 0, y: 0 };
  const P = { x, y: wuhanParabola(x) };
  const M = { x: -x, y: P.y }, N = { x, y: x };
  const pointValid = x > -2 + EPS && x < 6 - EPS && Math.abs(x) > EPS;
  const PM = measure(P, M), PN = measure(P, N);
  const root = Math.sqrt(slope * slope + 3);
  const C = { x: 2 * slope - 2 * root, y: 0 };
  const D = { x: 2 * slope + 2 * root, y: 0 };
  C.y = slope * C.x; D.y = slope * D.x;
  const chordValid = slope < -EPS;
  // 在 k<0 的原题定义域内，两条弦与 x 轴均有唯一交点。
  const E = chordValid ? { x: (12 - 2 * C.x) / (C.x - 2), y: 0 } : null;
  const F = chordValid ? { x: 6 * (D.x + 2) / (D.x + 6), y: 0 } : null;
  const areaCOE = E ? Math.abs(E.x * C.y) / 2 : null;
  const areaDOF = F ? Math.abs(F.x * D.y) / 2 : null;
  const areaRatio = areaCOE !== null && areaCOE > EPS && areaDOF !== null ? areaDOF / areaCOE : null;
  return { A, B, O, P, M, N, C, D, E, F, pointValid, chordValid, PM, PN, areaCOE, areaDOF, areaRatio };
}

export function analyzeWuhanBadminton(k: number) {
  finite(k);
  const height = (x: number) => -x * x / 10 + k * x + 1.1;
  const landing = 5 * k + Math.sqrt(25 * k * k + 11);
  const vertexX = Math.max(0, Math.min(landing, 5 * k));
  const netHeight = height(5), distanceFromNet = landing - 5;
  const clearsNet = landing > 5 && netHeight > 2.1 + EPS;
  const landsInRange = distanceFromNet > 0 && distanceFromNet < 6 - EPS;
  return { height, landing, vertex: { x: vertexX, y: height(vertexX) }, netHeight, distanceFromNet,
    clearsNet, landsInRange, eligible: clearsNet && landsInRange };
}

// 由 A(2,1) 解得 a²=2。斜率和约束把弦方向锁定为 −1，只改变截距。
export function analyzeHubeiHyperbola(intercept: number) {
  finite(intercept);
  const A = { x: 2, y: 1 };
  const discriminant = 2 * intercept * intercept - 2;
  const points: Point[] = discriminant < -EPS ? [] : discriminant <= EPS
    ? [{ x: 2 * intercept, y: -intercept }]
    : [-1, 1].map(sign => {
      const x = 2 * intercept + sign * Math.sqrt(discriminant);
      return { x, y: -x + intercept };
    });
  const valid = points.length === 2 && points.every(p => Math.abs(p.x - A.x) > EPS);
  if (!valid) return { A, points, valid, slopes: null, area: null, angleTangent: null };
  const [P, Q] = points;
  const ap = { x: P.x - A.x, y: P.y - A.y }, aq = { x: Q.x - A.x, y: Q.y - A.y };
  const cross = ap.x * aq.y - ap.y * aq.x, dot = ap.x * aq.x + ap.y * aq.y;
  return { A, points, valid, slopes: [(P.y - 1) / (P.x - 2), (Q.y - 1) / (Q.x - 2)],
    area: Math.abs(cross) / 2, angleTangent: Math.abs(dot) > EPS ? Math.abs(cross) / dot : null };
}

export const GAOKAO_ELLIPSE_MAX = 3 * (Math.sqrt(3) + Math.sqrt(2));
export function gaokaoLocusPoint(angle: number): Point {
  const rad = angle * Math.PI / 180;
  return { x: 3 * Math.sqrt(2) * Math.cos(rad), y: -4 + 3 * Math.sqrt(2) * Math.sin(rad) };
}
export function analyzeHubeiEllipse(P: Point, angle: number) {
  finite(P.x, P.y, angle);
  const A = { x: 0, y: -1 }, B = { x: 3, y: 0 }, K = { x: 0, y: -4 };
  const rad = angle * Math.PI / 180, M = { x: 3 * Math.cos(rad), y: Math.sin(rad) };
  const d = P.x * P.x + (P.y + 1) ** 2;
  const R = d > EPS ? { x: 3 * P.x / d, y: -1 + 3 * (P.y + 1) / d } : null;
  const valid = Math.abs(P.x) > EPS && R !== null;
  const onLocus = Math.abs(P.x * P.x + (P.y + 4) ** 2 - 18) < 1e-7;
  return { A, B, K, P, M, R, valid, onLocus, PM: measure(P, M), KM: measure(K, M),
    rayProduct: R ? measure(A, R) * measure(A, P) : null,
    slopeOP: valid ? P.y / P.x : null, slopeOR: valid && R ? R.y / R.x : null,
    maximum: GAOKAO_ELLIPSE_MAX };
}

export const LOCAL_EXAM_DEFAULTS: Record<LocalExamId, Record<string, number>> = {
  square: { side: 4, t: .4 }, quadratic: { x: 2, slope: -.25 }, badminton: { k: .8 },
  hyperbola: { intercept: 5 / 3 }, ellipse: { m: 2, n: -2, pAngle: 240, mAngle: 30 },
};
export type PlotPath = { points: Point[]; tone?: "curve" | "construction" | "highlight" | "guide"; closed?: boolean; dashed?: boolean };
export type PlotLabel = Point & { label: string; dx?: number; dy?: number };
export type ExamControl = { key: string; label: string; min: number; max: number; step: number };
export type ExamShortcut = { label: string; stage: number; values: Record<string, number> };
export interface LocalExamLesson {
  statement: string;
  parts: ExamStep[];
  paths: PlotPath[];
  labels: PlotLabel[];
  axes: boolean;
  controls: ExamControl[];
  shortcuts: ExamShortcut[];
  checks: { label: string; pass: boolean }[];
  readings: { label: string; value: string }[];
  warning?: string;
  expression?: string;
}
export const examNumber = (n: number | null) => n === null ? "不适用" : String(Number(n.toFixed(5)));
const pointLabel = (label: string, p: Point, dx?: number, dy?: number): PlotLabel => ({ ...p, label, dx, dy });
const line = (...points: Point[]): PlotPath => ({ points, tone: "construction" });
const sample = (f: (n: number) => Point, from: number, to: number): Point[] =>
  Array.from({ length: 181 }, (_, i) => f(from + (to - from) * i / 180));
const curve = (points: Point[], closed = false): PlotPath => ({ points, tone: "curve", closed });
const proved = (title: string, task: string, answer: string, proof: string): ExamStep => ({ title, task, answer, proof, kind: "proved" });
const control = (key: string, label: string, min: number, max: number, step = .01): ExamControl => ({ key, label, min, max, step });
const reading = (label: string, n: number | null) => ({ label, value: examNumber(n) });

// 图形、测量和证明共享解析模型；曲线采样只用于显示，不参与求解。
export function localExamLesson(id: LocalExamId, input: Record<string, number>, stage: number): LocalExamLesson {
  const lesson: LocalExamLesson = { statement: "", parts: [], paths: [], labels: [], axes: true, controls: [], shortcuts: [], checks: [], readings: [] };
  if (id === "square") {
    const { side: s, t } = input, v = analyzeWuhanSquare(s, t);
    lesson.axes = false;
    lesson.statement = "正方形 ABCD 中，E 在 CD 上，F 在 BC 的延长线上，DE=CF。射线 AE 交 BD 于 G、交线段 DF 于 H。在同一构型下完成三问。";
    lesson.parts = [
      proved("由全等找到等腰关系", "证明 DH=GH。", "DH=GH", "令正方形边长为 s，t=DE/s。取 A(0,s)、B(0,0)、C(s,0)、D(s,s)，则 G=(s/(1+t),s/(1+t))。由 AE 与 DF 联立得 u=DH/DF=t/(1−t²)，H=(s(1+tu),s(1−u))。GH=su√(1+t²)=DH。几何上也可从 △DAE≌△DCF 的对应角入手。"),
      proved("从相似写出乘积", "证明 AG·EH=EG·GH。", "AG·EH=EG·GH", "在上述合法构型中，AG=s√(1+t²)/(1+t)，EG=t·AG；EH=st²√(1+t²)/(1−t²)，GH=st√(1+t²)/(1−t²)。所以 EH/GH=t=EG/AG，交叉相乘即得结论。"),
      proved("把几何量转成参数式", "设 GE/EH=n，用 n 表示 DH/DF。", "DH/DF=(n+1)/(n(n+2))", "GE/EH=(1−t)/t，故 t=1/(n+1)。代入 DH/DF=t/(1−t²)，得 (n+1)/(n(n+2))。原题 H 在线段 DF 上，要求 0<t≤(√5−1)/2，对应 n≥(√5−1)/2；越界时不能沿用原题构型。"),
    ];
    lesson.paths = [{ points: [v.A, v.B, v.C, v.D], closed: true, tone: "curve" },
      { ...line(v.B, v.D), dashed: true }, line(v.A, v.H ?? v.E), line(v.D, v.F), line(v.C, v.F)];
    if (v.H && !v.valid) lesson.paths.push({ ...line(v.F, v.H), tone: "highlight", dashed: true });
    lesson.labels = (["A", "B", "C", "D", "E", "F", "G"] as const).map(k => pointLabel(k, v[k], k === "E" ? -20 : 10, k === "B" || k === "C" || k === "F" ? 22 : -11));
    if (v.H) lesson.labels.push(pointLabel("H", v.H, 10, 22));
    lesson.controls = [control("side", "正方形边长 s（原题未固定）", 2, 8, .1), control("t", "E 的位置 t=DE/CD", 0, 1)];
    lesson.shortcuts = [{ label: "H 恰好到达 F", stage: 0, values: { t: SQUARE_SEGMENT_LIMIT } }, { label: "观察 H 超出线段", stage: 0, values: { t: .8 } }];
    lesson.checks = [{ label: "DE=CF 随动保持", pass: Math.abs(measure(v.D, v.E) - measure(v.C, v.F)) < EPS }, { label: "G、E、H 均不退化且 H 在线段 DF 上", pass: v.valid }];
    lesson.readings = [reading("DH", v.DH), reading("GH", v.GH), reading("AG·EH", v.productLeft), reading("EG·GH", v.productRight), reading("n=GE/EH", v.n), reading("合法构型 DH/DF", v.ratio)];
    if (!v.valid) lesson.warning = t === 1 ? "AE 与 DF 平行，没有交点 H。" : t === 0 ? "E、G、H 与 D 重合，比值没有定义。" : "H 已超出线段 DF。回到 0<t≤(√5−1)/2 才满足本题条件。";
  } else if (id === "quadratic") {
    const v = analyzeWuhanQuadratic(input.x, input.slope);
    lesson.statement = "抛物线 y=x²/4−3 与 y=x 交于 A、B（A 在左）。第（2）问 PM 平行 x 轴、PN 平行 y 轴；第（3）问改用过原点的直线 CD，C 位于第二象限。";
    lesson.parts = [
      proved("先确定两条曲线交点", "求 A、B 的坐标。", "A(−2,−2)，B(6,6)", "联立 x²/4−3=x，得 (x+2)(x−6)=0，再代入 y=x。A 在 B 左侧，标签不可互换。"),
      proved("水平与竖直长度的两解", "P 在直线 AB 下方的抛物线上。水平线 PM 再交抛物线于 M，竖直线 PN 交线段 AB 于 N。由 PM=PN 求 P 的横坐标。", "xP=2 或 6−4√3", "设 P=(x,x²/4−3)，−2<x<6。由对称性 M=(−x,x²/4−3)，N=(x,x)，所以 PM=2|x|，PN=−x²/4+x+3。x≥0 时得 x²+4x−12=0，仅 x=2 合法；x<0 时得 x²−12x−12=0，仅 x=6−4√3 合法。x=0 时 M=P，不形成第二交点。"),
      proved("用面积比反求直线", "过 O 的 CD 与抛物线交于 C、D，C 在第二象限；AC、BD 分别交 x 轴于 E、F。若 S△DOF=(3/4)S△COE，求 CD。", "y=−x/4", "设 CD:y=kx，C、D 的横坐标为 c<0<d。由韦达 cd=−12，且 k<0。两条弦的横截距为 E=−6(d+2)/(d+6)、F=6(d+2)/(d+6)，故 OE=OF。面积比等于 |d/c|=d²/12=3/4，得 d=3、c=−4，k=(c+d)/4=−1/4。"),
    ];
    const low = stage === 2 ? Math.min(-5, v.C.x - .6) : -6.5;
    lesson.paths = [curve(sample(x => ({ x, y: wuhanParabola(x) }), low, 6.5)), line(v.A, v.B)];
    lesson.labels = [pointLabel("A", v.A, -20, 20), pointLabel("B", v.B)];
    lesson.expression = "x^2/4-3";
    if (stage === 1) {
      lesson.paths.push({ ...line(v.P, v.M), tone: "highlight" }, line(v.P, v.N));
      lesson.labels.push(pointLabel("P", v.P, 10, 23), pointLabel("M", v.M, -22, -10), pointLabel("N", v.N));
      lesson.controls = [control("x", "动点 P 横坐标（原题 −2<x<6）", -2, 6)];
      lesson.checks = [{ label: "P 在 AB 下方，M 是不同于 P 的第二交点", pass: v.pointValid }];
      lesson.readings = [reading("PM（水平）", v.PM), reading("PN（竖直）", v.PN), reading("|PM−PN|", Math.abs(v.PM - v.PN))];
      if (!v.pointValid) lesson.warning = "当前 P 位于端点或 M=P，不满足第（2）问的动点条件。";
    } else if (stage === 2) {
      lesson.paths.push(line(v.C, v.D));
      lesson.labels.push(pointLabel("C", v.C), pointLabel("D", v.D, 10, 22));
      if (v.E && v.F) {
        lesson.paths.push(line(v.A, v.C, v.E), line(v.B, v.D, v.F),
          { points: [v.D, v.O, v.F], closed: true, tone: "highlight" }, { points: [v.C, v.O, v.E], closed: true, tone: "construction" });
        lesson.labels.push(pointLabel("E", v.E, -14, 23), pointLabel("F", v.F, 10, 23));
      }
      lesson.controls = [control("slope", "直线 CD 斜率 k（C 在第二象限须 k<0）", -2, 1)];
      lesson.checks = [{ label: "C 位于第二象限，E、F 可构造", pass: v.chordValid }, { label: "面积比为 3/4", pass: v.areaRatio !== null && Math.abs(v.areaRatio - .75) < EPS }];
      lesson.readings = [reading("S△COE", v.areaCOE), reading("S△DOF", v.areaDOF), reading("S△DOF / S△COE", v.areaRatio)];
      if (!v.chordValid) lesson.warning = "第（3）问限定 C 在第二象限，须 k<0。当前不计算原题的面积比。";
    } else {
      lesson.checks = [{ label: "两交点同时满足抛物线与 y=x", pass: true }];
      lesson.readings = [{ label: "A", value: "(−2,−2)" }, { label: "B", value: "(6,6)" }];
    }
    lesson.shortcuts = WUHAN_EQUAL_LENGTH_ROOTS.map((x, i) => ({ label: i ? "第（2）问：x=2" : "第（2）问：x=6−4√3", stage: 1, values: { x } }));
    lesson.shortcuts.push({ label: "第（3）问：面积比 3/4", stage: 2, values: { slope: -.25 } });
  } else if (id === "badminton") {
    const k = stage === 2 ? input.k : .8, v = analyzeWuhanBadminton(k);
    lesson.statement = "水平距离 x/m 对应高度 y/m：0→1.1、2→2.3、3→2.6、5→2.6、6→2.3。用 y=ax²+bx+1.1 建模，再保持抛物线形状，改变一次项系数研究过网与落点。";
    lesson.parts = [
      proved("从数据反求模型", "根据记录确定 a、b。", "y=−x²/10+4x/5+11/10", "由 (2,2.3)、(3,2.6) 得 4a+2b=1.2、9a+3b=1.5，解得 a=−0.1、b=0.8。其余两组数据也满足该模型。"),
      proved("回到实际飞行区间", "这一球的飞行高度能否达到 2.8 m？", "不能，最高为 2.7 m", "配方 y=−(x−4)²/10+2.7，顶点在实际落地前，故最大高度 2.7 m，小于 2.8 m。画图时仅显示发球至首次落地的部分。"),
      proved("联合两条严格不等式", "保持 a=−0.1，改为 y=−0.1x²+kx+1.1。球网距发球点 5m；过网高度须超过 2.1m，落地点距球网须小于 6m，求 k。", "7/10<k<1（两端均不含）", "过网要求 y(5)=5k−1.4>2.1，得 k>0.7。设正落地点为 r；先由过网保证 r>5，再由 r−5<6 得 r<11。抛物线开口向下且 y(0)>0，故 r<11 等价于 y(11)=11k−11<0，得 k<1。两条件交集为 (0.7,1)。"),
    ];
    const last = Math.max(v.landing, 11);
    lesson.paths = [curve(sample(x => ({ x, y: v.height(x) }), 0, v.landing)),
      { ...line({ x: 0, y: 0 }, { x: last, y: 0 }), tone: "guide" }];
    lesson.labels = [pointLabel("发球", { x: 0, y: 1.1 }, 8, 22), pointLabel("最高点", v.vertex), pointLabel("落地", { x: v.landing, y: 0 }, -16, 23)];
    if (stage === 2) {
      lesson.paths.push({ ...line({ x: 5, y: 0 }, { x: 5, y: 2.1 }), tone: "highlight" }, { ...line({ x: 11, y: 0 }, { x: 11, y: 3 }), dashed: true, tone: "guide" });
      lesson.labels.push(pointLabel("球网 x=5", { x: 5, y: 2.1 }, -70, -11));
      lesson.controls = [control("k", "发球方式 k（形状 a=−0.1 固定）", .4, 1.2)];
      lesson.checks = [{ label: "过网高度严格大于 2.1m", pass: v.clearsNet }, { label: "落地点距球网严格小于 6m", pass: v.landsInRange }];
      lesson.shortcuts = [{ label: "下端点 k=0.7", stage: 2, values: { k: .7 } }, { label: "上端点 k=1", stage: 2, values: { k: 1 } }, { label: "合法发球 k=0.8", stage: 2, values: { k: .8 } }];
    } else {
      lesson.paths.push({ ...line({ x: 0, y: 2.8 }, { x: last, y: 2.8 }), dashed: true, tone: "guide" });
      lesson.checks = [{ label: "五组已知数据全部满足原模型", pass: true }];
    }
    lesson.readings = [reading("最高高度 / m", v.vertex.y), reading("过网高度 / m", v.netHeight), reading("落地点距球网 / m", v.distanceFromNet)];
    lesson.expression = `-0.1*x^2+${k}*x+1.1`;
  } else if (id === "hyperbola") {
    const v = analyzeHubeiHyperbola(input.intercept), b = input.intercept;
    lesson.statement = "A(2,1) 在双曲线 x²/a²−y²/(a²−1)=1（a>1）上。直线 l 截得不同的 P、Q，AP、AQ 的斜率存在且和为 0；继续加入 tan∠PAQ=2√2。";
    lesson.parts = [
      proved("斜率和约束锁定方向", "求直线 l 的斜率。", "曲线为 x²/2−y²=1；kl=−1", "代入 A 得 (a²−2)²=0，即 a²=2。先排除竖直弦：其两端关于 x 轴对称，AP、AQ 斜率和为 −2/(x−2)，不能为零（x=2 时斜率无定义）。设 l:y=kx+b，用韦达代入斜率和得 (k+1)(b+2k−1)=0。b+2k−1=0 使 l 经过 A，AP 或 AQ 无定义，故仅 k=−1。"),
      proved("角度条件排除伪解", "在 tan∠PAQ=2√2 时求三角形面积。", "S△PAQ=16√2/9", "设 AP、AQ 的斜率为 t、−t，角度公式给 |2t/(1−t²)|=2√2。候选 |t|=√2 或 1/√2；后者平行渐近线，过 A 的该线没有第二个有限交点，舍去。|t|=√2 时 l:y=−x+5/3，P、Q=( (10±4√2)/3, (−5∓4√2)/3 )，行列式面积为 16√2/9。"),
    ];
    const yMax = Math.max(3, ...v.points.map(p => Math.abs(p.y) + .6));
    lesson.paths = [-1, 1].map(sign => curve(sample(y => ({ x: sign * Math.sqrt(2 * (1 + y * y)), y }), -yMax, yMax)));
    lesson.paths.push(line({ x: -yMax, y: yMax + b }, { x: yMax + Math.abs(b), y: -yMax - Math.abs(b) + b }));
    lesson.labels = [pointLabel("A", v.A)];
    v.points.forEach((p, i) => { lesson.labels.push(pointLabel(i ? "Q" : "P", p)); lesson.paths.push(line(v.A, p)); });
    if (v.valid) lesson.paths.push({ points: [v.A, ...v.points], closed: true, tone: "highlight" });
    lesson.controls = [control("intercept", "l:y=−x+b 的截距 b", -4, 4)];
    lesson.checks = [{ label: "两个不同的有限交点且 AP、AQ 斜率均存在", pass: v.valid }, { label: "斜率和为 0", pass: v.slopes !== null && Math.abs(v.slopes[0] + v.slopes[1]) < EPS }, { label: "tan∠PAQ=2√2", pass: v.angleTangent !== null && Math.abs(v.angleTangent - 2 * Math.sqrt(2)) < EPS }];
    lesson.readings = [reading("斜率 AP", v.slopes?.[0] ?? null), reading("斜率 AQ", v.slopes?.[1] ?? null), reading("tan∠PAQ", v.angleTangent), reading("三角形面积", v.area)];
    lesson.shortcuts = [{ label: "载入角度条件的解", stage: 1, values: { intercept: 5 / 3 } }, { label: "相切：b=1", stage: 0, values: { intercept: 1 } }, { label: "弦经过 A：b=3", stage: 0, values: { intercept: 3 } }];
    if (!v.valid) lesson.warning = "当前弦没有两个合法交点，或其中一点与 A 重合；斜率和、角度及面积不作为本题答案。";
  } else {
    const P = stage === 2 ? gaokaoLocusPoint(input.pAngle) : { x: input.m, y: input.n };
    const v = analyzeHubeiEllipse(P, input.mAngle);
    lesson.statement = "椭圆离心率为 2√2/3，下顶点 A、右顶点 B 满足 AB=√10。P 不在 y 轴上，R 在射线 AP 上且 AR·AP=3；最后加入 kOR=3kOP，研究 P 与椭圆上 M 的最大距离。";
    lesson.parts = [
      proved("由题设恢复真实椭圆", "求椭圆标准方程。", "x²/9+y²=1", "由 e²=8/9 得 b²=a²/9，又 AB²=a²+b²=10，解得 a²=9、b²=1，所以 A=(0,−1)、B=(3,0)。"),
      proved("在同一条射线上构点", "设 P=(m,n)，求 R 的坐标。", "R=(3m/d,−1+3(n+1)/d)，d=m²+(n+1)²", "写 R=A+λ(P−A)，射线要求 λ>0。由 AR·AP=λ·AP²=3，得 λ=3/d。m≠0 保证 P≠A，所以 d>0。这里的构造是长度乘积条件，不是随意把 P 放大 3 倍。"),
      proved("轨迹与全局最大值", "若 kOR=3kOP，求 PM 的最大值。", "PM最大值=3(√3+√2)", "代入 R 坐标，利用 m≠0 消去分母得 m²+(n+4)²=18，故 P 在圆心 K(0,−4)、半径 3√2 的圆上（删去 y 轴上的两点）。令 M=(3cos u,sin u)，则 KM²=27−8(sin u−1/2)²≤27。PM≤PK+KM≤3√2+3√3。当 M=(3√3/2,1/2)，P=(−3√2/2,−4−3√6/2) 时两次等号同时成立且 P 不在 y 轴上，故为可取得的最大值。"),
    ];
    lesson.paths = [curve(sample(t => ({ x: 3 * Math.cos(t), y: Math.sin(t) }), 0, 2 * Math.PI), true)];
    lesson.labels = [pointLabel("A", v.A, 10, 22), pointLabel("B", v.B)];
    if (stage > 0) {
      lesson.paths.push(line(v.A, P)); lesson.labels.push(pointLabel("P", P));
      if (v.R) { lesson.paths.push({ ...line(v.A, v.R), tone: "highlight" }); lesson.labels.push(pointLabel("R", v.R, -22, -10)); }
    }
    if (stage === 2) {
      lesson.paths.push({ ...curve(sample(t => ({ x: 3 * Math.sqrt(2) * Math.cos(t), y: -4 + 3 * Math.sqrt(2) * Math.sin(t) }), 0, 2 * Math.PI), true), dashed: true },
        { ...line(v.K, P, v.M), dashed: true, tone: "guide" }, { ...line(P, v.M), tone: "highlight" });
      lesson.labels.push(pointLabel("K", v.K), pointLabel("M", v.M, -26, -12));
      lesson.controls = [control("pAngle", "P 在约束圆上的参数角 / °", 0, 360, 1), control("mAngle", "M 在椭圆上的参数角 / °", 0, 360, 1)];
      lesson.checks = [{ label: "P 不在 y 轴上，两条斜率存在", pass: v.valid }, { label: "斜率倍数与圆轨迹条件同时成立", pass: v.valid && v.onLocus }, { label: "M 位于原题椭圆上", pass: true }];
      lesson.readings = [reading("PM 当前长度", v.valid ? v.PM : null), reading("全局最大值", v.maximum), reading("KM", v.KM), reading("AR·AP", v.rayProduct)];
    } else if (stage === 1) {
      lesson.controls = [control("m", "P 的横坐标 m（原题排除 0）", -5, 5, .1), control("n", "P 的纵坐标 n", -8, 4, .1)];
      lesson.checks = [{ label: "m≠0 且 R 在射线 AP 上", pass: v.valid }, { label: "AR·AP=3", pass: v.rayProduct !== null && Math.abs(v.rayProduct - 3) < EPS }];
      lesson.readings = [reading("AR·AP", v.rayProduct), { label: "R 的坐标", value: v.R ? `(${examNumber(v.R.x)}, ${examNumber(v.R.y)})` : "构造退化" }];
    } else {
      lesson.checks = [{ label: "e=2√2/3 且 AB²=10", pass: true }];
      lesson.readings = [{ label: "a²", value: "9" }, { label: "b²", value: "1" }];
    }
    lesson.shortcuts = [{ label: "最大值的等号构型", stage: 2, values: { pAngle: 240, mAngle: 30 } }, { label: "被原题排除的轴上位置", stage: 2, values: { pAngle: 90 } }];
    if (stage > 0 && !v.valid) lesson.warning = "P 位于 y 轴上，原题中的斜率不存在；当前图形不能作为原题的合格构型。";
  }
  return lesson;
}
