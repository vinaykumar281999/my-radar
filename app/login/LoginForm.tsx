"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2, Mail, MailCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

type Mode = "magic" | "password";

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = searchParams.get("next") ?? "/dashboard";
  const linkError = searchParams.get("error") === "link";

  const [mode, setMode] = useState<Mode>("magic");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState<"magic" | "signin" | "signup" | null>(null);
  const [error, setError] = useState<string | null>(
    linkError ? "That sign-in link expired or was already used. Request a new one." : null,
  );
  const [sentTo, setSentTo] = useState<string | null>(null);

  function callbackUrl() {
    const url = new URL("/auth/callback", window.location.origin);
    url.searchParams.set("next", next);
    return url.toString();
  }

  async function sendMagicLink(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setPending("magic");
    try {
      const { error } = await createClient().auth.signInWithOtp({
        email: email.trim(),
        options: { emailRedirectTo: callbackUrl() },
      });
      if (error) throw error;
      setSentTo(email.trim());
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setPending(null);
    }
  }

  async function passwordAuth(kind: "signin" | "signup") {
    setError(null);
    if (!email.trim() || password.length < 6) {
      setError("Enter your email and a password of at least 6 characters.");
      return;
    }
    setPending(kind);
    try {
      const supabase = createClient();
      if (kind === "signin") {
        const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
        if (error) throw error;
      } else {
        const { data, error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: { emailRedirectTo: callbackUrl() },
        });
        if (error) throw error;
        if (!data.session) {
          // Email confirmation is enabled on the project.
          setSentTo(email.trim());
          return;
        }
      }
      router.replace(next);
      router.refresh();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setPending(null);
    }
  }

  if (sentTo) {
    return (
      <div className="mt-6 flex flex-col items-center gap-3 rounded-xl bg-muted/60 px-4 py-8 text-center">
        <MailCheck className="size-10 text-primary" />
        <p className="font-semibold">Check your inbox</p>
        <p className="text-sm text-muted-foreground">
          We sent a sign-in link to <span className="font-medium text-foreground">{sentTo}</span>.
        </p>
        <Button variant="ghost" size="sm" onClick={() => setSentTo(null)}>
          Use a different email
        </Button>
      </div>
    );
  }

  return (
    <div className="mt-6">
      <div role="tablist" className="grid grid-cols-2 gap-1 rounded-xl bg-muted p-1 text-sm font-medium">
        {(["magic", "password"] as const).map((m) => (
          <button
            key={m}
            role="tab"
            type="button"
            aria-selected={mode === m}
            onClick={() => {
              setMode(m);
              setError(null);
            }}
            className={cn(
              "h-9 rounded-lg transition-colors",
              mode === m ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {m === "magic" ? "Magic link" : "Password"}
          </button>
        ))}
      </div>

      <form
        onSubmit={mode === "magic" ? sendMagicLink : (e) => (e.preventDefault(), passwordAuth("signin"))}
        className="mt-5 space-y-4"
      >
        <div className="space-y-1.5">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            inputMode="email"
            autoComplete="email"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className="h-11 text-base"
          />
        </div>

        {mode === "password" && (
          <div className="space-y-1.5">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              autoComplete="current-password"
              placeholder="At least 6 characters"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
              className="h-11 text-base"
            />
          </div>
        )}

        {error && (
          <p className="text-sm text-destructive" role="alert">
            {error}
          </p>
        )}

        {mode === "magic" ? (
          <Button type="submit" disabled={!!pending} className="h-11 w-full rounded-xl text-base font-semibold">
            {pending === "magic" ? <Loader2 className="animate-spin" /> : <Mail />}
            Email me a magic link
          </Button>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            <Button type="submit" disabled={!!pending} className="h-11 rounded-xl font-semibold">
              {pending === "signin" ? <Loader2 className="animate-spin" /> : "Sign in"}
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={!!pending}
              onClick={() => passwordAuth("signup")}
              className="h-11 rounded-xl font-semibold"
            >
              {pending === "signup" ? <Loader2 className="animate-spin" /> : "Create account"}
            </Button>
          </div>
        )}
      </form>
    </div>
  );
}

function errorMessage(err: unknown) {
  if (err && typeof err === "object" && "message" in err && typeof err.message === "string") {
    return err.message;
  }
  return "Something went wrong. Please try again.";
}
