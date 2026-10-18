import Link from "next/link";
import { Icon } from "@/components/Icon";
import { Logo } from "@/components/Logo";

export default function NotFound() {
  return (
    <main id="main" className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center px-4 text-center">
      <Logo />
      <p className="mt-10 text-6xl font-extrabold text-band">404</p>
      <h1 className="mt-2 text-2xl font-extrabold text-brand">This page took a different flight</h1>
      <p className="mt-2 text-muted">The link may be old or mistyped.</p>
      <div className="mt-6 flex gap-2">
        <Link href="/" className="btn btn-ghost">
          Home
        </Link>
        <Link href="/trip/new" className="btn btn-primary">
          Find a ride <Icon name="arrow" size={16} />
        </Link>
      </div>
    </main>
  );
}
