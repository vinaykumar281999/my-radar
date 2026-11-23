"use client";

import { useRef } from "react";
import Link from "next/link";
import { ChevronDown, LogOut, Settings, UserPen } from "lucide-react";
import { Avatar } from "@/components/Avatar";
import { Menu, MenuContent, MenuSeparator, menuItemClass } from "@/components/ui/menu";
import type { Profile } from "@/lib/types";

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
        <MenuContent className="w-60">
          <div className="px-2.5 pt-1.5 pb-2">
            <p className="truncate text-sm font-semibold">{profile.display_name}</p>
            <p className="truncate text-xs text-muted-foreground">@{profile.username}</p>
          </div>
          <MenuSeparator />
          <Menu.LinkItem render={<Link href="/settings#profile" />} className={menuItemClass}>
            <UserPen /> Edit name &amp; handle
          </Menu.LinkItem>
          <Menu.LinkItem render={<Link href="/settings" />} className={menuItemClass}>
            <Settings /> Settings
          </Menu.LinkItem>
          <MenuSeparator />
          <Menu.Item className={menuItemClass} onClick={() => signOut.current?.requestSubmit()}>
            <LogOut /> Sign out
          </Menu.Item>
        </MenuContent>
      </Menu.Root>
      <form ref={signOut} action="/auth/signout" method="post" hidden />
    </>
  );
}
