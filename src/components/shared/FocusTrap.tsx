import { useEffect, useRef, type ReactNode } from 'react';

/**
 * Traps focus inside a modal surface and restores it to the invoking element on
 * close.
 *
 * Only applied to genuinely modal surfaces (the disambiguation chooser and
 * confirmations). The reference drawer is deliberately non-modal so it never
 * blocks the anatomy board.
 */
export function FocusTrap({
  active,
  onEscape,
  children,
  labelledBy,
}: {
  readonly active: boolean;
  readonly onEscape?: () => void;
  readonly children: ReactNode;
  readonly labelledBy?: string;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!active) return;

    previouslyFocused.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;

    const container = containerRef.current;
    if (!container) return;

    const focusableSelector = [
      'a[href]',
      'button:not([disabled])',
      'input:not([disabled])',
      'select:not([disabled])',
      'textarea:not([disabled])',
      '[tabindex]:not([tabindex="-1"])',
    ].join(',');

    const focusFirst = () => {
      const target =
        container.querySelector<HTMLElement>('[data-autofocus]') ??
        container.querySelector<HTMLElement>(focusableSelector);
      target?.focus();
    };

    // Wait a frame so the element is laid out before focusing.
    const frame = requestAnimationFrame(focusFirst);

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onEscape?.();
        return;
      }
      if (event.key !== 'Tab') return;

      // Only genuinely focusable, genuinely visible controls take part. The
      // `offsetParent` trick is deliberately avoided: it is null for every
      // element in a DOM-less test environment, and it is unreliable for
      // position:fixed subtrees in a real browser.
      const focusable = Array.from(
        container.querySelectorAll<HTMLElement>(focusableSelector),
      ).filter((element) => !element.hidden && element.getAttribute('aria-hidden') !== 'true');
      if (focusable.length === 0) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (!first || !last) return;

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', onKeyDown, true);

    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener('keydown', onKeyDown, true);
      previouslyFocused.current?.focus();
    };
  }, [active, onEscape]);

  return (
    <div
      ref={containerRef}
      role="dialog"
      aria-modal="true"
      {...(labelledBy === undefined ? {} : { 'aria-labelledby': labelledBy })}
    >
      {children}
    </div>
  );
}
