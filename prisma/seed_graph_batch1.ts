/**
 * 种子数据 第一批 · 知识图谱
 * 覆盖：主线定义 / 地基层补充节点(BG100-104) / M1节点 / M2a节点 / 跨线桥(主线级) / 视频映射示例
 * 对应 schema：技术方案 v1.0 §2.5 + v1.1 §E（KnowledgeNode 增 tier 字段）
 *
 * 说明：
 * - 地基层 BG001-099 沿用《地基层微技能清单》原表，此处只列补充节点与归并关系；
 *   导入时请将那 99 行也转成同结构（字段一一对应）。
 * - tier: A=托底 B=第一问 C=中档补位 D=放弃区 null=纯地基工具(不单独进学习前沿)
 * - 题目（Item）单独成批，本文件不含；本文件只建图。
 */

// ===================== 主线 =====================
// priority 已降为次级排序键；真实调度以 tier 为主键（v1.1 §C）
export const mainlines = [
  { id: "M0",  name: "地基层（共享根）",        priority: 0 },
  { id: "M1",  name: "数学语言与代数预备",       priority: 1 },
  { id: "M2a", name: "函数与指对幂",            priority: 2 },
  { id: "M3",  name: "三角函数与解三角形",       priority: 3 },
  { id: "M5",  name: "平面向量",               priority: 4 },
  { id: "M8",  name: "计数、概率与统计",         priority: 5 },
  { id: "M4",  name: "数列",                   priority: 6 },
  { id: "M2b", name: "导数及其应用",            priority: 7 },
  { id: "M6",  name: "立体几何与空间向量",       priority: 8 },
  { id: "M7",  name: "解析几何",               priority: 9 },
];

// 主线严格年均权重（v1.1 §B 重映射后的真值，供 ROI 排序与配题侧重用）
export const mainlineWeight: Record<string, number> = {
  M4: 18.5, M3: 25.5, M6: 20.5, M2a: 16, M8: 14.5, M2b: 10, M1: 10, M5: 5,
  // 注：解析几何在 schema 里是 M7，但 3-2 的"M4=解析几何"权重 29.5 归到 M7
  M7: 29.5,
};

// ===================== 地基层补充节点（BG100-104，承接 v1.0）=====================
export const foundationExtra = [
  { id: "BG100", name: "韦达定理（根与系数关系）", layer: "foundation", stage: "九上/必修一",
    judgeCriteria: "能由二次方程系数直接写出两根之和与积",
    sampleItem: "x²-5x+3=0，求两根之和与积", tier: null,
    prereq: ["BG053"], mainlines: ["M0"] },
  { id: "BG101", name: "解一元二次不等式（图象法）", layer: "foundation", stage: "必修一2.3",
    judgeCriteria: "能借助二次函数图象写出不等式解集",
    sampleItem: "解 x²-x-6>0", tier: null,
    prereq: ["BG057", "BG066", "BG069"], mainlines: ["M0"] },
  { id: "BG102", name: "区间表示法与集合互化", layer: "foundation", stage: "必修一",
    judgeCriteria: "能在不等式、区间、集合三种写法间互转",
    sampleItem: "把 {x|1<x≤4} 写成区间", tier: null,
    prereq: ["BG049", "BG080"], mainlines: ["M0"] },
  { id: "BG103", name: "整体换元意识", layer: "foundation", stage: "必修一",
    judgeCriteria: "能把复杂式中的重复结构设为一个新元",
    sampleItem: "解 (x²)²-5x²+4=0", tier: null,
    prereq: ["BG017", "BG029"], mainlines: ["M0"] },
  { id: "BG104", name: "二次函数闭区间最值（轴定区间定）", layer: "foundation", stage: "必修一",
    judgeCriteria: "能在给定闭区间上求二次函数最值",
    sampleItem: "求 y=x²-2x 在 [0,3] 的最值", tier: null,
    prereq: ["BG067", "BG068"], mainlines: ["M0"] },
];

// ===================== 地基层归并关系（v1.1 §D1）=====================
// 4-2 中 M1-01/02/03 实为地基技能，不在 M1 重复建节点，归并到既有 BG 节点。
// 后续 M1 其他节点若引用这些，直接指向 BG 节点 id。
export const mergeMap: Record<string, string> = {
  "M1-01(去括号变号)": "BG015",
  "M1-02(移项整理)":   "BG043",  // 兼并 BG016 合并同类项
  "M1-03(代入消元)":   "BG046",
};

