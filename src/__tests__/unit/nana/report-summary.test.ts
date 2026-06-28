/**
 * 报告汇总 · 数据逻辑单元测试
 *
 * 测试 ReportSummary 中导出的纯函数：
 * - buildReportData — 分组 + 节点信息匹配 + "已过"/"还卡着"判定
 * - generateSignalText — "做题时看到的信号"文案
 * - findFirstStuckSuggestion — 第一个"还卡着"节点定位
 *
 * 不测试 React 组件渲染（项目未安装 @testing-library/react）。
 */
import { describe, test, expect } from "vitest";

import {
  buildReportData,
  generateSignalText,
  findFirstStuckSuggestion,
} from "@/components/nana/session/report-summary";

import type { RecordLike, MapNodeLike } from "@/components/nana/session/report-summary";

// ─── fixture ───────────────────────────────────────────

const MAP_NODES: MapNodeLike[] = [
  { nodeId: "M2a-03", name: "求函数定义域", judgeCriteria: "能求简单解析式" },
  { nodeId: "M2a-05", name: "配方法", judgeCriteria: "完成平方配凑" },
  { nodeId: "M2a-07", name: "二次函数图像", judgeCriteria: "画出开口/对称轴" },
];

// ─── buildReportData ────────────────────────────────────

describe("buildReportData", () => {
  test("空记录返回空数组", () => {
    const result = buildReportData([], MAP_NODES);
    expect(result).toEqual([]);
  });

  test("单节点单记录 — 匹配到名称和判定标准", () => {
    const records: RecordLike[] = [
      { nodeId: "M2a-03", correct: true },
    ];

    const result = buildReportData(records, MAP_NODES);
    expect(result).toHaveLength(1);
    expect(result[0].nodeId).toBe("M2a-03");
    expect(result[0].name).toBe("求函数定义域");
    expect(result[0].judgeCriteria).toBe("能求简单解析式");
    expect(result[0].passed).toBe(true);
    expect(result[0].count).toBe(1);
  });

  test("同一节点多条记录 — 全 true 判定为 passed=true", () => {
    const records: RecordLike[] = [
      { nodeId: "M2a-05", correct: true },
      { nodeId: "M2a-05", correct: true },
    ];

    const result = buildReportData(records, MAP_NODES);
    expect(result).toHaveLength(1);
    expect(result[0].passed).toBe(true);
    expect(result[0].count).toBe(2);
  });

  test("同一节点有一条 false — 判定为 passed=false", () => {
    const records: RecordLike[] = [
      { nodeId: "M2a-05", correct: true },
      { nodeId: "M2a-05", correct: false },
    ];

    const result = buildReportData(records, MAP_NODES);
    expect(result).toHaveLength(1);
    expect(result[0].passed).toBe(false);
    expect(result[0].count).toBe(2);
  });

  test("多节点记录 — 正确分组", () => {
    const records: RecordLike[] = [
      { nodeId: "M2a-03", correct: true },
      { nodeId: "M2a-05", correct: false },
      { nodeId: "M2a-03", correct: true },
    ];

    const result = buildReportData(records, MAP_NODES);
    expect(result).toHaveLength(2);

    const m2a03 = result.find((r) => r.nodeId === "M2a-03")!;
    expect(m2a03.passed).toBe(true);
    expect(m2a03.count).toBe(2);

    const m2a05 = result.find((r) => r.nodeId === "M2a-05")!;
    expect(m2a05.passed).toBe(false);
    expect(m2a05.count).toBe(1);
  });

  test("未知 nodeId（map 中不存在）— 以 nodeId 当 name 兜底", () => {
    const records: RecordLike[] = [
      { nodeId: "unknown-node", correct: true },
    ];

    const result = buildReportData(records, MAP_NODES);
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("unknown-node");
    expect(result[0].judgeCriteria).toBeNull();
    expect(result[0].passed).toBe(true);
  });
});

// ─── generateSignalText ─────────────────────────────────

describe("generateSignalText", () => {
  test("空记录返回兜底文字", () => {
    expect(generateSignalText([], MAP_NODES)).toBe("还没有做题记录");
  });

  test("单个知识点 — 正确的文字模板", () => {
    const records: RecordLike[] = [
      { nodeId: "M2a-03", correct: true },
      { nodeId: "M2a-03", correct: false },
    ];

    const text = generateSignalText(records, MAP_NODES);
    expect(text).toContain("这 2 道题集中在");
    expect(text).toContain("求函数定义域");
    expect(text).toContain("这一个点上");
  });

  test("两个知识点 — 正确的文字模板", () => {
    const records: RecordLike[] = [
      { nodeId: "M2a-03", correct: true },
      { nodeId: "M2a-05", correct: false },
    ];

    const text = generateSignalText(records, MAP_NODES);
    expect(text).toContain("这 2 道题集中在");
    expect(text).toContain("求函数定义域");
    expect(text).toContain("配方法");
    expect(text).toContain("这两个点上");
  });

  test("三个知识点 — 正确的文字模板", () => {
    const records: RecordLike[] = [
      { nodeId: "M2a-03", correct: true },
      { nodeId: "M2a-05", correct: false },
      { nodeId: "M2a-07", correct: true },
    ];

    const text = generateSignalText(records, MAP_NODES);
    expect(text).toContain("这 3 道题集中在");
    expect(text).toContain("求函数定义域");
    expect(text).toContain("配方法");
    expect(text).toContain("二次函数图像");
  });

  test("按出现次数降序排列 — count 高的在前", () => {
    const records: RecordLike[] = [
      { nodeId: "M2a-05", correct: false }, // count=3
      { nodeId: "M2a-05", correct: true },
      { nodeId: "M2a-05", correct: false },
      { nodeId: "M2a-03", correct: true },  // count=2
      { nodeId: "M2a-03", correct: true },
      { nodeId: "M2a-07", correct: true },  // count=1
    ];

    const text = generateSignalText(records, MAP_NODES);
    // 按 count 排序：M2a-05 3次 → M2a-03 2次 → M2a-07 1次
    const idx05 = text.indexOf("配方法");
    const idx03 = text.indexOf("求函数定义域");
    expect(idx05).toBeLessThan(idx03); // 配方法（3次）应在定义域（2次）前面
  });
});

// ─── findFirstStuckSuggestion ───────────────────────────

describe("findFirstStuckSuggestion", () => {
  test("全部已过 — 返回 null", () => {
    const records: RecordLike[] = [
      { nodeId: "M2a-03", correct: true },
      { nodeId: "M2a-05", correct: true },
    ];

    expect(findFirstStuckSuggestion(records, MAP_NODES)).toBeNull();
  });

  test("有 stuck 节点 — 返回第一个 stuck 的名称和 nodeId", () => {
    const records: RecordLike[] = [
      { nodeId: "M2a-03", correct: true },
      { nodeId: "M2a-05", correct: false },
    ];

    const result = findFirstStuckSuggestion(records, MAP_NODES);
    expect(result).not.toBeNull();
    expect(result!.name).toBe("配方法");
    expect(result!.nodeId).toBe("M2a-05");
  });

  test("多个 stuck — 返回第一个（按 records 首次出现顺序）", () => {
    const records: RecordLike[] = [
      { nodeId: "M2a-05", correct: false },
      { nodeId: "M2a-07", correct: false },
      { nodeId: "M2a-03", correct: true },
    ];

    const result = findFirstStuckSuggestion(records, MAP_NODES);
    expect(result!.nodeId).toBe("M2a-05");
  });

  test("空记录返回 null", () => {
    expect(findFirstStuckSuggestion([], MAP_NODES)).toBeNull();
  });
});
