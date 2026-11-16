import { ArrowUpRight } from "lucide-react";
import { parseContact } from "@/lib/contact";
import { cn } from "@/lib/utils";

/** Contact as a one-tap link: @handle → Instagram, phone → WhatsApp. Plain text otherwise. */
export function ContactChip({ contact, className }: { contact: string; className?: string }) {
  const link = parseContact(contact);
  if (!link) return <span className={cn("text-sm text-muted-foreground", className)}>{contact}</span>;

  return (
    <a
      href={link.href}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(
        "inline-flex min-w-0 items-center gap-1 rounded-full bg-foreground px-2.5 py-1 text-xs font-semibold text-background transition-opacity hover:opacity-85",
        className,
      )}
    >
      <span className="truncate">{link.kind === "whatsapp" ? `WhatsApp ${link.label}` : link.label}</span>
      <ArrowUpRight className="size-3 shrink-0" aria-hidden />
    </a>
  );
}
