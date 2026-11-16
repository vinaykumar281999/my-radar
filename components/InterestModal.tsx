"use client";

import { useState } from "react";
import { Loader2, PartyPopper } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { CONTACT_HINT, Honeypot } from "@/components/Honeypot";
import { createClient } from "@/lib/supabase/client";

type InterestModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  planId: string;
  planTitle: string;
  hostName: string;
  /** Demo mode (landing page preview): skip the network call. */
  demo?: boolean;
};

export function InterestModal({
  open,
  onOpenChange,
  planId,
  planTitle,
  hostName,
  demo = false,
}: InterestModalProps) {
  const [name, setName] = useState("");
  const [contact, setContact] = useState("");
  const [message, setMessage] = useState("");
  const [trap, setTrap] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  const firstName = hostName.split(" ")[0] || hostName;

  function handleOpenChange(next: boolean) {
    onOpenChange(next);
    if (!next && sent) {
      // Reset after a successful send so the card can be reused.
      setTimeout(() => {
        setSent(false);
        setMessage("");
      }, 300);
    }
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    if (!name.trim() || !contact.trim()) {
      setError("Add your name and a way to reach you.");
      return;
    }
    setPending(true);
    try {
      if (trap) {
        // Honeypot filled → bot. Pretend it worked, save nothing.
        await new Promise((r) => setTimeout(r, 400));
      } else if (!demo) {
        const { error } = await createClient()
          .from("interests")
          .insert({
            plan_id: planId,
            visitor_name: name.trim().slice(0, 60),
            contact_handle: contact.trim().slice(0, 60),
            message: message.trim() ? message.trim().slice(0, 280) : null,
          });
        if (error) throw error;
      } else {
        await new Promise((r) => setTimeout(r, 500));
      }
      setSent(true);
    } catch (err) {
      console.error(err);
      setError("Couldn't send that — please try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <Drawer open={open} onOpenChange={handleOpenChange}>
      <DrawerContent className="mx-auto max-w-[480px]">
        {sent ? (
          <div className="flex flex-col items-center gap-3 px-6 pt-10 pb-8 text-center">
            <div className="grid size-16 place-items-center rounded-full bg-emerald-100 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-300">
              <PartyPopper className="size-8 animate-in zoom-in-50 duration-500" />
            </div>
            <DrawerTitle className="text-xl font-bold">Sent! {firstName} knows you&apos;re down.</DrawerTitle>
            <DrawerDescription>
              They&apos;ll reach out on <span className="font-medium text-foreground">{contact}</span>{" "}
              before booking <span className="font-medium text-foreground">{planTitle}</span>.
            </DrawerDescription>
            <Button className="mt-4 h-11 w-full rounded-xl" onClick={() => handleOpenChange(false)}>
              Done
            </Button>
          </div>
        ) : (
          <form onSubmit={onSubmit} className="relative flex flex-col">
            <Honeypot value={trap} onChange={setTrap} />
            <DrawerHeader className="text-left">
              <DrawerTitle className="text-lg font-bold">I&apos;m interested 👋</DrawerTitle>
              <DrawerDescription className="text-left">
                Let {firstName} know you want in on <span className="font-medium text-foreground">{planTitle}</span>. No account needed.
              </DrawerDescription>
            </DrawerHeader>
            <div className="space-y-4 p-4">
              <div className="space-y-1.5">
                <Label htmlFor="interest-name">Your name</Label>
                <Input
                  id="interest-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Alex Rivera"
                  autoComplete="name"
                  maxLength={60}
                  required
                  className="h-11 text-base"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="interest-contact">Instagram handle or WhatsApp / phone</Label>
                <Input
                  id="interest-contact"
                  value={contact}
                  onChange={(e) => setContact(e.target.value)}
                  placeholder="@alex.rivera or +1 555 123 4567"
                  maxLength={60}
                  required
                  aria-describedby="interest-contact-hint"
                  className="h-11 text-base"
                />
                <p id="interest-contact-hint" className="text-xs text-muted-foreground">
                  {CONTACT_HINT}
                </p>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="interest-message">
                  Note <span className="font-normal text-muted-foreground">(optional)</span>
                </Label>
                <Textarea
                  id="interest-message"
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="Count me in! Let me know before you book."
                  maxLength={280}
                  rows={3}
                  className="text-base"
                />
              </div>
              {error && <p className="text-sm text-destructive" role="alert">{error}</p>}
            </div>
            <DrawerFooter>
              <Button type="submit" disabled={pending} className="h-12 rounded-xl text-base font-semibold">
                {pending ? <Loader2 className="animate-spin" /> : "Send 👋"}
              </Button>
            </DrawerFooter>
          </form>
        )}
      </DrawerContent>
    </Drawer>
  );
}