// ===================== M1 节点（采自 4-2，含 v1.1 §D1 补充）=====================
// 字段：id,name,section(教材小节),samePrereq(同主线前置),foundationPrereq(地基前置文字→后续做ID映射),
//        judge,sample,tier,mainlines
export const M1nodes = [
  { id: "M1-04", name: "元素与常用数集关系判断", section: "1.1", samePrereq: [], foundationPrereq: ["数集认知"],
    judge: "能判断给定数是否属于指定数集", sample: "判断 √2 是否属于 Q", tier: "A", mainlines: ["M1"] },
  { id: "M1-05", name: "判断集合元素的三特性", section: "1.1", samePrereq: ["M1-04"], foundationPrereq: [],
    judge: "能判断总体能否构成集合并识别重复", sample: "“全体高个子同学”能否成集合", tier: "A", mainlines: ["M1"] },
  { id: "M1-06", name: "列举法表示集合", section: "1.1", samePrereq: ["M1-04"], foundationPrereq: ["方程求解"],
    judge: "能把元素不多的集合完整列出", sample: "写出方程 x²=1 的解集", tier: "A", mainlines: ["M1"] },
  { id: "M1-07", name: "描述法表示集合", section: "1.1", samePrereq: ["M1-04"], foundationPrereq: ["BG048解不等式"],
    judge: "能用公共特征写出简单数集", sample: "写出所有偶数组成的集合", tier: "A", mainlines: ["M1"] },
  { id: "M1-08", name: "集合表示法互化", section: "1.1", samePrereq: ["M1-06","M1-07"], foundationPrereq: ["BG048"],
    judge: "能在列举法与描述法间互换", sample: "{x:-1≤x<2,x∈Z} 写成列举法", tier: "A", mainlines: ["M1"] },
  { id: "M1-09", name: "判断子集关系", section: "1.2", samePrereq: ["M1-08"], foundationPrereq: ["BG102区间包含"],
    judge: "能判断 A 是否为 B 的子集", sample: "A={1,2},B={x∈N:x<3}, 判 A⊆B", tier: "A", mainlines: ["M1"] },
  { id: "M1-10", name: "判断集合相等", section: "1.2", samePrereq: ["M1-09"], foundationPrereq: [],
    judge: "能用双向包含判断集合相等", sample: "A={x²=1的解},B={-1,1}, 判 A=B", tier: "A", mainlines: ["M1"] },
  { id: "M1-11", name: "求交集", section: "1.3", samePrereq: ["M1-09"], foundationPrereq: ["BG102数轴"],
    judge: "能求两集合公共部分", sample: "求 (-1,2] 与 [0,3) 的交集", tier: "A", mainlines: ["M1"] },
  { id: "M1-12", name: "求并集", section: "1.3", samePrereq: ["M1-09"], foundationPrereq: ["BG102数轴"],
    judge: "能求两集合并集", sample: "求 [1,2] 与 (2,4) 的并集", tier: "A", mainlines: ["M1"] },
  { id: "M1-13", name: "求补集", section: "1.3", samePrereq: ["M1-09"], foundationPrereq: ["全集意识"],
    judge: "能在给定全集下求补集", sample: "U=R,A=[0,1], 求 ∁ᵤA", tier: "A", mainlines: ["M1"] },
  { id: "M1-14", name: "Venn图/数轴表示集合运算", section: "1.3", samePrereq: ["M1-11","M1-12","M1-13"], foundationPrereq: [],
    judge: "能把图示与集合式互译", sample: "阴影部分表示哪个集合", tier: "A", mainlines: ["M1"] },
  { id: "M1-15", name: "充分/必要/充要条件判定", section: "1.4", samePrereq: ["M1-09"], foundationPrereq: [],
    judge: "能判断 p 是 q 的什么条件", sample: "p:x=2,q:x²=4, 判条件关系", tier: "A", mainlines: ["M1"] },
  { id: "M1-16", name: "识别全称量词命题", section: "1.5.1", samePrereq: [], foundationPrereq: [],
    judge: "能识别全称命题", sample: "“任意x∈R,x²+1>0”属何类命题", tier: "A", mainlines: ["M1"] },
  { id: "M1-17", name: "识别存在量词命题", section: "1.5.1", samePrereq: [], foundationPrereq: [],
    judge: "能识别存在命题", sample: "“存在x∈R,x²=2”属何类命题", tier: "A", mainlines: ["M1"] },
  { id: "M1-18", name: "含一个量词命题的否定", section: "1.5.2", samePrereq: ["M1-16","M1-17"], foundationPrereq: [],
    judge: "能正确互换量词并否定结论", sample: "否定: ∀x∈R,x²≥0", tier: "B", mainlines: ["M1"] },
  { id: "M1-19", name: "用反例判定量词命题真假", section: "1.5.1", samePrereq: ["M1-16","M1-17","M1-18"], foundationPrereq: ["代数检验"],
    judge: "能用反例否定全称命题", sample: "判 “∀x∈R,x³>0” 真假", tier: "B", mainlines: ["M1"] },
  { id: "M1-20", name: "作差法比较大小", section: "2.1", samePrereq: [], foundationPrereq: ["BG026因式分解","BG052配方"],
    judge: "能把大小比较转为差的正负", sample: "比较 (a+1)² 与 a²+1", tier: "B", mainlines: ["M1"] },
  { id: "M1-21", name: "作商法比较正数大小", section: "2.1", samePrereq: [], foundationPrereq: ["BG034分式"],
    judge: "能在正数时用商与1比较", sample: "比较 (a+1)/(a+2) 与 1 (a>-1)", tier: "C", mainlines: ["M1"] },
  { id: "M1-22", name: "直接套用基本不等式求最值", section: "2.2", samePrereq: [], foundationPrereq: ["BG086条件"],
    judge: "能识别均值结构直接求最值", sample: "x>0, 求 x+1/x 的最小值", tier: "B", mainlines: ["M1"] },
  { id: "M1-23", name: "基本不等式取等条件检查", section: "2.2", samePrereq: ["M1-22"], foundationPrereq: ["BG043"],
    judge: "能给出取等条件", sample: "x+4/x 的最小值何时取到", tier: "B", mainlines: ["M1"] },
  { id: "M1-24", name: "由图象判定一元二次不等式解集", section: "2.3", samePrereq: [], foundationPrereq: ["BG066","BG101"],
    judge: "能把不等式转成图象上下方", sample: "解 x²-1>0", tier: "A", mainlines: ["M1"] },
  { id: "M1-25", name: "由根与开口快速写解集", section: "2.3", samePrereq: ["M1-24"], foundationPrereq: ["BG054"],
    judge: "看到根和开口即报区间", sample: "开口向上根为1、3, 解 f(x)<0", tier: "A", mainlines: ["M1"] },
  { id: "M1-26", name: "识别复数实部虚部与分类", section: "7.1.1", samePrereq: [], foundationPrereq: ["BG094"],
    judge: "能写 a+bi 标准形并分类", sample: "z=2-i, 写实部虚部并分类", tier: "A", mainlines: ["M1"] },
  { id: "M1-27", name: "复数相等求参数", section: "7.1.1", samePrereq: ["M1-26"], foundationPrereq: ["BG046"],
    judge: "能由实虚部分别相等求参", sample: "a+2i=3+bi, 求 a,b", tier: "A", mainlines: ["M1"] },
  { id: "M1-28", name: "复平面点/向量与复数互译", section: "7.1.1", samePrereq: ["M1-26"], foundationPrereq: ["BG059"],
    judge: "能在复数与点坐标间互译", sample: "1-2i 对应点坐标", tier: "A", mainlines: ["M1"] },
  { id: "M1-29", name: "复数加减及几何意义", section: "7.2.1", samePrereq: ["M1-26","M1-28"], foundationPrereq: ["BG016"],
    judge: "能完成复数加减并知向量意义", sample: "(1+2i)-(3-i)", tier: "A", mainlines: ["M1"] },
  { id: "M1-30", name: "复数乘除与共轭化简", section: "7.2.2", samePrereq: ["M1-26","M1-29"], foundationPrereq: ["BG023","BG041"],
    judge: "能把乘除结果化成 a+bi", sample: "(1+i)/(1-i)", tier: "A", mainlines: ["M1"] },
  // v1.1 §D1 补充隐形节点
  { id: "M1-31", name: "空集陷阱：含参子集检验空集", section: "1.2", samePrereq: ["M1-09"], foundationPrereq: ["BG043"],
    judge: "处理含参子集时主动检验空集边界", sample: "{x|ax-2=0}⊆{1,2}, 求 a 取值集合", tier: "C", mainlines: ["M1"] },
  { id: "M1-32", name: "含参二次不等式按开口分类", section: "2.3", samePrereq: ["M1-25"], foundationPrereq: ["BG054"],
    judge: "能按二次项系数符号分类讨论", sample: "解 ax²-2x>0", tier: "C", mainlines: ["M1"] },
  { id: "M1-33", name: "基本不等式 1 的代换配凑", section: "2.2", samePrereq: ["M1-23"], foundationPrereq: ["BG034"],
    judge: "能用已知和=1代换配凑求最值", sample: "a+b=1(a,b>0), 求 1/a+1/b 最小值", tier: "C", mainlines: ["M1"] },
];

