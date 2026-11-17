import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function PlanNotFound() {
  return (
    <main className="mx-auto flex w-full max-w-[480px] flex-1 flex-col items-center justify-center px-6 py-20 text-center">
      <p className="text-5xl">🗓️</p>
      <h1 className="mt-4 text-2xl font-bold">This plan isn&apos;t available</h1>
      <p className="mt-2 text-muted-foreground">It may have been archived or deleted.</p>
      <Button render={<Link href="/" />} nativeButton={false} variant="outline" className="mt-6 h-11 rounded-full px-6">
        What&apos;s Radar?
      </Button>
    </main>
  );
}
