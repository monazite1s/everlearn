/**
 * @fileoverview Provides native buttons and form controls with stable semantic states.
 */

'use client';

import { useId } from 'react';
import type { ComponentProps, ReactNode } from 'react';

import styles from './ui.module.css';

export type ButtonVariant = 'danger' | 'ghost' | 'primary' | 'secondary';
export type ButtonSize = 'medium' | 'small';

export interface ButtonProps extends ComponentProps<'button'> {
  pending?: boolean;
  size?: ButtonSize;
  variant?: ButtonVariant;
}

interface FieldFrameProps {
  children: ReactNode;
  controlId: string;
  description?: string | undefined;
  error?: string | undefined;
  label: string;
}

interface FieldStateProps {
  description?: string;
  error?: string;
  label: string;
}

export interface TextInputProps extends Omit<ComponentProps<'input'>, 'size'>, FieldStateProps {}

export interface TextAreaProps extends ComponentProps<'textarea'>, FieldStateProps {}

/** Renders one native action with semantic visual variants and pending state. */
export function Button({
  children,
  className,
  disabled,
  pending = false,
  size = 'medium',
  type = 'button',
  variant = 'secondary',
  ...props
}: ButtonProps) {
  const classes = `${styles.button} ${className ?? ''}`.trim();
  return (
    <button
      {...props}
      aria-busy={pending ? true : undefined}
      className={classes}
      data-size={size}
      data-variant={variant}
      disabled={pending ? true : disabled}
      type={type}
    >
      {pending && <span className={styles.spinner} aria-hidden="true" />}
      {children}
    </button>
  );
}

/** Builds the accessible description relation for optional help and error text. */
function getDescriptionIds(
  controlId: string,
  description?: string,
  error?: string,
): string | undefined {
  const descriptionId = description ? `${controlId}-description` : '';
  const errorId = error ? `${controlId}-error` : '';
  return `${descriptionId} ${errorId}`.trim() || undefined;
}

/** Keeps a visible label and adjacent feedback around one form control. */
function FieldFrame({ children, controlId, description, error, label }: FieldFrameProps) {
  return (
    <div className={styles.field}>
      <label className={styles.label} htmlFor={controlId}>
        {label}
      </label>
      {children}
      {description && (
        <span className={styles.description} id={`${controlId}-description`}>
          {description}
        </span>
      )}
      {error && (
        <span className={styles.error} id={`${controlId}-error`} role="alert">
          {error}
        </span>
      )}
    </div>
  );
}

/** Renders a labeled single-line input with connected help and error messages. */
export function TextInput({ description, error, id, label, ...props }: TextInputProps) {
  const generatedId = useId();
  const controlId = id ?? generatedId;
  return (
    <FieldFrame controlId={controlId} description={description} error={error} label={label}>
      <input
        {...props}
        aria-describedby={getDescriptionIds(controlId, description, error)}
        aria-errormessage={error ? `${controlId}-error` : undefined}
        aria-invalid={error ? true : undefined}
        className={styles.input}
        id={controlId}
      />
    </FieldFrame>
  );
}

/** Renders a labeled multiline input with connected help and error messages. */
export function TextArea({ description, error, id, label, ...props }: TextAreaProps) {
  const generatedId = useId();
  const controlId = id ?? generatedId;
  return (
    <FieldFrame controlId={controlId} description={description} error={error} label={label}>
      <textarea
        {...props}
        aria-describedby={getDescriptionIds(controlId, description, error)}
        aria-errormessage={error ? `${controlId}-error` : undefined}
        aria-invalid={error ? true : undefined}
        className={styles.textarea}
        id={controlId}
      />
    </FieldFrame>
  );
}
