import { useEffect, useRef, type ReactNode } from 'react';
import { IconButton } from './Button';
import { Icon } from './Icon';

/**
 * Collapsible reference drawer.
 *
 * Deliberately non-modal: the anatomy board stays visible and usable behind it,
 * which is why the reference material is a drawer rather than a permanent
 * sidebar. The backdrop closes it on tap but does not trap focus.
 */
export function Drawer({
  open,
  title,
  onClose,
  children,
  describedBy,
}: {
  readonly open: boolean;
  readonly title: string;
  readonly onClose: () => void;
  readonly children: ReactNode;
  readonly describedBy?: string;
}) {
  const panelRef = useRef<HTMLDivElement | null>(null);
  const closeRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (!open) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    closeRef.current?.focus();

    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="drawer" data-testid="drawer">
      {/*
        A redundant dismiss layer for pointer users. It is hidden from assistive
        technology so that it does not duplicate the close button's accessible
        name: two controls announced as "Close reference" is confusing, and
        Escape plus the close button already cover keyboard users.
      */}
      <button
        type="button"
        className="drawer__backdrop"
        aria-hidden="true"
        tabIndex={-1}
        onClick={onClose}
      />
      <div
        className="drawer__panel"
        ref={panelRef}
        role="dialog"
        aria-modal={false}
        aria-label={title}
        {...(describedBy === undefined ? {} : { 'aria-describedby': describedBy })}
      >
        <header className="drawer__header">
          <h2 className="drawer__title">{title}</h2>
          <IconButton label="Close reference" ref={closeRef} onClick={onClose}>
            <Icon name="close" />
          </IconButton>
        </header>
        <div className="drawer__body">{children}</div>
      </div>
    </div>
  );
}

/**
 * Bottom sheet used for portrait feedback.
 *
 * Capped at 42dvh so it can never swallow the board, with an explicit control
 * to get back to the board. The board remains visible and tappable throughout.
 */
export function Sheet({
  open,
  title,
  onDismiss,
  children,
}: {
  readonly open: boolean;
  readonly title: string;
  readonly onDismiss: () => void;
  readonly children: ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onDismiss();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open, onDismiss]);

  if (!open) return null;

  return (
    <section className="sheet" aria-label={title} data-testid="sheet">
      <div className="sheet__handle" aria-hidden="true" />
      <header className="sheet__header">
        <h2 className="sheet__title">{title}</h2>
        <IconButton label="Back to anatomy board" onClick={onDismiss}>
          <Icon name="chevronRight" />
        </IconButton>
      </header>
      <div className="sheet__body">{children}</div>
    </section>
  );
}
