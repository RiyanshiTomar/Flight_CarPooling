import { Suspense } from "react";
import { GroupView } from "./GroupView";
import { Loading } from "@/components/States";

export default function GroupPage() {
  return (
    <Suspense fallback={<Loading />}>
      <GroupView />
    </Suspense>
  );
}