// ===================== M2a 节点（采自 4-2 共50个 + M2a-51）=====================
// 为控制篇幅此处列关键节点的完整结构 + 其余以紧凑数组给出；导入时全部按同结构展开。
// tier 标注规则：定义域/求值/单调奇偶基础/指对运算与比较 = A；分段作图/零点存在/换元 = B；异底中间量法/模型选择/二分法/抽象代换 = C
export const M2aNodes = [
  { id: "M2a-01", name: "定义域优先", section: "3.1.1", samePrereq: [], foundationPrereq: ["根式/分母/对数条件"],
    judge: "求值或判性质前先写定义域限制", sample: "求 f(x)=√(x+1)/(x-2) 定义域", tier: "A", mainlines: ["M2a"] },
  { id: "M2a-03", name: "求函数定义域", section: "3.1.1", samePrereq: ["M2a-01","M2a-02"], foundationPrereq: ["BG031","BG101"],
    judge: "能求简单解析式定义域", sample: "求 f(x)=√(x+2)/(x-1) 定义域", tier: "A", mainlines: ["M2a"] },
  { id: "M2a-04", name: "求函数值 f(a)", section: "3.1.1", samePrereq: ["M2a-03"], foundationPrereq: ["BG017"],
    judge: "能正确代入求 f(a)", sample: "f(x)=x²-1, 求 f(-2)", tier: "A", mainlines: ["M2a"] },
  { id: "M2a-09", name: "分段函数先判区间再求值", section: "3.1.2", samePrereq: ["M2a-07"], foundationPrereq: ["BG003"],
    judge: "能先判区间再求值", sample: "已知分段函数求 f(-2)", tier: "A", mainlines: ["M2a"] },
  { id: "M2a-13", name: "用定义判断单调性", section: "3.2.1", samePrereq: ["M2a-03"], foundationPrereq: ["BG026作差"],
    judge: "能用定义证明区间单调", sample: "证 f(x)=2x+1 在 R 递增", tier: "B", mainlines: ["M2a"] },
  { id: "M2a-17", name: "按定义判断奇偶性", section: "3.2.2", samePrereq: ["M2a-16"], foundationPrereq: ["BG015"],
    judge: "能用 f(-x)=±f(x) 判断", sample: "判 f(x)=x³+x 奇偶性", tier: "A", mainlines: ["M2a"] },
  { id: "M2a-32", name: "指数函数单调性比较大小", section: "4.2", samePrereq: ["M2a-31"], foundationPrereq: ["BG089"],
    judge: "能把指数大小比较转成指数比较", sample: "比较 2^0.3 与 2^-1", tier: "A", mainlines: ["M2a"] },
  { id: "M2a-33", name: "异底指数比较的中间量法", section: "4.2", samePrereq: ["M2a-32"], foundationPrereq: [],
    judge: "能借助1或同指数比较异底", sample: "比较 0.9^0.2 与 1.1^-0.2", tier: "C", mainlines: ["M2a"] },
  { id: "M2a-38", name: "对数运算法则化简求值", section: "4.3.2", samePrereq: ["M2a-35","M2a-36"], foundationPrereq: ["BG092"],
    judge: "能用积商幂法则化简对数", sample: "化简 log₂8+log₂4", tier: "A", mainlines: ["M2a"] },
  { id: "M2a-42", name: "对数函数单调性比较大小", section: "4.4.2", samePrereq: ["M2a-41"], foundationPrereq: [],
    judge: "能把同底对数比较转真数比较", sample: "比较 log₃2 与 log₃5", tier: "A", mainlines: ["M2a"] },
  { id: "M2a-48", name: "函数零点与方程根对应", section: "4.5.1", samePrereq: ["M2a-03","M2a-07"], foundationPrereq: ["BG069"],
    judge: "能把零点/交x轴/方程根对应", sample: "y=x²-1 有几个零点", tier: "B", mainlines: ["M2a"] },
  { id: "M2a-49", name: "零点存在性区间验证", section: "4.5.1", samePrereq: ["M2a-48"], foundationPrereq: [],
    judge: "能用端点异号验证零点区间", sample: "f(1)<0,f(2)>0, 判 (1,2) 有无零点", tier: "B", mainlines: ["M2a"] },
  { id: "M2a-51", name: "抽象函数 f(变量) 整体代换", section: "3.1.1", samePrereq: ["M2a-06"], foundationPrereq: ["BG103换元"],
    judge: "能由 f(g(x)) 反推 f(x) 并处理定义域", sample: "f(x+1)=x², 求 f(x)", tier: "C", mainlines: ["M2a"] },
  // …其余 4-2 的 M2a-02/05/06/07/08/10/11/12/14/15/16/18/19/20/21/22/23/24/25/26/27/28/29/30/31/34/35/36/37/39/40/41/43/44/45/46/47/50
  //   按相同结构补全（tier 按上方规则；前置照 4-2 表）
];

