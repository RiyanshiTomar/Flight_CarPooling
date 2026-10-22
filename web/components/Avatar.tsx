import { colorFor, initialsOf } from "@/lib/format";

export function Avatar({ name, size = 36, ring = true }: { name: string; size?: number; ring?: boolean }) {
  return (
    <span
      title={name}
      className={`inline-grid shrink-0 place-items-center rounded-full font-bold text-white ${ring ? "border-2 border-surface" : ""}`}
      style={{ width: size, height: size, background: colorFor(name), fontSize: Math.round(size * 0.38) }}
      aria-hidden="true"
    >
      {initialsOf(name)}
    </span>
  );
}

export function AvatarStack({ names, size = 36, max = 4 }: { names: string[]; size?: number; max?: number }) {
  const shown = names.slice(0, max);
  const extra = names.length - shown.length;
  return (
    <span className="inline-flex -space-x-2" aria-label={names.join(", ")}>
      {shown.map((n, i) => (
        <Avatar key={`${n}-${i}`} name={n} size={size} />
      ))}
      {extra > 0 && (
        <span
          className="inline-grid shrink-0 place-items-center rounded-full border-2 border-surface bg-sky-soft text-xs font-bold text-primary"
          style={{ width: size, height: size }}
        >
          +{extra}
        </span>
      )}
    </span>
  );
}
