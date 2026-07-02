/**
 * image-utils · processImageFile 单元测试
 *
 * 验证 Stage 2.5 修复（doc/auditlog/stage2.5-followup-rootcause-2026-07-02.md §问题1 根因 A）：
 * 所有图片都过压缩，不再因 `file.size < 1MB` 走"不压缩直接 base64"分支。
 * 手机 HEIC/高压缩 JPEG 原始文件常 < 1MB，但 base64 膨胀 ~33% → ~1.2MB 入库慢。
 *
 * jsdom 无真实 Canvas/Image 实现（getContext 返回 null），这里打最小补丁：
 * mock HTMLCanvasElement.getContext / toDataURL，并用假 Image 在写入 src 时触发 onload。
 */
import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";
import { processImageFile } from "@/lib/image-utils";

// 构造一个小文件（< 1MB，旧逻辑会跳过压缩直接返回原始 base64）
function makeSmallImageFile(bytes = 100 * 1024): File {
  const buf = new Uint8Array(bytes);
  return new File([buf], "phone-photo.jpg", { type: "image/jpeg" });
}

const COMPRESSED_OUTPUT = "data:image/jpeg;base64,COMPRESSED_OUTPUT";

class MockImage {
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  width = 2000;
  height = 3000;
}
// 写入 src 后异步触发 onload（模拟图片解码完成）
Object.defineProperty(MockImage.prototype, "src", {
  configurable: true,
  get() {
    return "";
  },
  set() {
    setTimeout(() => this.onload?.(), 0);
  },
});

describe("processImageFile — 始终压缩（Stage 2.5 修复）", () => {
  let originalImage: typeof global.Image;
  let toDataURLSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    originalImage = global.Image;
    global.Image = MockImage as unknown as typeof Image;

    toDataURLSpy = vi
      .spyOn(HTMLCanvasElement.prototype, "toDataURL")
      .mockReturnValue(COMPRESSED_OUTPUT);
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
      drawImage: vi.fn(),
    } as unknown as CanvasRenderingContext2D);
  });

  afterEach(() => {
    global.Image = originalImage;
    vi.restoreAllMocks();
  });

  test("100KB 小文件也走压缩（不再直接返回原始 base64）", async () => {
    const file = makeSmallImageFile(100 * 1024); // < 1MB
    const result = await processImageFile(file);
    expect(result).toBe(COMPRESSED_OUTPUT);
    expect(toDataURLSpy).toHaveBeenCalled();
  });

  test("500KB 小文件同样压缩，输出经过 canvas.toDataURL", async () => {
    const file = makeSmallImageFile(500 * 1024); // < 1MB
    const result = await processImageFile(file);
    expect(result).toBe(COMPRESSED_OUTPUT);
    expect(toDataURLSpy).toHaveBeenCalledTimes(1);
  });
});
