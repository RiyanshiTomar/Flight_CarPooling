import Link from "next/link";
import { Icon } from "./Icon";

export function Logo({ light = false }: { light?: boolean }) {
  return (
    <Link href="/" className="inline-flex items-center gap-2 font-bold text-lg tracking-tight">
      <span className="grid h-8 w-8 place-items-center rounded-lg bg-primary text-white">
        <Icon name="plane" size={18} />
      </span>
      <span className={light ? "text-white" : "text-brand"}>FlyPool</span>
    </Link>
  );
}

