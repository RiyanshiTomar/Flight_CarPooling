import Link from "next/link";
import { Icon, type IconName } from "./Icon";

export function Spinner({ size = 18, className = "" }: { size?: number; className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={`inline-block animate-spin rounded-full border-2 border-current border-t-transparent ${className}`}
      style={{ width: size, height: size }}
    />
  );
}

export function Loading({ text = "Loading..." }: { text?: string }) {
  return (
    <div role="status" className="flex items-center justify-center gap-3 py-16 text-muted">
      <Spinner className="text-primary" />
      {text}
    </div>
  );
}

export function Skeleton({ className = "" }: { className?: string }) {
  return <div aria-hidden="true" className={`skeleton ${className}`} />;
}

/** A few card-shaped placeholders while a list loads. */
export function CardSkeletons({ count = 3, label = "Loading" }: { count?: number; label?: string }) {
  return (
    <div role="status" aria-label={label} className="space-y-3">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="card space-y-3 p-4">
          <Skeleton className="h-4 w-2/5" />
          <Skeleton className="h-3 w-3/5" />
          <Skeleton className="h-9 w-full" />
        </div>
      ))}
    </div>
  );
}

export function ErrorBox({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="card flex items-start gap-3 border-danger/40 bg-danger-soft/40 p-4">
      <Icon name="alert" className="mt-0.5 text-danger" />
      <div className="min-w-0 flex-1">
        <p className="font-semibold text-danger">That did not work</p>
        <p className="text-sm text-muted">{message}</p>
      </div>
      {onRetry && (
        <button className="btn btn-ghost btn-sm" onClick={onRetry}>
          Try again
        </button>
      )}
    </div>
  );
}

export function EmptyState({
  icon,
  title,
  text,
  action,
}: {
  icon: IconName;
  title: string;
  text: string;
  action?: { href: string; label: string };
}) {
  return (
    <div className="card px-6 py-10 text-center">
      <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-sky-soft text-primary">
        <Icon name={icon} size={26} />
      </span>
      <h2 className="mt-4 text-lg font-bold">{title}</h2>
      <p className="mx-auto mt-1 max-w-sm text-sm text-muted">{text}</p>
      {action && (
        <Link href={action.href} className="btn btn-primary mt-5">
          {action.label} <Icon name="arrow" size={16} />
        </Link>
      )}
    </div>
  );
}
