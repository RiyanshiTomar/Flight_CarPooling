import { colorFor, initialsOf } from "@/lib/format";

export function Avatar({ name, size = 36 }: { name: string; size?: number }) {
  return (
    <span
      title={name}
      className="inline-grid shrink-0 place-items-center rounded-full border-2 border-surface font-semibold text-white"
      style={{ width: size, height: size, background: colorFor(name), fontSize: size * 0.36 }}
    >
      {initialsOf(name)}
    </span>
  );
}

export function AvatarStack({ names, size = 36 }: { names: string[]; size?: number }) {
  return (
    <span className="inline-flex -space-x-2">
      {names.map((n, i) => (
        <Avatar key={`${n}-${i}`} name={n} size={size} />
      ))}
    </span>
  );
}
