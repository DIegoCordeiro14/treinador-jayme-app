"use client";

import Link from "next/link";
import { Zap, Bell, Menu } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { getInitials } from "@/lib/utils";
import type { Profile } from "@/types";

interface HeaderProps {
  profile: Profile | null;
  title?: string;
  onOpenDrawer: () => void;
}

export function Header({ profile, title, onOpenDrawer }: HeaderProps) {
  return (
    <header className="md:hidden sticky top-0 z-30 bg-zinc-950/90 backdrop-blur-sm border-b border-white/[0.07] pt-safe">
      <div className="flex items-center justify-between px-4 py-3">
        {/* Hamburger */}
        <button
          onClick={onOpenDrawer}
          className="p-2 -ml-1 text-zinc-400 hover:text-zinc-100 transition-colors"
          aria-label="Abrir menu"
        >
          <Menu className="h-5 w-5" />
        </button>

        {/* Logo / Title */}
        <Link href="/app/dashboard" className="flex items-center gap-2 absolute left-1/2 -translate-x-1/2">
          <div className="flex h-7 w-7 items-center justify-center rounded-md bg-[#D4853A] font-black italic text-sm text-white">
            E
          </div>
          <span className="text-sm font-extrabold italic text-zinc-100">
            {title ?? "Coach EDN"}
          </span>
        </Link>

        {/* Right */}
        <div className="flex items-center gap-1">
          <button className="relative p-2 text-zinc-400 hover:text-zinc-100 transition-colors">
            <Bell className="h-5 w-5" />
          </button>
          <Link href="/app/perfil">
            <Avatar className="h-8 w-8">
              <AvatarImage src={profile?.avatar_url ?? undefined} />
              <AvatarFallback className="text-xs bg-zinc-700">
                {profile?.name ? getInitials(profile.name) : "U"}
              </AvatarFallback>
            </Avatar>
          </Link>
        </div>
      </div>
    </header>
  );
}
