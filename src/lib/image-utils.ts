/**
 * 压缩图片文件
 * @param file 原始图片文件
 * @param maxSizeMB 最大文件大小（MB），默认 1MB
 * @param maxWidth 最大宽度，默认 1920px
 * @param quality 压缩质量 0-1，默认 0.8
 * @returns 压缩后的 Base64 字符串
 */
export async function compressImage(
    file: File,
    maxSizeMB: number = 1,
    maxWidth: number = 1920,
    quality: number = 0.8
): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();

        reader.onload = (e) => {
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement('canvas');
                const ctx = canvas.getContext('2d');

                if (!ctx) {
                    reject(new Error('无法获取 Canvas 上下文'));
                    return;
                }

                // 计算新的尺寸（保持宽高比）
                let width = img.width;
                let height = img.height;

                if (width > maxWidth) {
                    height = (height * maxWidth) / width;
                    width = maxWidth;
                }

                canvas.width = width;
                canvas.height = height;

                // 绘制图片
                ctx.drawImage(img, 0, 0, width, height);

                // 转换为 Base64，逐步降低质量直到满足大小要求
                let currentQuality = quality;
                let compressed = canvas.toDataURL('image/jpeg', currentQuality);

                // 检查大小（Base64 字符串长度约等于文件大小的 4/3）
                const sizeInMB = (compressed.length * 3) / 4 / 1024 / 1024;

                // 如果还是太大，继续降低质量
                while (sizeInMB > maxSizeMB && currentQuality > 0.1) {
                    currentQuality -= 0.1;
                    compressed = canvas.toDataURL('image/jpeg', currentQuality);
                    const newSize = (compressed.length * 3) / 4 / 1024 / 1024;

                    console.log(`压缩质量: ${currentQuality.toFixed(1)}, 大小: ${newSize.toFixed(2)}MB`);

                    if (newSize <= maxSizeMB) break;
                }

                console.log(`原始文件: ${(file.size / 1024 / 1024).toFixed(2)}MB, 压缩后: ${((compressed.length * 3) / 4 / 1024 / 1024).toFixed(2)}MB`);

                resolve(compressed);
            };

            img.onerror = () => reject(new Error('图片加载失败'));
            img.src = e.target?.result as string;
        };

        reader.onerror = () => reject(new Error('文件读取失败'));
        reader.readAsDataURL(file);
    });
}

/**
 * 压缩图片（始终压缩）。
 *
 * Stage 2.5 修复（见 doc/auditlog/stage2.5-followup-rootcause-2026-07-02.md §问题1 根因 A）：
 * 旧实现用 `file.size > 1MB` 判断是否压缩。手机拍照的原始 JPEG/HEIC 往往已 < 1MB，
 * 走"不压缩"分支直接 base64 入库；但 base64 编码膨胀 ~33%，1MB 原图 → ~1.33MB 存储/传输，
 * 实测生产库题图全是 ~1.2MB base64，手机 4G 加载需数秒。
 *
 * 现统一压缩：所有图片都过一遍 compressImage（maxWidth 1280、quality 0.7、≤1MB 上限）。
 * 题图是拍一道数学题，不需要 4K 细节，1280px 足够清晰。
 *
 * 注意：只影响**新拍**的题图。已入库的老图不会被自动压缩（需迁移脚本，本轮不做）。
 *
 * @param file 图片文件
 * @returns 压缩后的 Base64 字符串
 */
export async function processImageFile(file: File): Promise<string> {
    const fileSizeMB = file.size / 1024 / 1024;
    console.log(`文件大小: ${fileSizeMB.toFixed(2)}MB，开始压缩（maxWidth 1280 / quality 0.7）...`);
    return await compressImage(file, 1 /* maxSizeMB 上限 */, 1280 /* maxWidth */, 0.7 /* quality */);
}
