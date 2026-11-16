import { cn } from "@/lib/utils";

/** Initials avatar with optional image (plain <img> so it works for any host). */
export function Avatar({ name, src, className }: { name: string; src?: string | null; className?: string }) {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");

  return (
    <div
      className={cn(
        "grid size-12 shrink-0 place-items-center overflow-hidden rounded-full bg-gradient-to-br from-violet-500 via-fuchsia-500 to-orange-400 font-bold text-white ring-4 ring-background",
        className,
      )}
    >
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt={name} className="size-full object-cover" />
      ) : (
        <span aria-hidden>{initials || "🙂"}</span>
      )}
    </div>
  );
}
