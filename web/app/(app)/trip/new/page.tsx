import { Suspense } from "react";
import { CardSkeletons } from "@/components/States";
import { NewTripForm } from "./NewTripForm";

export default function NewTripPage() {
  return (
    <Suspense fallback={<CardSkeletons count={2} />}>
      <NewTripForm />
    </Suspense>
  );
}
