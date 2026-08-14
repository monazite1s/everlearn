/**
 * @fileoverview 为 Vitest 组件测试注册用户可见 DOM 断言和浏览器桩。
 */

import '@testing-library/jest-dom/vitest';
import { vi } from 'vitest';

/** 用于为浏览器组件库返回确定的媒体查询对象。 */
function matchMedia(query: string): MediaQueryList {
  return {
    addEventListener: vi.fn(),
    addListener: vi.fn(),
    dispatchEvent: vi.fn(),
    matches: false,
    media: query,
    onchange: null,
    removeEventListener: vi.fn(),
    removeListener: vi.fn(),
  };
}

/** 用于跟踪观察元素且不模拟 JSDOM 不支持的布局测量。 */
class TestResizeObserver implements ResizeObserver {
  private readonly elements = new Set<Element>();

  /** 用于在组件挂载之间释放观察元素。 */
  disconnect(): void {
    this.elements.clear();
  }

  /** 用于接收元素且不在 JSDOM 中模拟布局。 */
  observe(target: Element): void {
    this.elements.add(target);
  }

  /** 用于停止观察元素且不在 JSDOM 中模拟布局。 */
  unobserve(target: Element): void {
    this.elements.delete(target);
  }
}

globalThis.ResizeObserver = TestResizeObserver;
window.matchMedia = matchMedia;
