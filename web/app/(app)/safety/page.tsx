import { Suspense } from "react";
import { Loading } from "@/components/States";
import { SafetyCentre } from "./SafetyCentre";

export default function SafetyPage() {
  return (
    <Suspense fallback={<Loading />}>
      <SafetyCentre />
    </Suspense>
  );
}
