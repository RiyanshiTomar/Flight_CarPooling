import type { Metadata } from "next";
import { Suspense } from "react";
import { Loading } from "@/components/States";
import { LoginFlow } from "./LoginFlow";

export const metadata: Metadata = { title: "Log in" };

export default function LoginPage() {
  return (
    <Suspense fallback={<Loading />}>
      <LoginFlow />
    </Suspense>
  );
}
