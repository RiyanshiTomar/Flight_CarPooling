import { Suspense } from "react";
import { MatchList } from "./MatchList";
import { Loading } from "@/components/States";

export default function Matches() {
  return (
    <Suspense fallback={<Loading text="Finding your group..." />}>
      <MatchList />
    </Suspense>
  );
}