// ===================== 跨线桥（主线级，v1.0 §2.3 的20条；节点级细化随各主线生产时补）=====================
export const bridges = [
  { src: "M1", tgt: "M2a", type: "prerequisite", note: "二次方程/不等式→定义域/零点/参数范围 (2024 I卷T6)" },
  { src: "M1", tgt: "M4",  type: "prerequisite", note: "量词/不等式→数列证明" },
  { src: "M1", tgt: "M7",  type: "prerequisite", note: "不等式→圆锥曲线范围最值 (2024 I卷T11)" },
  { src: "M1", tgt: "M8",  type: "prerequisite", note: "集合运算/逻辑→事件运算/条件概率 (2024 I卷T14)" },
  { src: "M2a", tgt: "M3",  type: "prerequisite", note: "函数性质→三角函数图像性质 (2024 I卷T7)" },
  { src: "M2a", tgt: "M2b", type: "prerequisite", note: "函数→导数" },
  { src: "M2a", tgt: "M4",  type: "tool",         note: "单调性工具→递推数列单调性" },
  { src: "M2a", tgt: "M7",  type: "tool",         note: "函数化求范围最值 (2024 I卷T16)" },
  { src: "M2a", tgt: "M8",  type: "tool",         note: "对数线性化回归/正态参数函数视角" },
  { src: "M2b", tgt: "M7",  type: "tool",         note: "导数求切线/最值 (2025 I卷T18)" },
  { src: "M3", tgt: "M6",  type: "tool",         note: "截面三角形正余弦定理求空间角" },
  { src: "M3", tgt: "M7",  type: "tool",         note: "斜率=tanα；三角换元" },
  { src: "M3", tgt: "M2b", type: "tool",         note: "导数压轴三角化简 (2025 I卷T19)" },
  { src: "M5", tgt: "M3",  type: "prerequisite", note: "向量导出余弦定理 (教材6.4.3)" },
  { src: "M5", tgt: "M6",  type: "prerequisite", note: "平面向量→空间向量法" },
  { src: "M5", tgt: "M7",  type: "tool",         note: "垂直/共线/面积的坐标化 (2024 I卷T3/T16)" },
  { src: "M4", tgt: "M8",  type: "tool",         note: "数列求和→期望递推 (2023 I卷T21)" },
  { src: "M7", tgt: "M6",  type: "tool",         note: "建系/坐标法二维原型→三维" },
  // M0→各主线 以节点级 foundationPrereq 表达，不存泛化边
];

