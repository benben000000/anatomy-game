import type { ComponentPropsWithRef, ReactNode } from 'react';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';

export interface ButtonProps extends ComponentPropsWithRef<'button'> {
  readonly variant?: ButtonVariant;
  readonly size?: 'small' | 'medium' | 'large';
  readonly block?: boolean;
  readonly children: ReactNode;
}

/**
 * Every button meets a 44px minimum target, and 48–56px for the actions a
 * learner reaches for repeatedly. Sizes are set in CSS from tokens so they stay
 * consistent with the touch-target rules.
 *
 * `ref` is a plain prop: React 19 passes it to function components directly,
 * which is why no `forwardRef` is needed.
 */
export function Button({
  variant = 'secondary',
  size = 'medium',
  block = false,
  type = 'button',
  className,
  children,
  ...rest
}: ButtonProps) {
  const classes = [
    'btn',
    `btn--${variant}`,
    size === 'large' ? 'btn--large' : size === 'small' ? 'btn--small' : '',
    block ? 'btn--block' : '',
    className ?? '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <button type={type} className={classes} {...rest}>
      {children}
    </button>
  );
}

export interface IconButtonProps extends Omit<ComponentPropsWithRef<'button'>, 'children'> {
  /** Required. An icon button with no accessible name does not ship. */
  readonly label: string;
  readonly children: ReactNode;
  readonly pressed?: boolean;
}

export function IconButton({ label, pressed, children, className, type = 'button', ...rest }: IconButtonProps) {
  const classes = ['icon-btn', className ?? ''].filter(Boolean).join(' ');
  return (
    <button
      type={type}
      className={classes}
      aria-label={label}
      title={label}
      {...(pressed === undefined ? {} : { 'aria-pressed': pressed })}
      {...rest}
    >
      {children}
    </button>
  );
}
