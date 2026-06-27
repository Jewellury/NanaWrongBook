/**
 * Nana Case API 客户端 · 单元测试
 *
 * mock fetch 验证 createCase / getCase 的行为。
 */

import { describe, test, expect, vi, beforeEach } from 'vitest';

// 在 import 被测模块前 mock fetch
const mockFetch = vi.fn();
global.fetch = mockFetch;

import { createCase, getCase } from '@/lib/nana/nana-api-client';

describe('nana-api-client', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('createCase', () => {
    test('发送 POST 请求并返回 case 数据', async () => {
      const mockResponse = {
        id: 'abc123',
        studentId: 'user-1',
        createdAt: '2026-06-27T00:00:00.000Z',
        artifacts: [
          { id: 'art-1', type: 'image', content: 'https://example.com/img.jpg', seq: 0, createdAt: '2026-06-27T00:00:00.000Z' },
          { id: 'art-2', type: 'transcript', content: '我的思路', seq: 1, createdAt: '2026-06-27T00:00:00.000Z' },
        ],
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      const result = await createCase([
        { type: 'image', content: 'https://example.com/img.jpg' },
        { type: 'transcript', content: '我的思路', seq: 1 },
      ]);

      expect(mockFetch).toHaveBeenCalledWith('/api/nana/cases', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          artifacts: [
            { type: 'image', content: 'https://example.com/img.jpg' },
            { type: 'transcript', content: '我的思路', seq: 1 },
          ],
        }),
      });
      expect(result).toEqual(mockResponse);
    });

    test('请求失败时抛出错误', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
      });

      await expect(createCase([])).rejects.toThrow('createCase 失败: 400');
    });
  });

  describe('getCase', () => {
    test('发送 GET 请求并返回 case 数据', async () => {
      const mockResponse = {
        id: 'abc123',
        studentId: 'user-1',
        createdAt: '2026-06-27T00:00:00.000Z',
        artifacts: [
          { id: 'art-1', type: 'image', content: 'https://example.com/img.jpg', seq: 0, createdAt: '2026-06-27T00:00:00.000Z' },
        ],
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      const result = await getCase('abc123');

      expect(mockFetch).toHaveBeenCalledWith('/api/nana/cases/abc123');
      expect(result).toEqual(mockResponse);
    });

    test('请求失败时抛出错误', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
      });

      await expect(getCase('nonexistent')).rejects.toThrow('getCase 失败: 404');
    });
  });
});
