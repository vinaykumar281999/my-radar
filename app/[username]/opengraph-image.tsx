import { ImageResponse } from "next/og";
import { getPublicRadar } from "@/lib/data/public";
import { getSiteUrl, displayLink } from "@/lib/site";
import type { Category, Status } from "@/lib/types";

export const alt = "Upcoming plans on Radar";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const EMOJI: Record<Category, string> = {
  Trip: "✈️",
  Concert: "🎵",
  Weekend: "⛰️",
  Sports: "🏆",
  "Food & Nightlife": "🍸",
  Carpool: "🚗",
};

const STATUS_COLOR: Record<Status, { bg: string; fg: string }> = {
  "Just an Idea": { bg: "#ede9fe", fg: "#6d28d9" },
  "Booking Soon": { bg: "#fef3c7", fg: "#b45309" },
  "Locked In": { bg: "#d1fae5", fg: "#047857" },
};

export default async function Image({ params }: { params: Promise<{ username: string }> }) {
  const { username } = await params;
  const radar = await getPublicRadar(username).catch(() => null);

  const name = radar?.profile.display_name ?? "Radar";
  const handle = radar?.profile.username ?? username;
  const plans = radar?.plans.slice(0, 3) ?? [];
  const link = displayLink(getSiteUrl(), handle);

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          padding: 64,
          background: "linear-gradient(135deg, #1e1b4b 0%, #4c1d95 55%, #9d174d 100%)",
          color: "white",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ fontSize: 28, opacity: 0.75, display: "flex" }}>📡 What&apos;s on</div>
            <div style={{ fontSize: 64, fontWeight: 800, letterSpacing: -2, display: "flex" }}>
              {name}&apos;s Radar
            </div>
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 16, marginTop: 36, flex: 1 }}>
          {plans.length === 0 ? (
            <div style={{ fontSize: 34, opacity: 0.8, display: "flex" }}>
              Fresh plans coming soon — tap to see what&apos;s next.
            </div>
          ) : (
            plans.map((plan) => (
              <div
                key={plan.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 20,
                  padding: "18px 26px",
                  borderRadius: 24,
                  background: "rgba(255,255,255,0.12)",
                  border: "1px solid rgba(255,255,255,0.18)",
                }}
              >
                <div style={{ fontSize: 40, display: "flex" }}>{EMOJI[plan.category]}</div>
                <div style={{ display: "flex", flexDirection: "column", flex: 1 }}>
                  <div style={{ fontSize: 34, fontWeight: 700, display: "flex" }}>
                    {plan.title.length > 38 ? `${plan.title.slice(0, 37)}…` : plan.title}
                  </div>
                  <div style={{ fontSize: 22, opacity: 0.75, display: "flex" }}>
                    {plan.specific_dates ? `${plan.timeframe} · ${plan.specific_dates}` : plan.timeframe}
                  </div>
                </div>
                <div
                  style={{
                    display: "flex",
                    fontSize: 20,
                    fontWeight: 700,
                    padding: "8px 16px",
                    borderRadius: 999,
                    background: STATUS_COLOR[plan.status].bg,
                    color: STATUS_COLOR[plan.status].fg,
                  }}
                >
                  {plan.status}
                </div>
              </div>
            ))
          )}
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 26 }}>
          <div style={{ display: "flex", opacity: 0.85 }}>{link}</div>
          <div
            style={{
              display: "flex",
              padding: "10px 22px",
              borderRadius: 999,
              background: "white",
              color: "#4c1d95",
              fontWeight: 800,
            }}
          >
            I&apos;m Interested 👋
          </div>
        </div>
      </div>
    ),
    size,
  );
}
