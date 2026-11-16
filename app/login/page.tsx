import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Radar as RadarIcon } from "lucide-react";
import { LoginForm } from "./LoginForm";
import { Skeleton } from "@/components/ui/skeleton";

export const metadata: Metadata = { title: "Sign in" };

export default function LoginPage() {
  return (
    <main className="mx-auto flex w-full max-w-[420px] flex-1 flex-col justify-center px-5 py-12">
      <Link href="/" className="mb-8 inline-flex items-center gap-2 self-center text-lg font-bold tracking-tight">
        <RadarIcon className="size-5 text-primary" /> Radar
      </Link>
      <div className="tap-card p-6">
        <h1 className="text-2xl font-bold tracking-tight">Claim your link</h1>
        <p className="mt-1 text-sm text-muted-foreground">Sign in or create an account — takes 10 seconds.</p>
        <Suspense fallback={<Skeleton className="mt-6 h-48 w-full" />}>
          <LoginForm />
        </Suspense>
      </div>
    </main>
  );
}
