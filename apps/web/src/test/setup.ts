/**
 * @fileoverview Registers user-visible DOM assertions for Vitest component tests.
 */

import '@testing-library/jest-dom/vitest';

/** Tracks observed elements without attempting unavailable JSDOM layout measurement. */
class TestResizeObserver implements ResizeObserver {
  private readonly elements = new Set<Element>();

  /** Releases observed elements between component mounts. */
  disconnect(): void {
    this.elements.clear();
  }

  /** Accepts an element without simulating layout in JSDOM. */
  observe(target: Element): void {
    this.elements.add(target);
  }

  /** Stops observing one element without simulating layout in JSDOM. */
  unobserve(target: Element): void {
    this.elements.delete(target);
  }
}

globalThis.ResizeObserver = TestResizeObserver;
