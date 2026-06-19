# 2024 新课标 I 卷 数学 · 看图核准版转写

> 由参谋长 Claude **逐页看图**核准（page-01.jpg…）。**取代**项目 AI 那份从文字反推、含大量 [存疑] 的初稿。
> 来源图：doc/research/extracted/2024/pages/。共 19 题。
> 字段：qid / number / type / score / stem(LaTeX) / options / answer / analysis_brief / has_figure / tier_hint
> 进度：Q1–Q4 已核准；Q5–Q19 待续（逐批补）。

---

```yaml
- qid: 2024-T1
  number: 1
  type: 单选
  score: 5
  stem: "已知集合 $A=\\{x \\mid -5 < x^{3} < 5\\}$，$B=\\{-3,-1,0,2,3\\}$，则 $A\\cap B=$"
  options: { A: "$\\{-1,0\\}$", B: "$\\{2,3\\}$", C: "$\\{-3,-1,0\\}$", D: "$\\{-1,0,2\\}$" }
  answer: A
  analysis_brief: "$A=\\{x \\mid -\\sqrt[3]{5} < x < \\sqrt[3]{5}\\}$，注意 $1<\\sqrt[3]{5}<2$，故 $A\\cap B=\\{-1,0\\}$。"
  has_figure: false
  tier_hint: A   # 集合交集 → 对应 M1-11 一带

- qid: 2024-T2
  number: 2
  type: 单选
  score: 5
  stem: "若 $\\dfrac{z}{z-1}=1+\\mathrm{i}$，则 $z=$"
  options: { A: "$-1-\\mathrm{i}$", B: "$-1+\\mathrm{i}$", C: "$1-\\mathrm{i}$", D: "$1+\\mathrm{i}$" }
  answer: C
  analysis_brief: "$\\dfrac{z}{z-1}=\\dfrac{z-1+1}{z-1}=1+\\dfrac{1}{z-1}=1+\\mathrm{i}$，所以 $z-1=\\dfrac{1}{\\mathrm{i}}=-\\mathrm{i}$，$z=1-\\mathrm{i}$。"
  has_figure: false
  tier_hint: A   # 复数运算 → M1-30 一带

- qid: 2024-T3
  number: 3
  type: 单选
  score: 5
  stem: "已知向量 $\\vec{a}=(0,1)$，$\\vec{b}=(2,x)$，若 $\\vec{b}\\perp(\\vec{b}-4\\vec{a})$，则 $x=$"
  options: { A: "$-2$", B: "$-1$", C: "$1$", D: "$2$" }
  answer: D
  analysis_brief: "$\\vec{b}\\cdot(\\vec{b}-4\\vec{a})=0$，即 $\\vec{b}^{2}-4\\vec{a}\\cdot\\vec{b}=0$，$4+x^{2}-4x=0$，得 $x=2$。"
  has_figure: false
  tier_hint: B   # 向量垂直坐标运算 → M5

- qid: 2024-T4
  number: 4
  type: 单选
  score: 5
  stem: "已知 $\\cos(\\alpha+\\beta)=m$，$\\tan\\alpha\\tan\\beta=2$，则 $\\cos(\\alpha-\\beta)=$"
  options: { A: "$-3m$", B: "$-\\dfrac{m}{3}$", C: "$\\dfrac{m}{3}$", D: "$3m$" }
  answer: A
  analysis_brief: "$\\cos(\\alpha+\\beta)=\\cos\\alpha\\cos\\beta-\\sin\\alpha\\sin\\beta=m$；由 $\\tan\\alpha\\tan\\beta=2$ 得 $\\sin\\alpha\\sin\\beta=2\\cos\\alpha\\cos\\beta$；代入得 $\\cos\\alpha\\cos\\beta=-m$，$\\sin\\alpha\\sin\\beta=-2m$；故 $\\cos(\\alpha-\\beta)=\\cos\\alpha\\cos\\beta+\\sin\\alpha\\sin\\beta=-3m$。"
  has_figure: false
  tier_hint: B   # 两角和差 → M3
```
