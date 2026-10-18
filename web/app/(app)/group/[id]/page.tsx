import { Suspense } from "react";
import { Loading } from "@/components/States";
import { GroupView } from "./GroupView";

export default function GroupPage() {
  return (
    <Suspense fallback={<Loading />}>
      <GroupView />
    </Suspense>
  );
}
