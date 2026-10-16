/* 把 seed-demo-content.cjs 造出来的错题填上真实内容。
   QWEN_MODE=mock 时分析 worker 产出的是固定示例文本（6 条一模一样），
   只够验证布局、不够当演示。这里按当时渲染进图片里的题目逐条回填，
   并把错题状态铺开（已发布 / 待学生确认 / 待老师复核），
   这样 /wrong-questions、/teacher/review、详情页都有真实可看的形态。

   用法：node scripts/enrich-demo-content.cjs
*/
const { Client } = require('pg');

const URL = process.env.DATABASE_URL
  || 'postgresql://huangguan:huangguan_dev@127.0.0.1:5432/huangguanedu';

// 顺序与 seed-demo-content.cjs 里的 MATH[] + ENGLISH[] 一致（按 createdAt 升序对应）
const CONTENT = [
  {
    subject: 'MATH',
    recognizedQuestion: '解方程：3(x - 2) + 5 = 2x + 9',
    questionType: '一元一次方程求解',
    correctSteps: ['3(x - 2) + 5 = 2x + 9', '3x - 6 + 5 = 2x + 9', '3x - 1 = 2x + 9', '3x - 2x = 9 + 1', 'x = 10'],
    thinkingHint: '先去括号、合并同类项，再把含 x 的项移到等号一边。',
    finalAnswer: 'x = 10',
    errorCauses: ['移项时符号处理错误'],
    knowledgePoints: ['一元一次方程', '去括号法则', '移项变号'],
    difficulty: 'MEDIUM',
    studentWorkTranscription: '3x - 6 - 5 = 2x + 9，解得 x = 4',
    studentApproach: '先去括号，然后把含 x 的项移到左边',
    firstErrorStep: '3(x - 2) + 5 去括号后写成了 3x - 6 - 5，+5 被当成 -5',
    misconception: '把"加 5"理解成"减 5"，说明对去括号后各项符号的独立性还没建立起来',
    whatStudentDidWell: '去括号时 3 乘进括号的运算完全正确',
    status: 'PUBLISHED',
    isTeacherReviewed: true,
    needsTeacherReview: false,
  },
  {
    subject: 'MATH',
    recognizedQuestion: '已知 a + b = 7，ab = 12，求 a² + b² 的值。',
    questionType: '乘法公式的变形应用',
    correctSteps: ['(a + b)² = a² + 2ab + b²', 'a² + b² = (a + b)² - 2ab', '= 7² - 2 × 12', '= 49 - 24', '= 25'],
    thinkingHint: '看到 a + b 与 ab，先想到完全平方公式，再把它反过来用。',
    finalAnswer: '25',
    errorCauses: ['公式变形时漏项'],
    knowledgePoints: ['完全平方公式', '乘法公式变形', '整体代入'],
    difficulty: 'MEDIUM',
    studentWorkTranscription: '(a + b)² = a² + b² = 49',
    studentApproach: '直接套用完全平方公式',
    firstErrorStep: '把 (a + b)² 直接写成 a² + b²，丢掉了中间的 2ab',
    misconception: '不熟悉完全平方公式的三项结构，属于公式记忆不完整',
    whatStudentDidWell: '能主动联想到完全平方公式，方向是对的',
    status: 'PUBLISHED',
    isTeacherReviewed: true,
    needsTeacherReview: false,
  },
  {
    subject: 'MATH',
    recognizedQuestion: '化简：(2x - 3)(x + 4)',
    questionType: '多项式乘法',
    correctSteps: ['(2x - 3)(x + 4)', '= 2x·x + 2x·4 - 3·x - 3·4', '= 2x² + 8x - 3x - 12', '= 2x² + 5x - 12'],
    thinkingHint: '逐项相乘再合并同类项，一次项要算两遍。',
    finalAnswer: '2x² + 5x - 12',
    errorCauses: ['同类项合并出错'],
    knowledgePoints: ['多项式乘法', '乘法分配律', '合并同类项'],
    difficulty: 'MEDIUM',
    studentWorkTranscription: '2x² + 11x - 12',
    studentApproach: '逐项相乘',
    firstErrorStep: '合并一次项时写成 8x + 3x',
    misconception: '减号只作用于后一项的系数符号，学生把它当成对整个括号的作用',
    whatStudentDidWell: '四项拆分的结构完全正确',
    status: 'PUBLISHED',
    isTeacherReviewed: false,
    needsTeacherReview: false,
  },
  {
    subject: 'MATH',
    recognizedQuestion: '一次函数 y = -2x + 6 的图象与 x 轴交点的坐标是什么？',
    questionType: '一次函数图象与坐标轴交点',
    correctSteps: ['令 y = 0', '-2x + 6 = 0', '-2x = -6', 'x = 3', '交点为 (3, 0)'],
    thinkingHint: '与 x 轴相交意味着 y = 0，代入解出 x 即可。',
    finalAnswer: '(3, 0)',
    errorCauses: ['解一元一次方程时符号出错'],
    knowledgePoints: ['一次函数图象', '与坐标轴交点', '解一元一次方程'],
    difficulty: 'EASY',
    studentWorkTranscription: '-2x + 6 = 0 → x = -3',
    status: 'PENDING_STUDENT_CONFIRMATION',
    isTeacherReviewed: false,
    needsTeacherReview: false,
  },
  {
    subject: 'MATH',
    recognizedQuestion: '在 △ABC 中，∠A = 50°，∠B = 60°，求 ∠C 的度数。',
    questionType: '三角形内角和',
    correctSteps: ['∠A + ∠B + ∠C = 180°', '50° + 60° + ∠C = 180°', '∠C = 180° - 110°', '∠C = 70°'],
    thinkingHint: '三角形三个内角的和恒等于 180°。',
    finalAnswer: '70°',
    errorCauses: ['只减了一个已知角'],
    knowledgePoints: ['三角形内角和定理'],
    difficulty: 'EASY',
    studentWorkTranscription: '180° - 50° = 130°，所以 ∠C = 130°',
    misconception: '漏用了一个已知条件，说明读题时只抓了第一个数据',
    whatStudentDidWell: '知道要用内角和 180°',
    status: 'NEEDS_REVIEW',
    isTeacherReviewed: false,
    needsTeacherReview: true,
  },
  {
    subject: 'ENGLISH',
    recognizedQuestion: 'Choose the correct form: She ______ (go) to school by bike every day.',
    questionType: '一般现在时第三人称单数',
    correctSteps: ['主语 She 是第三人称单数', '时间状语 every day 表示习惯性动作', '一般现在时 + 第三人称单数 → 动词加 -es', 'go → goes'],
    thinkingHint: '看到 every day 就用一般现在时；主语是 he / she / it 时动词要变形。',
    finalAnswer: 'goes',
    errorCauses: ['第三人称单数动词未变形'],
    knowledgePoints: ['一般现在时', '主语与动词一致', '第三人称单数'],
    difficulty: 'EASY',
    studentWorkTranscription: 'She go to school by bike every day.',
    misconception: '记住了时态却忘了主谓一致，说明两条规则还没有合起来用',
    whatStudentDidWell: '正确识别出这是一般现在时',
    status: 'NEEDS_REVIEW',
    isTeacherReviewed: false,
    needsTeacherReview: true,
  },
];