// ===================== 视频映射示例（采自 5-2，待人工核实存在性）=====================
// 挂在节点的 videoLinks 字段；role 与 tier 配合（A层先挂预热+主线，C层挂框架课）
export const videoMapSample: Record<string, any[]> = {
  "M1-11": [ // 求交集（集合运算，A层）
    { title: "高中数学先修课-集合预热", searchKey: "乐乐课堂-天天练APP｜高中数学先修课｜集合", uper: "乐乐课堂", duration: "≤6min", role: "预热", note: "" },
    { title: "1.1集合的概念与运算(基础篇A)", searchKey: "数学微课帮｜高中数学专题复习-高中数学｜1.1 集合的概念与运算(基础篇A）", uper: "数学微课帮", duration: "23:40", role: "主线", note: "第一次系统听顺概念+运算" },
  ],
  "M1-15": [ // 充要条件
    { title: "1.2命题及其关系、充分条件与必要条件(基础A)", searchKey: "数学微课帮｜高中数学专题复习-高中数学｜1.2 命题及其关系、充分条件与必要条件(基础A）", uper: "数学微课帮", duration: "14:59", role: "主线", note: "高频混点集中讲" },
  ],
  "M2a-01": [ // 定义域优先 / 函数概念（A层，建议先圆脸比喻课）
    { title: "函数三要素：草、牛、奶(上)", searchKey: "拯救数学如愿课堂｜〖圆脸〗高中数学《函数》——2.函数三要素：草、牛、奶（上）", uper: "圆脸", duration: "11:23", role: "预热", note: "对函数完全没感觉时先看" },
    { title: "2.1函数及其表示(基础A)", searchKey: "数学微课帮｜高中数学专题复习-高中数学｜2.1 函数及其表示(基础A）", uper: "数学微课帮", duration: "15:50", role: "主线", note: "" },
  ],
  // 分式基本运算：暂缺 → 回初中讲义补，videoLinks 留空
};
