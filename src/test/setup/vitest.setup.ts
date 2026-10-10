import '@testing-library/jest-dom/vitest';
import 'fake-indexeddb/auto';
import { afterEach, beforeAll, vi } from 'vitest';
import { cleanup } from '@testing-library/react';

/**
 * jsdom lacks the browser APIs the board and the PWA layers rely on. Each is
 * stubbed explicitly with a known behaviour, so a test that depends on one fails
 * loudly rather than passing by accident.
 */

beforeAll(() => {
  // jsdom implements neither, so the viewport maths is exercised through its own
  // pure functions and the board gets inert stand-ins here.
  if (!('matchMedia' in window)) {
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: (query: string): MediaQueryList =>
        ({
          matches: false,
          media: query,
          onchange: null,
          addEventListener: () => undefined,
          removeEventListener: () => undefined,
          addListener: () => undefined,
          removeListener: () => undefined,
          dispatchEvent: () => false,
        }) as unknown as MediaQueryList,
    });
  }

  if (!('requestAnimationFrame' in window)) {
    Object.defineProperty(window, 'requestAnimationFrame', {
      writable: true,
      value: (callback: FrameRequestCallback): number =>
        window.setTimeout(() => callback(performance.now()), 16),
    });
    Object.defineProperty(window, 'cancelAnimationFrame', {
      writable: true,
      value: (handle: number): void => window.clearTimeout(handle),
    });
  }

  // elementsFromPoint is what multi-candidate resolution depends on. jsdom has
  // no layout, so it returns nothing here, which is the correct answer for an
  // empty board. Tests that need candidates redefine it.
  if (!('elementsFromPoint' in document)) {
    Object.defineProperty(document, 'elementsFromPoint', {
      writable: true,
      configurable: true,
      value: (): Element[] => [],
    });
  }

  if (typeof globalThis.requestAnimationFrame !== 'function') {
    globalThis.requestAnimationFrame = ((callback: FrameRequestCallback): number =>
      setTimeout(() => callback(0), 16) as unknown as number) as typeof requestAnimationFrame;
  }
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  window.localStorage.clear();
});
