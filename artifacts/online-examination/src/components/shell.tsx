import { AlertTriangle, RotateCw } from 'lucide-react';
import type { ReactNode } from 'react';
import { ApiError } from '../lib/api';

/** Primary action button (existing prototype styling). */
export function Button({
  children,
  onClick,
  variant = 'primary',
  disabled = false,
  type = 'button',
  testId,
  className,
}: {
  children: ReactNode;
  onClick?: () => void;
  variant?: 'primary' | 'secondary' | 'quiet' | 'danger';
  disabled?: boolean;
  type?: 'button' | 'submit';
  testId?: string;
  className?: string;
}) {
  return (
    <button
      type={type}
      data-testid={testId}
      disabled={disabled}
      onClick={onClick}
      className={`button button-${variant}${className ? ` ${className}` : ''}`}
    >
      {children}
    </button>
  );
}

export function Status({
  children,
  tone = 'neutral',
  testId,
}: {
  children: ReactNode;
  tone?: 'neutral' | 'green' | 'amber' | 'purple' | 'red' | 'blue';
  testId?: string;
}) {
  return (
    <span className={`status status-${tone}`} data-testid={testId}>
      {children}
    </span>
  );
}

export function PageTitle({
  eyebrow,
  title,
  detail,
  action,
}: {
  eyebrow?: string;
  title: string;
  detail?: string;
  action?: ReactNode;
}) {
  return (
    <div className="page-title">
      <div>
        {eyebrow && <div className="eyebrow">{eyebrow}</div>}
        <h1>{title}</h1>
        {detail && <p>{detail}</p>}
      </div>
      {action && <div className="title-action">{action}</div>}
    </div>
  );
}

export function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <small>{label}</small>
      <strong>{value}</strong>
    </div>
  );
}

export function EmptyState({
  icon,
  title,
  description,
}: {
  icon: ReactNode;
  title: string;
  description: string;
}) {
  return (
    <div className="empty-state">
      <span>{icon}</span>
      <h3>{title}</h3>
      <p>{description}</p>
    </div>
  );
}

/** Error box with an optional retry affordance. */
export function ErrorBox({
  error,
  onRetry,
  retryLabel = 'Retry',
  testId,
}: {
  error: unknown;
  onRetry?: () => void;
  retryLabel?: string;
  testId?: string;
}) {
  if (!error) return null;
  const message =
    error instanceof ApiError
      ? error.message
      : error instanceof Error
        ? error.message
        : typeof error === 'string'
          ? error
          : 'Something went wrong.';

  return (
    <div className="error-box" role="alert" data-testid={testId ?? 'error-box'}>
      <span>{message}</span>
      {error instanceof ApiError && error.isRateLimited && (
        <small>Too many requests — wait a moment before retrying.</small>
      )}
      {onRetry && (
        <button type="button" onClick={onRetry} data-testid="button-retry">
          <RotateCw size={14} /> {retryLabel}
        </button>
      )}
    </div>
  );
}

export function LoadingBlock({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="loading-block" role="status" aria-live="polite">
      <span className="spinner" aria-hidden="true" />
      {label}
    </div>
  );
}

/**
 * Confirmation dialog for destructive or irreversible operations.
 * Renders inline (no portal) so it works anywhere in the admin pages.
 */
export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  tone = 'primary',
  busy = false,
  onConfirm,
  onCancel,
  testId,
}: {
  open: boolean;
  title: string;
  message: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: 'primary' | 'danger';
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  testId?: string;
}) {
  if (!open) return null;
  return (
    <div className="dialog-scrim" role="presentation" onClick={busy ? undefined : onCancel}>
      <div
        className="dialog"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
        data-testid={testId ?? 'confirm-dialog'}
        onClick={(e) => e.stopPropagation()}
      >
        <h3 id="confirm-dialog-title">{title}</h3>
        <div className="dialog-message">{message}</div>
        <div className="dialog-actions">
          <button
            type="button"
            className="button button-secondary"
            onClick={onCancel}
            disabled={busy}
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            className={`button button-${tone === 'danger' ? 'danger' : 'primary'}`}
            onClick={onConfirm}
            disabled={busy}
            data-testid="button-confirm-dialog"
          >
            {busy ? 'Working…' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

export function NoticeBanner({
  children,
  tone = 'amber',
  onDismiss,
}: {
  children: ReactNode;
  tone?: 'amber' | 'red' | 'green';
  onDismiss?: () => void;
}) {
  return (
    <div
      className={`exam-alert${tone === 'red' ? ' alert-error' : ''}`}
      role="status"
      data-testid="notice-banner"
    >
      <AlertTriangle size={16} />
      <span>{children}</span>
      {onDismiss && (
        <button type="button" onClick={onDismiss} aria-label="Dismiss notice">
          ✕
        </button>
      )}
    </div>
  );
}
