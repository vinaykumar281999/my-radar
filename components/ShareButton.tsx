"use client";

import { useState } from "react";
import { Check, Share2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type ShareButtonProps = {
  path: string;
  title?: string;
  label?: string;
  /** Use the native share sheet when available (mobile). */
  preferNative?: boolean;
  className?: string;
  variant?: React.ComponentProps<typeof Button>["variant"];
};

export function ShareButton({
  path,
  title,
  label = "Share Radar",
  preferNative = true,
  className,
  variant = "outline",
}: ShareButtonProps) {
  const [copied, setCopied] = useState(false);

  async function share() {
    const url = `${window.location.origin}${path}`;
    if (preferNative && typeof navigator.share === "function" && window.matchMedia("(pointer: coarse)").matches) {
      try {
        await navigator.share({ url, title });
        return;
      } catch {
        // user cancelled or share failed — fall back to copy
      }
    }
    const ok = await copyText(url);
    if (ok) {
      setCopied(true);
      toast.success("Link copied", { description: url.replace(/^https?:\/\//, "") });
      setTimeout(() => setCopied(false), 2000);
    } else {
      toast.error("Couldn't copy — long-press to copy the URL instead.");
    }
  }

  return (
    <Button variant={variant} onClick={share} className={cn("rounded-full", className)}>
      {copied ? <Check /> : <Share2 />}
      {copied ? "Copied!" : label}
    </Button>
  );
}

/** Clipboard copy with a fallback for in-app browsers that block the async API. */
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.setAttribute("readonly", "");
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand("copy");
      ta.remove();
      return ok;
    } catch {
      return false;
    }
  }
}
