/**
 * M3 初诊真题种子 · Batch 1（101 题，已人工复核）
 *
 * 来源：
 * - M1 初诊题首批.md   （60 题：boundary 21 + variant 21 + concept 10 + drill 8）
 * - 初诊题产出.md        （41 题：BG 地基 5 + M2a A 层 8）
 *
 * 确定性 ID = {nodeId}-{role}-{序号}，幂等可重复导入。
 * 答案已人工复核通过，直接采用。reviewed = true。
 *
 * String.raw 用于 LaTeX 字段——防止 \b \f \n \t \r 被解释为转义字符。
 */

export interface SeedItem {
  nodeId: string;
  role: string;       // "boundary" | "variant" | "concept" | "drill"
  stem: string;
  answer: string;
  pairWith?: string;  // variant/concept 配对的 boundary ID
  conceptCue?: string;
  note?: string;
  reviewed: boolean;
  source: string;
}

// 辅助：只用 String.raw 防 LaTeX 转义
const raw = String.raw;

// ====== M1 集合与命题（M1-04 ~ M1-17）======

export const seedItems: SeedItem[] = [

  // --- M1-04 ---
  { nodeId: "M1-04", role: "boundary", stem: raw`判断：\(\pi\) 是否属于 \(\mathbb{Q}\)？`, answer: raw`不属于 \(\mathbb{Q}\)。`, source: "初诊首批·人工审", reviewed: true },
  { nodeId: "M1-04", role: "variant", stem: raw`判断：\(-\dfrac{3}{4}\) 是否属于 \(\mathbb{Q}\)？`, answer: raw`属于 \(\mathbb{Q}\)。`, pairWith: "M1-04-boundary", source: "初诊首批·人工审", reviewed: true },
  { nodeId: "M1-04", role: "concept", stem: raw`判断：\(\sqrt{4}\) 是否属于 \(\mathbb{Q}\)？`, answer: raw`属于 \(\mathbb{Q}\)，因为 \(\sqrt{4}=2\)。`, conceptCue: raw`为什么"带根号"不一定就不是有理数？`, source: "初诊首批·人工审", reviewed: true },

  // --- M1-05 ---
  { nodeId: "M1-05", role: "boundary", stem: raw`判断：\(A=\{1,1,2,2\}\) 与 \(B=\{1,2\}\) 是否表示同一个集合。`, answer: raw`是，表示同一个集合。`, source: "初诊首批·人工审", reviewed: true },
  { nodeId: "M1-05", role: "variant", stem: raw`判断：\(C=\{a,a,b\}\) 与 \(D=\{a,b\}\) 是否表示同一个集合。`, answer: raw`是，表示同一个集合。`, pairWith: "M1-05-boundary", source: "初诊首批·人工审", reviewed: true },
  { nodeId: "M1-05", role: "concept", stem: raw`"全体很高的同学"能否构成集合？`, answer: raw`不能。`, conceptCue: raw`为什么"很高"会让元素是否属于这个"总体"变得不确定？`, source: "初诊首批·人工审", reviewed: true },

  // --- M1-06 ---
  { nodeId: "M1-06", role: "boundary", stem: raw`用列举法写出方程 \(x^2=4\) 的解集。`, answer: raw`\(\{-2,2\}\)`, source: "初诊首批·人工审", reviewed: true },
  { nodeId: "M1-06", role: "variant", stem: raw`用列举法写出方程 \(x^2=9\) 的解集。`, answer: raw`\(\{-3,3\}\)`, pairWith: "M1-06-boundary", source: "初诊首批·人工审", reviewed: true },

  // --- M1-07 ---
  { nodeId: "M1-07", role: "boundary", stem: raw`用描述法表示"所有偶整数"组成的集合。`, answer: raw`\(\{x\in \mathbb{Z}\mid x\text{ 是偶数}\}\)`, source: "初诊首批·人工审", reviewed: true },
  { nodeId: "M1-07", role: "variant", stem: raw`用描述法表示"所有负整数"组成的集合。`, answer: raw`\(\{x\in \mathbb{Z}\mid x<0\}\)`, pairWith: "M1-07-boundary", source: "初诊首批·人工审", reviewed: true },
  { nodeId: "M1-07", role: "concept", stem: raw`集合 \(A=\{x\mid x\text{ 是偶数}\}\) 少写了哪一类信息？`, answer: raw`少写了 \(x\) 的所属数集，如 \(x\in\mathbb{Z}\)。`, conceptCue: raw`为什么写描述法时，常常要先写清 \(x\) 属于哪个数集？`, source: "初诊首批·人工审", reviewed: true },

  // --- M1-08 ---
  { nodeId: "M1-08", role: "boundary", stem: raw`把 \(A=\{x\in\mathbb{Z}\mid -2\le x<2\}\) 写成列举法。`, answer: raw`\(\{-2,-1,0,1\}\)`, source: "初诊首批·人工审", reviewed: true },
  { nodeId: "M1-08", role: "variant", stem: raw`把 \(B=\{x\in\mathbb{Z}\mid 1<x\le 4\}\) 写成列举法。`, answer: raw`\(\{2,3,4\}\)`, pairWith: "M1-08-boundary", source: "初诊首批·人工审", reviewed: true },

  // --- M1-09 ---
  { nodeId: "M1-09", role: "boundary", stem: raw`设 \(A=\{1,2\},\ B=\{1,2,3\}\)，判断 \(A\subseteq B\) 是否成立。`, answer: raw`成立。`, source: "初诊首批·人工审", reviewed: true },
  { nodeId: "M1-09", role: "variant", stem: raw`设 \(A=\{1,5\},\ B=\{1,2,3,4\}\)，判断 \(A\subseteq B\) 是否成立。`, answer: raw`不成立。`, pairWith: "M1-09-boundary", source: "初诊首批·人工审", reviewed: true },
  { nodeId: "M1-09", role: "concept", stem: raw`若 \(A=B=\{1,2\}\)，那么 \(A\subseteq B\) 是否成立？`, answer: raw`成立。`, conceptCue: raw`为什么"相等"时也仍然可以说"是子集"？`, source: "初诊首批·人工审", reviewed: true },

  // --- M1-10 ---
  { nodeId: "M1-10", role: "boundary", stem: raw`设 \(A=\{x\in\mathbb{R}\mid x^2=4\},\ B=\{-2,2\}\)，判断 \(A=B\) 是否成立。`, answer: raw`成立。`, source: "初诊首批·人工审", reviewed: true },
  { nodeId: "M1-10", role: "variant", stem: raw`设 \(A=\{0,1\},\ B=\{x\in\mathbb{Z}\mid 0\le x\le 1\}\)，判断 \(A=B\) 是否成立。`, answer: raw`成立。`, pairWith: "M1-10-boundary", source: "初诊首批·人工审", reviewed: true },

  // --- M1-11 ---
  { nodeId: "M1-11", role: "boundary", stem: raw`求 \([0,2]\cap[1,3]\)。`, answer: raw`\([1,2]\)`, source: "初诊首批·人工审", reviewed: true },
  { nodeId: "M1-11", role: "variant", stem: raw`求 \([-1,1]\cap(0,2]\)。`, answer: raw`\((0,1]\)`, pairWith: "M1-11-boundary", source: "初诊首批·人工审", reviewed: true },
  { nodeId: "M1-11", role: "drill", stem: raw`求 \((-\infty,1)\cap[0,+\infty)\)。`, answer: raw`\([0,1)\)`, source: "初诊首批·人工审", reviewed: true },

  // --- M1-12 ---
  { nodeId: "M1-12", role: "boundary", stem: raw`求 \([0,2]\cup[1,3]\)。`, answer: raw`\([0,3]\)`, source: "初诊首批·人工审", reviewed: true },
  { nodeId: "M1-12", role: "variant", stem: raw`求 \((-\infty,1)\cup[1,4)\)。`, answer: raw`\((-\infty,4)\)`, pairWith: "M1-12-boundary", source: "初诊首批·人工审", reviewed: true },
  { nodeId: "M1-12", role: "drill", stem: raw`求 \([0,1]\cup(2,3)\)。`, answer: raw`\([0,1]\cup(2,3)\)`, source: "初诊首批·人工审", reviewed: true },

  // --- M1-13 ---
  { nodeId: "M1-13", role: "boundary", stem: raw`已知全集 \(U=\mathbb{R}\)，\(A=(-\infty,2)\)，求 \(U\setminus A\)。`, answer: raw`\([2,+\infty)\)`, source: "初诊首批·人工审", reviewed: true },
  { nodeId: "M1-13", role: "variant", stem: raw`已知全集 \(U=\mathbb{R}\)，\(B=[-1,1]\)，求 \(U\setminus B\)。`, answer: raw`\((-\infty,-1)\cup(1,+\infty)\)`, pairWith: "M1-13-boundary", source: "初诊首批·人工审", reviewed: true },
  { nodeId: "M1-13", role: "drill", stem: raw`已知全集 \(U=\{1,2,3,4\}\)，\(C=\{1,4\}\)，求 \(U\setminus C\)。`, answer: raw`\(\{2,3\}\)`, source: "初诊首批·人工审", reviewed: true },

  // --- M1-14 ---
  { nodeId: "M1-14", role: "boundary", stem: raw`数轴上阴影部分表示所有满足 \(x<-1\) 或 \(x\ge 2\) 的实数，用区间表示这个集合。`, answer: raw`\((-\infty,-1)\cup[2,+\infty)\)`, source: "初诊首批·人工审", reviewed: true },
  { nodeId: "M1-14", role: "variant", stem: raw`数轴上阴影部分表示所有满足 \(-2\le x<1\) 的实数，用区间表示这个集合。`, answer: raw`\([-2,1)\)`, pairWith: "M1-14-boundary", source: "初诊首批·人工审", reviewed: true },
  { nodeId: "M1-14", role: "concept", stem: raw`在数轴上，端点 \(x=3\) 画实心点，写区间时 \(3\) 处该用中括号还是小括号？`, answer: raw`用中括号。`, conceptCue: raw`实心点和空心点分别对应"包含"还是"不包含"？`, source: "初诊首批·人工审", reviewed: true },

  // --- M1-15 ---
  { nodeId: "M1-15", role: "boundary", stem: raw`在实数范围内，设 \(p:x=3\)，\(q:x^2=9\)。判断 \(p\) 是 \(q\) 的什么条件。`, answer: raw`\(p\) 是 \(q\) 的充分不必要条件。`, source: "初诊首批·人工审", reviewed: true },
  { nodeId: "M1-15", role: "variant", stem: raw`在实数范围内，设 \(p:x=5\)，\(q:x^2=25\)。判断 \(p\) 是 \(q\) 的什么条件。`, answer: raw`\(p\) 是 \(q\) 的充分不必要条件。`, pairWith: "M1-15-boundary", source: "初诊首批·人工审", reviewed: true },
  { nodeId: "M1-15", role: "concept", stem: raw`在 boundary 那题里，给出一个"满足 \(q\) 但不满足 \(p\)"的 \(x\)。`, answer: raw`\(x=-3\)。`, conceptCue: raw`找到这样的反例后，你说明了哪一个方向不成立？`, source: "初诊首批·人工审", reviewed: true },

  // --- M1-16 ---
  { nodeId: "M1-16", role: "boundary", stem: raw`命题"对任意 \(x\in\mathbb{R}\)，都有 \(x+1>x\)"属于哪类命题？`, answer: raw`全称量词命题。`, source: "初诊首批·人工审", reviewed: true },
  { nodeId: "M1-16", role: "variant", stem: raw`命题"所有实数 \(x\) 都满足 \(x^2\ge 0\)"属于哪类命题？`, answer: raw`全称量词命题。`, pairWith: "M1-16-boundary", source: "初诊首批·人工审", reviewed: true },

  // --- M1-17 ---
  { nodeId: "M1-17", role: "boundary", stem: raw`命题"存在 \(x\in\mathbb{R}\)，使 \(x^2=9\)"属于哪类命题？`, answer: raw`存在量词命题。`, source: "初诊首批·人工审", reviewed: true },
  { nodeId: "M1-17", role: "variant", stem: raw`命题"至少有一个实数 \(x\) 使 \(x+2=0\)"属于哪类命题？`, answer: raw`存在量词命题。`, pairWith: "M1-17-boundary", source: "初诊首批·人工审", reviewed: true },

  // ====== M1 一元二次不等式（M1-24 ~ M1-25）======

  // --- M1-24 ---
  { nodeId: "M1-24", role: "boundary", stem: raw`用图象法解不等式：\(x^2-4>0\)。`, answer: raw`\((-\infty,-2)\cup(2,+\infty)\)`, source: "初诊首批·人工审", reviewed: true },
  { nodeId: "M1-24", role: "variant", stem: raw`用图象法解不等式：\(x^2-9>0\)。`, answer: raw`\((-\infty,-3)\cup(3,+\infty)\)`, pairWith: "M1-24-boundary", source: "初诊首批·人工审", reviewed: true },
  { nodeId: "M1-24", role: "drill", stem: raw`用图象法解不等式：\(x^2-1<0\)。`, answer: raw`\((-1,1)\)`, source: "初诊首批·人工审", reviewed: true },

  // --- M1-25 ---
  { nodeId: "M1-25", role: "boundary", stem: raw`已知二次函数 \(f(x)\) 的图象开口向上，并且与 \(x\) 轴交于 \(x=1\) 和 \(x=4\)。直接写出 \(f(x)<0\) 的解集。`, answer: raw`\((1,4)\)`, source: "初诊首批·人工审", reviewed: true },
  { nodeId: "M1-25", role: "variant", stem: raw`已知二次函数 \(f(x)\) 的图象开口向上，并且与 \(x\) 轴交于 \(x=-2\) 和 \(x=3\)。直接写出 \(f(x)<0\) 的解集。`, answer: raw`\((-2,3)\)`, pairWith: "M1-25-boundary", source: "初诊首批·人工审", reviewed: true },
  { nodeId: "M1-25", role: "concept", stem: raw`已知某二次函数开口向上，且根为 \(1\) 和 \(4\)。那么 \(f(2)\) 与 \(0\) 的大小关系是什么？`, answer: raw`\(f(2)<0\)。`, conceptCue: raw`为什么当 \(x=2\) 在两根之间时，函数值会落在 \(x\) 轴下方？`, source: "初诊首批·人工审", reviewed: true },
  { nodeId: "M1-25", role: "drill", stem: raw`已知二次函数 \(g(x)\) 的图象开口向下，并且与 \(x\) 轴交于 \(x=0\) 和 \(x=2\)。直接写出 \(g(x)<0\) 的解集。`, answer: raw`\((-\infty,0)\cup(2,+\infty)\)`, source: "初诊首批·人工审", reviewed: true },

  // ====== M1 复数（M1-26 ~ M1-30）======

  // --- M1-26 ---
  { nodeId: "M1-26", role: "boundary", stem: raw`已知 \(z=-4i\)。写出它的实部、虚部，并判断它属于实数、纯虚数还是非实复数。`, answer: raw`实部为 \(0\)，虚部为 \(-4\)，它是纯虚数。`, source: "初诊首批·人工审", reviewed: true },
  { nodeId: "M1-26", role: "variant", stem: raw`已知 \(z=3\)。写出它的实部、虚部，并判断它属于实数、纯虚数还是非实复数。`, answer: raw`实部为 \(3\)，虚部为 \(0\)，它是实数。`, pairWith: "M1-26-boundary", source: "初诊首批·人工审", reviewed: true },
  { nodeId: "M1-26", role: "concept", stem: raw`若 \(z=-3i\)，它的虚部是 \(-3\) 还是 \(-3i\)？`, answer: raw`虚部是 \(-3\)。`, conceptCue: raw`为什么"虚部"是不带 \(i\) 的那个实数？`, source: "初诊首批·人工审", reviewed: true },

  // --- M1-27 ---
  { nodeId: "M1-27", role: "boundary", stem: raw`若 \(a+3i=-2+bi\)，求 \(a,b\)。`, answer: raw`\(a=-2,\ b=3\)。`, source: "初诊首批·人工审", reviewed: true },
  { nodeId: "M1-27", role: "variant", stem: raw`若 \(m-5i=4+ni\)，求 \(m,n\)。`, answer: raw`\(m=4,\ n=-5\)。`, pairWith: "M1-27-boundary", source: "初诊首批·人工审", reviewed: true },
  { nodeId: "M1-27", role: "drill", stem: raw`若 \(2a+bi=6-4i\)，求 \(a,b\)。`, answer: raw`\(a=3,\ b=-4\)。`, source: "初诊首批·人工审", reviewed: true },

  // --- M1-28 ---
  { nodeId: "M1-28", role: "boundary", stem: raw`复数 \(z=2-3i\) 在复平面内对应点 \(P\)，写出 \(P\) 的坐标。`, answer: raw`\(P(2,-3)\)`, source: "初诊首批·人工审", reviewed: true },
  { nodeId: "M1-28", role: "variant", stem: raw`复数 \(z=-1+i\) 在复平面内对应点 \(Q\)，写出 \(Q\) 的坐标。`, answer: raw`\(Q(-1,1)\)`, pairWith: "M1-28-boundary", source: "初诊首批·人工审", reviewed: true },
  { nodeId: "M1-28", role: "concept", stem: raw`点 \(R(0,-2)\) 对应的复数是什么？`, answer: raw`\(-2i\)`, conceptCue: raw`横坐标为什么给实部，纵坐标为什么给虚部？`, source: "初诊首批·人工审", reviewed: true },

  // --- M1-29 ---
  { nodeId: "M1-29", role: "boundary", stem: raw`计算 \((3+2i)-(1+i)\)，并把结果写成 \(a+bi\) 形式。`, answer: raw`\(2+i\)`, source: "初诊首批·人工审", reviewed: true },
  { nodeId: "M1-29", role: "variant", stem: raw`计算 \((5-i)-(2-3i)\)，并把结果写成 \(a+bi\) 形式。`, answer: raw`\(3+2i\)`, pairWith: "M1-29-boundary", source: "初诊首批·人工审", reviewed: true },
  { nodeId: "M1-29", role: "concept", stem: raw`已知 \(z_1=3+2i,\ z_2=1+i\)。为什么 \(z_1-z_2=2+i\) 可以看成从点 \(z_2\) 指向点 \(z_1\) 的向量？`, answer: raw`因为对应坐标差是 \((3-1,\ 2-1)=(2,1)\)，恰好对应复数 \(2+i\)。`, conceptCue: raw`你能把"减法"翻成"坐标差"来说一遍吗？`, source: "初诊首批·人工审", reviewed: true },
  { nodeId: "M1-29", role: "drill", stem: raw`计算 \((1-2i)+(3+i)\)，并把结果写成 \(a+bi\) 形式。`, answer: raw`\(4-i\)`, source: "初诊首批·人工审", reviewed: true },

  // --- M1-30 ---
  { nodeId: "M1-30", role: "boundary", stem: raw`计算 \(\dfrac{1+3i}{1-i}\)，并化成 \(a+bi\) 形式。`, answer: raw`\(-1+2i\)`, source: "初诊首批·人工审", reviewed: true },
  { nodeId: "M1-30", role: "variant", stem: raw`计算 \(\dfrac{2+2i}{1-i}\)，并化成 \(a+bi\) 形式。`, answer: raw`\(2i\)`, pairWith: "M1-30-boundary", source: "初诊首批·人工审", reviewed: true },
  { nodeId: "M1-30", role: "drill", stem: raw`计算 \((1+i)(2-i)\)，并化成 \(a+bi\) 形式。`, answer: raw`\(3+i\)`, source: "初诊首批·人工审", reviewed: true },

  // ====== BG 地基（BG100 ~ BG104）======
  // 来源：初诊题产出.md

  // --- BG100 ---
  { nodeId: "BG100", role: "boundary", stem: raw`已知 \(x^2-7x+10=0\)，写出两根之和与两根之积。`, answer: raw`两根之和为 \(7\)，两根之积为 \(10\)。`, source: "初诊题产出·人工审", reviewed: true },
  { nodeId: "BG100", role: "variant", stem: raw`已知 \(x^2+3x-4=0\)，写出两根之和与两根之积。`, answer: raw`两根之和为 \(-3\)，两根之积为 \(-4\)。`, pairWith: "BG100-boundary", source: "初诊题产出·人工审", reviewed: true },
  { nodeId: "BG100", role: "drill", stem: raw`已知 \(x^2-x-12=0\)，写出两根之和与两根之积。`, answer: raw`两根之和为 \(1\)，两根之积为 \(-12\)。`, source: "初诊题产出·人工审", reviewed: true },

  // --- BG101 ---
  { nodeId: "BG101", role: "boundary", stem: raw`解不等式 \((x-2)(x-5)<0\)。`, answer: raw`解集为 \((2,5)\)。`, source: "初诊题产出·人工审", reviewed: true },
  { nodeId: "BG101", role: "variant", stem: raw`解不等式 \((x+1)(x-3)>0\)。`, answer: raw`解集为 \((-\infty,-1)\cup(3,+\infty)\)。`, pairWith: "BG101-boundary", source: "初诊题产出·人工审", reviewed: true },
  { nodeId: "BG101", role: "drill", stem: raw`解不等式 \((x-4)(x-6)\le 0\)。`, answer: raw`解集为 \([4,6]\)。`, source: "初诊题产出·人工审", reviewed: true },

  // --- BG102 ---
  { nodeId: "BG102", role: "boundary", stem: raw`把集合 \(\{x\mid -2\le x<3\}\) 写成区间。`, answer: raw`\([-2,3)\)。`, source: "初诊题产出·人工审", reviewed: true },
  { nodeId: "BG102", role: "variant", stem: raw`把集合 \(\{x\mid 0<x\le 5\}\) 写成区间。`, answer: raw`\((0,5]\)。`, pairWith: "BG102-boundary", source: "初诊题产出·人工审", reviewed: true },
  { nodeId: "BG102", role: "drill", stem: raw`把区间 \((-1,4]\) 写成集合。`, answer: raw`\(\{x\mid -1<x\le 4\}\)。`, source: "初诊题产出·人工审", reviewed: true },
  { nodeId: "BG102", role: "drill", stem: raw`把不等式 \(x\ge 2\) 写成区间。`, answer: raw`\([2,+\infty)\)。`, source: "初诊题产出·人工审", reviewed: true },

  // --- BG103 ---
  { nodeId: "BG103", role: "boundary", stem: raw`设 \(t=x^2\)，把方程 \(x^4-10x^2+9=0\) 化为关于 \(t\) 的方程。`, answer: raw`\(t^2-10t+9=0\)。`, source: "初诊题产出·人工审", reviewed: true },
  { nodeId: "BG103", role: "variant", stem: raw`设 \(t=x^2\)，把方程 \(x^4-13x^2+36=0\) 化为关于 \(t\) 的方程。`, answer: raw`\(t^2-13t+36=0\)。`, pairWith: "BG103-boundary", source: "初诊题产出·人工审", reviewed: true },
  { nodeId: "BG103", role: "concept", stem: raw`方程 \(x^4-6x^2+5=0\) 中，为什么更适合设 \(t=x^2\)，而不是设 \(t=x\)？`, answer: raw`因为式子里反复出现的是 \(x^2\) 这一整块，且 \(x^4=(x^2)^2\)。设 \(t=x^2\) 后可化成一元二次式 \(t^2-6t+5=0\)；若设 \(t=x\)，式子并没有变简单。`, conceptCue: raw`这里反复出现的"整块"到底是哪一块？`, source: "初诊题产出·人工审", reviewed: true },

  // --- BG104 ---
  { nodeId: "BG104", role: "boundary", stem: raw`求函数 \(y=x^2-6x+5\) 在闭区间 \([1,5]\) 上的最小值和最大值。`, answer: raw`最小值为 \(-4\)，最大值为 \(0\)。`, source: "初诊题产出·人工审", reviewed: true },
  { nodeId: "BG104", role: "variant", stem: raw`求函数 \(y=x^2-4x+1\) 在闭区间 \([1,4]\) 上的最小值和最大值。`, answer: raw`最小值为 \(-3\)，最大值为 \(1\)。`, pairWith: "BG104-boundary", source: "初诊题产出·人工审", reviewed: true },
  { nodeId: "BG104", role: "drill", stem: raw`求函数 \(y=x^2-2x-3\) 在闭区间 \([0,3]\) 上的最小值和最大值。`, answer: raw`最小值为 \(-4\)，最大值为 \(0\)。`, source: "初诊题产出·人工审", reviewed: true },

  // ====== M2a A 层（M2a-01 ~ M2a-42）======
  // 来源：初诊题产出.md

  // --- M2a-01 ---
  { nodeId: "M2a-01", role: "boundary", stem: raw`已知 \(f(x)=\dfrac{\sqrt{x+4}}{x-1}\)。若要计算 \(f(0)\)，第一步应先做什么？并写出相应限制条件。`, answer: raw`先写定义域限制：\(x+4\ge 0,\ x-1\ne 0\)。所以定义域为 \([-4,1)\cup(1,+\infty)\)。`, source: "初诊题产出·人工审", reviewed: true },
  { nodeId: "M2a-01", role: "variant", stem: raw`已知 \(f(x)=\dfrac{\sqrt{x+2}}{x-1}\)。若要判断它的性质，第一步应先做什么？并写出相应限制条件。`, answer: raw`先写定义域限制：\(x+2\ge 0,\ x-1\ne 0\)。所以定义域为 \([-2,1)\cup(1,+\infty)\)。`, pairWith: "M2a-01-boundary", source: "初诊题产出·人工审", reviewed: true },
  { nodeId: "M2a-01", role: "concept", stem: raw`判断正误：研究函数 \(f(x)=\dfrac{\sqrt{x+1}}{x-2}\) 时，可以先不看定义域，直接讨论。`, answer: raw`错。应先写定义域：\(x+1\ge 0,\ x-2\ne 0\)，即定义域为 \([-1,2)\cup(2,+\infty)\)。`, conceptCue: raw`为什么不先写定义域，后面的讨论可能会出错？`, source: "初诊题产出·人工审", reviewed: true },

  // --- M2a-03 ---
  { nodeId: "M2a-03", role: "boundary", stem: raw`求函数 \(f(x)=\dfrac{\sqrt{x+5}}{x+2}\) 的定义域。`, answer: raw`定义域为 \([-5,-2)\cup(-2,+\infty)\)。`, source: "初诊题产出·人工审", reviewed: true },
  { nodeId: "M2a-03", role: "variant", stem: raw`求函数 \(f(x)=\dfrac{\sqrt{x+3}}{x-1}\) 的定义域。`, answer: raw`定义域为 \([-3,1)\cup(1,+\infty)\)。`, pairWith: "M2a-03-boundary", source: "初诊题产出·人工审", reviewed: true },
  { nodeId: "M2a-03", role: "drill", stem: raw`求函数 \(f(x)=\dfrac{\sqrt{x+1}}{x}\) 的定义域。`, answer: raw`定义域为 \([-1,0)\cup(0,+\infty)\)。`, source: "初诊题产出·人工审", reviewed: true },

  // --- M2a-04 ---
  { nodeId: "M2a-04", role: "boundary", stem: raw`已知 \(f(x)=2x-3\)，求 \(f(-1)\)。`, answer: raw`\(f(-1)=2(-1)-3=-5\)。`, source: "初诊题产出·人工审", reviewed: true },
  { nodeId: "M2a-04", role: "variant", stem: raw`已知 \(f(x)=x^2+1\)，求 \(f(3)\)。`, answer: raw`\(f(3)=3^2+1=10\)。`, pairWith: "M2a-04-boundary", source: "初诊题产出·人工审", reviewed: true },
  { nodeId: "M2a-04", role: "drill", stem: raw`已知 \(f(x)=3-x\)，求 \(f(2)\)。`, answer: raw`\(f(2)=3-2=1\)。`, source: "初诊题产出·人工审", reviewed: true },

  // --- M2a-09 ---
  { nodeId: "M2a-09", role: "boundary", stem: raw`已知 \(f(x)=\begin{cases}x+2,&x<0\\2x-1,&x\ge 0\end{cases}\)，求 \(f(-3)\)。`, answer: raw`因为 \(-3<0\)，所以取第一段，\(f(-3)=-3+2=-1\)。`, source: "初诊题产出·人工审", reviewed: true },
  { nodeId: "M2a-09", role: "variant", stem: raw`已知 \(f(x)=\begin{cases}x-1,&x<1\\x+2,&x\ge 1\end{cases}\)，求 \(f(4)\)。`, answer: raw`因为 \(4\ge 1\)，所以取第二段，\(f(4)=4+2=6\)。`, pairWith: "M2a-09-boundary", source: "初诊题产出·人工审", reviewed: true },
  { nodeId: "M2a-09", role: "concept", stem: raw`已知 \(f(x)=\begin{cases}2x,&x\le 1\\x+3,&x>1\end{cases}\)，求 \(f(1)\)。`, answer: raw`因为 \(1\le 1\)，所以取第一段，\(f(1)=2\)。`, conceptCue: raw`为什么 \(x=1\) 只能落在其中一段，不能两段都代？`, source: "初诊题产出·人工审", reviewed: true },

  // --- M2a-17 ---
  { nodeId: "M2a-17", role: "boundary", stem: raw`判断函数 \(f(x)=x^3-x\) 的奇偶性。`, answer: raw`\(f(-x)=(-x)^3-(-x)=-x^3+x=-(x^3-x)=-f(x)\)，所以 \(f(x)\) 是奇函数。`, source: "初诊题产出·人工审", reviewed: true },
  { nodeId: "M2a-17", role: "variant", stem: raw`判断函数 \(f(x)=x^2+1\) 的奇偶性。`, answer: raw`\(f(-x)=(-x)^2+1=x^2+1=f(x)\)，所以 \(f(x)\) 是偶函数。`, pairWith: "M2a-17-boundary", source: "初诊题产出·人工审", reviewed: true },
  { nodeId: "M2a-17", role: "concept", stem: raw`判断函数 \(f(x)=x^3+1\) 的奇偶性。`, answer: raw`\(f(-x)=-x^3+1\)，既不等于 \(f(x)=x^3+1\)，也不等于 \(-f(x)=-x^3-1\)，所以是非奇非偶函数。`, conceptCue: raw`先把 \(f(-x)\) 真正算出来，再分别和 \(f(x)\)、\(-f(x)\) 对比。`, source: "初诊题产出·人工审", reviewed: true },

  // --- M2a-32 ---
  { nodeId: "M2a-32", role: "boundary", stem: raw`比较 \(3^2\) 与 \(3^{-1}\) 的大小。`, answer: raw`因为底数 \(3>1\)，且 \(2>-1\)，所以 \(3^2>3^{-1}\)。`, source: "初诊题产出·人工审", reviewed: true },
  { nodeId: "M2a-32", role: "variant", stem: raw`比较 \(2^{-3}\) 与 \(2^{-1}\) 的大小。`, answer: raw`因为底数 \(2>1\)，且 \(-3<-1\)，所以 \(2^{-3}<2^{-1}\)。`, pairWith: "M2a-32-boundary", source: "初诊题产出·人工审", reviewed: true },
  { nodeId: "M2a-32", role: "drill", stem: raw`比较 \(5^0\) 与 \(5^{-2}\) 的大小。`, answer: raw`因为底数 \(5>1\)，且 \(0>-2\)，所以 \(5^0>5^{-2}\)。`, source: "初诊题产出·人工审", reviewed: true },

  // --- M2a-38 ---
  { nodeId: "M2a-38", role: "boundary", stem: raw`化简并求值 \(\log_2 2+\log_2 16\)。`, answer: raw`\(\log_2 2+\log_2 16=\log_2(2\cdot 16)=\log_2 32=5\)。`, source: "初诊题产出·人工审", reviewed: true },
  { nodeId: "M2a-38", role: "variant", stem: raw`化简并求值 \(\log_5 5+\log_5 25\)。`, answer: raw`\(\log_5 5+\log_5 25=\log_5(5\cdot 25)=\log_5 125=3\)。`, pairWith: "M2a-38-boundary", source: "初诊题产出·人工审", reviewed: true },
  { nodeId: "M2a-38", role: "drill", stem: raw`化简并求值 \(\log_2 16-\log_2 4\)。`, answer: raw`\(\log_2 16-\log_2 4=\log_2\!\left(\dfrac{16}{4}\right)=\log_2 4=2\)。`, source: "初诊题产出·人工审", reviewed: true },
  { nodeId: "M2a-38", role: "drill", stem: raw`化简并求值 \(2\log_3 3\)。`, answer: raw`\(2\log_3 3=\log_3 3^2=\log_3 9=2\)。`, source: "初诊题产出·人工审", reviewed: true },

  // --- M2a-42 ---
  { nodeId: "M2a-42", role: "boundary", stem: raw`比较 \(\log_4 2\) 与 \(\log_4 8\) 的大小。`, answer: raw`因为底数 \(4>1\)，且 \(2<8\)，所以 \(\log_4 2<\log_4 8\)。`, source: "初诊题产出·人工审", reviewed: true },
  { nodeId: "M2a-42", role: "variant", stem: raw`比较 \(\log_2 7\) 与 \(\log_2 3\) 的大小。`, answer: raw`因为底数 \(2>1\)，且 \(7>3\)，所以 \(\log_2 7>\log_2 3\)。`, pairWith: "M2a-42-boundary", source: "初诊题产出·人工审", reviewed: true },
  { nodeId: "M2a-42", role: "drill", stem: raw`比较 \(\log_5 1\) 与 \(\log_5 4\) 的大小。`, answer: raw`因为底数 \(5>1\)，且 \(1<4\)，所以 \(\log_5 1<\log_5 4\)。`, source: "初诊题产出·人工审", reviewed: true },
];
