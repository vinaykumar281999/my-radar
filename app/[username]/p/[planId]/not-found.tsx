import { PlanUnavailable } from "./SharedPlanFallback";

export default function PlanNotFound() {
  return (
    <main className="mx-auto flex w-full max-w-[480px] flex-1 flex-col items-center justify-center">
      <PlanUnavailable />
    </main>
  );
}
