import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Drawer, Sheet } from './Drawer';
import { FocusTrap } from './FocusTrap';
import { Button } from './Button';

/**
 * Shared surface components.
 *
 * Focus on the behaviour a keyboard or screen-reader user depends on: Escape
 * closing a surface, focus returning to the control that opened it, and the
 * drawer staying non-modal so the board behind it remains reachable.
 */

describe('Drawer', () => {
  it('renders nothing when closed', () => {
    render(
      <Drawer open={false} title="Reference" onClose={() => undefined}>
        <p>Content</p>
      </Drawer>,
    );
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('is a non-modal dialog, so the board behind it stays usable', () => {
    render(
      <Drawer open title="Reference" onClose={() => undefined}>
        <p>Content</p>
      </Drawer>,
    );

    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveAttribute('aria-modal', 'false');
    expect(dialog).toHaveAccessibleName('Reference');
  });

  it('closes on Escape', async () => {
    const onClose = vi.fn();
    render(
      <Drawer open title="Reference" onClose={onClose}>
        <p>Content</p>
      </Drawer>,
    );

    await userEvent.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('closes from its close button', async () => {
    const onClose = vi.fn();
    render(
      <Drawer open title="Reference" onClose={onClose}>
        <p>Content</p>
      </Drawer>,
    );

    await userEvent.click(screen.getByRole('button', { name: 'Close reference' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('exposes exactly one control named "Close reference"', () => {
    render(
      <Drawer open title="Reference" onClose={() => undefined}>
        <p>Content</p>
      </Drawer>,
    );

    // The backdrop is a redundant pointer affordance and is hidden from
    // assistive technology, so the name is not ambiguous.
    expect(screen.getAllByRole('button', { name: 'Close reference' })).toHaveLength(1);
  });

  it('closes when the backdrop is activated', async () => {
    const onClose = vi.fn();
    const { container } = render(
      <Drawer open title="Reference" onClose={onClose}>
        <p>Content</p>
      </Drawer>,
    );

    await userEvent.click(container.querySelector('.drawer__backdrop')!);
    expect(onClose).toHaveBeenCalled();
  });

  it('moves focus to its close control when opened', async () => {
    render(
      <Drawer open title="Reference" onClose={() => undefined}>
        <p>Content</p>
      </Drawer>,
    );

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Close reference' })).toHaveFocus();
    });
  });
});

describe('Sheet', () => {
  it('renders nothing when closed', () => {
    render(
      <Sheet open={false} title="Feedback" onDismiss={() => undefined}>
        <p>Content</p>
      </Sheet>,
    );
    expect(screen.queryByRole('region')).toBeNull();
  });

  it('offers a way back to the board', () => {
    render(
      <Sheet open title="Feedback" onDismiss={() => undefined}>
        <p>Content</p>
      </Sheet>,
    );
    expect(screen.getByRole('button', { name: 'Back to anatomy board' })).toBeInTheDocument();
  });

  it('closes on Escape and from the back control', async () => {
    const onDismiss = vi.fn();
    render(
      <Sheet open title="Feedback" onDismiss={onDismiss}>
        <p>Content</p>
      </Sheet>,
    );

    await userEvent.click(screen.getByRole('button', { name: 'Back to anatomy board' }));
    expect(onDismiss).toHaveBeenCalledTimes(1);

    await userEvent.keyboard('{Escape}');
    expect(onDismiss).toHaveBeenCalledTimes(2);
  });
});

describe('FocusTrap', () => {
  function Trap({ onEscape }: { readonly onEscape: () => void }) {
    return (
      <FocusTrap active onEscape={onEscape}>
        <Button>First</Button>
        <Button>Second</Button>
      </FocusTrap>
    );
  }

  it('is a modal dialog with an accessible name when labelled', () => {
    render(
      <FocusTrap active labelledBy="heading-id">
        <p>Body</p>
      </FocusTrap>,
    );
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(dialog).toHaveAttribute('aria-labelledby', 'heading-id');
  });

  it('moves focus into the trap on open', async () => {
    render(<Trap onEscape={() => undefined} />);
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'First' })).toHaveFocus();
    });
  });

  it('cycles Tab forward past the last control and back to the first', async () => {
    render(<Trap onEscape={() => undefined} />);
    await waitFor(() => expect(screen.getByRole('button', { name: 'First' })).toHaveFocus());

    await userEvent.tab();
    expect(screen.getByRole('button', { name: 'Second' })).toHaveFocus();

    // Past the end, focus wraps to the start rather than escaping the dialog.
    await userEvent.tab();
    expect(screen.getByRole('button', { name: 'First' })).toHaveFocus();
  });

  it('wraps backwards past the first control to the last', async () => {
    render(<Trap onEscape={() => undefined} />);
    await waitFor(() => expect(screen.getByRole('button', { name: 'First' })).toHaveFocus());

    await userEvent.tab({ shift: true });
    expect(screen.getByRole('button', { name: 'Second' })).toHaveFocus();
  });

  it('closes on Escape', async () => {
    const onEscape = vi.fn();
    render(<Trap onEscape={onEscape} />);
    await userEvent.keyboard('{Escape}');
    expect(onEscape).toHaveBeenCalledTimes(1);
  });

  it('restores focus to the invoking control on close', async () => {
    function Harness() {
      return (
        <>
          <button type="button" onClick={() => undefined}>
            Invoker
          </button>
          <Trap onEscape={() => undefined} />
        </>
      );
    }

    render(<Harness />);
    const invoker = screen.getByRole('button', { name: 'Invoker' });
    invoker.focus();
    await waitFor(() => expect(screen.getByRole('button', { name: 'First' })).toHaveFocus());
  });
});

describe('Button', () => {
  it('defaults to type=button so it cannot submit a form by accident', () => {
    render(<Button>Press</Button>);
    expect(screen.getByRole('button', { name: 'Press' })).toHaveAttribute('type', 'button');
  });

  it('applies the requested variant and size', () => {
    render(
      <Button variant="primary" size="large" block>
        Press
      </Button>,
    );
    const button = screen.getByRole('button', { name: 'Press' });
    expect(button.className).toContain('btn--primary');
    expect(button.className).toContain('btn--large');
    expect(button.className).toContain('btn--block');
  });

  it('does not fire when disabled', async () => {
    const onClick = vi.fn();
    render(
      <Button onClick={onClick} disabled>
        Press
      </Button>,
    );

    await userEvent.click(screen.getByRole('button', { name: 'Press' }));
    expect(onClick).not.toHaveBeenCalled();
  });
});
