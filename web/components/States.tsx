import { Icon } from "./Icon";

export function Loading({ text = "Loading..." }: { text?: string }) {
  return (
    <div role="status" className="flex items-center justify-center gap-3 py-16 text-muted">
      <span className="h-5 w-5 animate-spin rounded-full border-2 border-line border-t-primary" />
      {text}
    </div>
  );
}

export function ErrorBox({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="card flex items-start gap-3 border-danger/40 p-4">
      <Icon name="alert" className="mt-0.5 shrink-0 text-danger" />
      <div className="flex-1">
        <p className="font-semibold text-danger">Could not complete that</p>
        <p className="text-sm text-muted">{message}</p>
      </div>
      {onRetry && (
        <button className="btn btn-ghost !min-h-9" onClick={onRetry}>
          Retry
        </button>
      )}
    </div>
  );
}
