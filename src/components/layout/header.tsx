"use client";

import Link from "next/link";
import { Zap, Bell } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { getInitials } from "@/lib/utils";
import type { Profile } from "@/types";

interface HeaderProps {
  profile: Profile | null;
  title?: string;
}

export function Header({ profile, title }: HeaderProps) {
  return (
    <header className="md:hidden sticky top-0 z-30 bg-zinc-950/90 backdrop-blur-sm border-b border-zinc-800">
      <div className="flex items-center justify-between px-4 py-3">
        {/* Logo */}
        <Link href="/app/dashboard" className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-600">
            <Zap className="h-4 w-4 text-white" />
          </div>
          {title ? (
            <span className="text-sm font-semibold text-zinc-100">{title}</span>
          ) : (
            <span className="text-sm font-bold text-zinc-100">Treinador Jayme</span>
          )}
        </Link>

        {/* Right side */}
        <div className="flex items-center gap-2">
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
