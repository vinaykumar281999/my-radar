"use client";

import { useRef, useState } from "react";
import { toPng } from "html-to-image";
import { Download, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { CATEGORY_EMOJI, STATUS_STYLES } from "@/components/plan-meta";
import { useHost } from "@/hooks/use-origin";
import { storyPlans } from "@/lib/audience";
import { sortPlans, statusLabel, type Plan, type Profile } from "@/lib/types";

type StoryExportModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  profile: Profile;
  plans: Plan[];
};

// Rendered at 270×480 and exported at 4× → 1080×1920 (Instagram / WhatsApp story size).
const W = 270;
const H = 480;
const MAX_PLANS = 5;

export function StoryExportModal({ open, onOpenChange, profile, plans }: StoryExportModalProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [pending, setPending] = useState(false);
  const host = useHost();

  const shareable = storyPlans(plans);
  const upcoming = sortPlans(shareable).slice(0, MAX_PLANS);
  const more = shareable.length - upcoming.length;

  async function download() {
    if (!ref.current) return;
    setPending(true);
    try {
      const dataUrl = await toPng(ref.current, { pixelRatio: 4, cacheBust: true });
      const fileName = `radar-${profile.username}-story.png`;

      // On phones, prefer the share sheet so the image can go straight to Stories.
      const blob = await (await fetch(dataUrl)).blob();
      const file = new File([blob], fileName, { type: "image/png" });
      if (
        window.matchMedia("(pointer: coarse)").matches &&
        typeof navigator.canShare === "function" &&
        navigator.canShare({ files: [file] })
      ) {
        try {
          await navigator.share({ files: [file] });
          return;
        } catch {
          // cancelled → fall through to download
        }
      }

      const a = document.createElement("a");
      a.href = dataUrl;
      a.download = fileName;
      a.click();
      toast.success("Story card saved");
    } catch (err) {
      console.error(err);
      toast.error("Couldn't generate the image. Try again?");
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-lg font-bold">Story card</DialogTitle>
          <DialogDescription>A 9:16 image for Instagram Stories or WhatsApp Status.</DialogDescription>
        </DialogHeader>

        <div className="flex justify-center">
          <div
            ref={ref}
            style={{
              width: W,
              height: H,
              borderRadius: 0,
              background: "linear-gradient(160deg, #1e1b4b 0%, #4c1d95 50%, #9d174d 100%)",
              color: "#ffffff",
              padding: "28px 18px 22px",
              display: "flex",
              flexDirection: "column",
              fontFamily: "var(--font-sans), system-ui, sans-serif",
              boxShadow: "0 20px 40px -20px rgba(0,0,0,0.5)",
            }}
          >
            <div style={{ fontSize: 11, letterSpacing: 2, textTransform: "uppercase", opacity: 0.7 }}>
              📡 On my radar
            </div>
            <div style={{ fontSize: 24, fontWeight: 800, lineHeight: 1.1, marginTop: 6, letterSpacing: -0.5 }}>
              {profile.display_name}&apos;s upcoming plans
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 18, flex: 1 }}>
              {upcoming.length === 0 ? (
                <div style={{ fontSize: 13, opacity: 0.8 }}>Plans coming soon 👀</div>
              ) : (
                upcoming.map((plan) => (
                  <div
                    key={plan.id}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      padding: "9px 11px",
                      borderRadius: 14,
                      background: "rgba(255,255,255,0.12)",
                      border: "1px solid rgba(255,255,255,0.18)",
                    }}
                  >
                    <div style={{ fontSize: 18 }}>{CATEGORY_EMOJI[plan.category]}</div>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div
                        style={{
                          fontSize: 13,
                          fontWeight: 700,
                          lineHeight: 1.2,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {plan.title}
                      </div>
                      <div style={{ fontSize: 10, opacity: 0.75, marginTop: 2 }}>
                        {plan.specific_dates ? `${plan.timeframe} · ${plan.specific_dates}` : plan.timeframe}
                      </div>
                    </div>
                    <div
                      style={{
                        width: 8,
                        height: 8,
                        borderRadius: 99,
                        background: STATUS_STYLES[plan.status].hex,
                        flexShrink: 0,
                      }}
                      title={statusLabel(plan.status, plan.category)}
                    />
                  </div>
                ))
              )}
              {more > 0 && <div style={{ fontSize: 11, opacity: 0.7, paddingLeft: 4 }}>+ {more} more on my Radar</div>}
            </div>

            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: 12, fontWeight: 600, opacity: 0.85 }}>Want in? Tap “I&apos;m in” 🙌</div>
              <div
                style={{
                  marginTop: 8,
                  display: "inline-block",
                  padding: "8px 14px",
                  borderRadius: 999,
                  background: "#ffffff",
                  color: "#4c1d95",
                  fontSize: 13,
                  fontWeight: 800,
                }}
              >
                {host ? `${host}/${profile.username}` : `/${profile.username}`}
              </div>
            </div>
          </div>
        </div>

        <Button onClick={download} disabled={pending} className="h-11 w-full rounded-xl font-semibold">
          {pending ? <Loader2 className="animate-spin" /> : <Download />}
          Download PNG
        </Button>
      </DialogContent>
    </Dialog>
  );
}
