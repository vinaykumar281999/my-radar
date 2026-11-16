import { Mountain, Music, Plane, Trophy, Wine, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Category, Status } from "@/lib/types";

export const CATEGORY_ICONS: Record<Category, LucideIcon> = {
  Trip: Plane,
  Concert: Music,
  Weekend: Mountain,
  Sports: Trophy,
  "Food & Nightlife": Wine,
};

export const CATEGORY_EMOJI: Record<Category, string> = {
  Trip: "✈️",
  Concert: "🎵",
  Weekend: "⛰️",
  Sports: "🏆",
  "Food & Nightlife": "🍸",
};

export const STATUS_STYLES: Record<Status, { pill: string; dot: string; hex: string }> = {
  "Just an Idea": {
    pill: "bg-violet-100 text-violet-700 ring-violet-200 dark:bg-violet-500/15 dark:text-violet-300 dark:ring-violet-500/30",
    dot: "bg-violet-500",
    hex: "#8b5cf6",
  },
  "Booking Soon": {
    pill: "bg-amber-100 text-amber-800 ring-amber-200 dark:bg-amber-500/15 dark:text-amber-300 dark:ring-amber-500/30",
    dot: "bg-amber-500 animate-pulse",
    hex: "#f59e0b",
  },
  "Locked In": {
    pill: "bg-emerald-100 text-emerald-800 ring-emerald-200 dark:bg-emerald-500/15 dark:text-emerald-300 dark:ring-emerald-500/30",
    dot: "bg-emerald-500",
    hex: "#10b981",
  },
};

export function CategoryLabel({ category, className }: { category: Category; className?: string }) {
  const Icon = CATEGORY_ICONS[category];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 text-xs font-medium tracking-wide text-muted-foreground uppercase",
        className,
      )}
    >
      <Icon className="size-3.5" aria-hidden />
      {category}
    </span>
  );
}

export function StatusPill({ status, className }: { status: Status; className?: string }) {
  const s = STATUS_STYLES[status];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold whitespace-nowrap ring-1 ring-inset",
        s.pill,
        className,
      )}
    >
      <span className={cn("size-1.5 rounded-full", s.dot)} aria-hidden />
      {status}
    </span>
  );
}

/** Subtle "🔗 Chained with @handle" pill for plans that came from a pitch or a copy. */
export function ChainPill({
  plan,
  className,
}: {
  plan: { suggested_by_handle: string | null; chained_from_plan_id: string | null };
  className?: string;
}) {
  if (!plan.suggested_by_handle && !plan.chained_from_plan_id) return null;
  return (
    <span
      className={cn(
        "inline-flex max-w-full items-center gap-1 truncate rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground",
        className,
      )}
    >
      🔗 {plan.suggested_by_handle ? `Chained with ${plan.suggested_by_handle}` : "Chained"}
    </span>
  );
}