// 知识点关联表要跟着一起换（原来是 mock 的"一元一次方程 / 移项"）
async function main() {
  const c = new Client({ connectionString: URL });
  await c.connect();

  const rows = (await c.query(
    'select id from "WrongQuestion" where "deletedAt" is null order by "createdAt" asc limit $1',
    [CONTENT.length],
  )).rows;

  if (rows.length < CONTENT.length) {
    console.error(`库里只有 ${rows.length} 道错题，先跑 node scripts/seed-demo-content.cjs`);
    process.exit(1);
  }

  for (const [i, item] of CONTENT.entries()) {
    const id = rows[i].id;
    await c.query(
      `update "WrongQuestion" set
         "recognizedQuestion" = $2, "questionType" = $3, "correctSteps" = $4::jsonb, "thinkingHint" = $5,
         "finalAnswer" = $6, "errorCauses" = $7::jsonb, "knowledgePoints" = $8::jsonb, "difficulty" = $9::"Difficulty",
         "studentWorkDetected" = $10, "studentWorkTranscription" = $11, "studentApproach" = $12,
         "firstErrorStep" = $13, "misconception" = $14, "whatStudentDidWell" = $15,
         "status" = $16::"WrongQuestionStatus", "isTeacherReviewed" = $17, "needsTeacherReview" = $18,
         "aiConfidence" = 0.92, "isAiGenerated" = true,
         "studentConfirmedAt" = $19::timestamptz
       where id = $1`,
      [
        id, item.recognizedQuestion, item.questionType, JSON.stringify(item.correctSteps), item.thinkingHint,
        item.finalAnswer, JSON.stringify(item.errorCauses), JSON.stringify(item.knowledgePoints), item.difficulty,
        Boolean(item.studentWorkTranscription), item.studentWorkTranscription ?? null,
        item.studentApproach ?? null, item.firstErrorStep ?? null, item.misconception ?? null,
        item.whatStudentDidWell ?? null, item.status, item.isTeacherReviewed, item.needsTeacherReview,
        item.status === 'PUBLISHED' ? new Date().toISOString() : null,
      ],
    );

    await c.query('delete from "WrongQuestionKnowledgePoint" where "wrongQuestionId" = $1', [id]);
    for (const [order, name] of item.knowledgePoints.entries()) {
      await c.query(
        'insert into "WrongQuestionKnowledgePoint" ("id", "wrongQuestionId", "knowledgePoint") values ($1, $2, $3)',
        [`kp_${id}_${order}`, id, name],
      );
    }
    console.log(`  ✓ [${item.subject}] ${item.recognizedQuestion.slice(0, 28)}… → ${item.status}`);
  }

  const stat = await c.query(
    'select status, count(*)::int n from "WrongQuestion" where "deletedAt" is null group by status order by 1',
  );
  console.log('\n错题状态分布：');
  for (const r of stat.rows) console.log(`  ${String(r.n).padStart(3)}  ${r.status}`);

  await c.end();
}

main().catch((e) => { console.error('失败：' + e.message); process.exit(1); });
