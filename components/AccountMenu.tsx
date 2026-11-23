"use client";

import { useRef } from "react";
import Link from "next/link";
import { Menu } from "@base-ui/react/menu";
import { ChevronDown, LogOut, Settings, UserPen } from "lucide-react";
import { Avatar } from "@/components/Avatar";
import type { Profile } from "@/lib/types";

const itemClass =
  "flex w-full cursor-default items-center gap-2 rounded-lg px-2.5 py-2 text-sm outline-none select-none data-[highlighted]:bg-muted [&_svg]:size-4 [&_svg]:text-muted-foreground";

/** Avatar button with the owner's account actions. */
export function AccountMenu({ profile }: { profile: Pick<Profile, "display_name" | "username" | "avatar_url"> }) {
  const signOut = useRef<HTMLFormElement>(null);

  return (
    <>
      <Menu.Root>
        <Menu.Trigger
          className="flex items-center gap-1 rounded-full p-0.5 pr-1.5 text-muted-foreground transition-colors outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring data-[popup-open]:bg-muted"
          aria-label="Account menu"
        >
          <Avatar name={profile.display_name} src={profile.avatar_url} className="size-8 text-xs ring-0" />
          <ChevronDown className="size-3.5" />
        </Menu.Trigger>
        <Menu.Portal>
          <Menu.Positioner align="end" sideOffset={6} className="z-50">
            <Menu.Popup className="w-60 origin-[var(--transform-origin)] rounded-xl border bg-popover p-1.5 text-popover-foreground shadow-lg transition-[transform,opacity] data-[ending-style]:scale-95 data-[ending-style]:opacity-0 data-[starting-style]:scale-95 data-[starting-style]:opacity-0">
              <div className="px-2.5 pt-1.5 pb-2">
                <p className="truncate text-sm font-semibold">{profile.display_name}</p>
                <p className="truncate text-xs text-muted-foreground">@{profile.username}</p>
              </div>
              <Menu.Separator className="my-1 h-px bg-border" />
              <Menu.LinkItem render={<Link href="/settings#profile" />} className={itemClass}>
                <UserPen /> Edit name &amp; handle
              </Menu.LinkItem>
              <Menu.LinkItem render={<Link href="/settings" />} className={itemClass}>
                <Settings /> Settings
              </Menu.LinkItem>
              <Menu.Separator className="my-1 h-px bg-border" />
              <Menu.Item className={itemClass} onClick={() => signOut.current?.requestSubmit()}>
                <LogOut /> Sign out
              </Menu.Item>
            </Menu.Popup>
          </Menu.Positioner>
        </Menu.Portal>
      </Menu.Root>
      <form ref={signOut} action="/auth/signout" method="post" hidden />
    </>
  );
}
