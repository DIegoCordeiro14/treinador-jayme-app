"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  LayoutDashboard,
  Dumbbell,
  BookOpen,
  Calendar,
  TrendingUp,
  Bot,
  User,
  LogOut,
  Zap,
  Trophy,
  Users,
  Swords,
  Medal,
  Flame,
  Utensils,
  X,
} from "lucide-react";
import { cn, getInitials } from "@/lib/utils";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { createClient } from "@/lib/supabase/client";
import { toast } from "sonner";
import type { Profile } from "@/types";
import { GOAL_LABELS } from "@/types";

const NAV_GROUPS = [
  {
    label: "Principal",
    items: [
      { href: "/app/dashboard", label: "Dashboard", icon: LayoutDashboard },
      { href: "/app/treinos", label: "Treinos", icon: Dumbbell },
      { href: "/app/exercicios", label: "Exercícios", icon: BookOpen },
      { href: "/app/calendario", label: "Calendário", icon: Calendar },
      { href: "/app/evolucao", label: "Evolução", icon: TrendingUp },
      { href: "/app/cardio", label: "Cárdio", icon: Flame },
      { href: "/app/nutricao", label: "Nutrição", icon: Utensils },
    ],
  },
  {
    label: "IA & Coach",
    items: [
      { href: "/app/ia", label: "IA Treinador Jayme", icon: Bot },
    ],
  },
  {
    label: "Comunidade",
    items: [
      { href: "/app/ranking", label: "Ranking", icon: Medal },
      { href: "/app/equipes", label: "Equipes", icon: Users },
      { href: "/app/desafios", label: "Desafios", icon: Swords },
      { href: "/app/conquistas", label: "Conquistas", icon: Trophy },
    ],
  },
  {
    label: "Conta",
    items: [
      { href: "/app/perfil", label: "Perfil", icon: User },
    ],
  },
];

interface MobileDrawerProps {
  profile: Profile | null;
  isOpen: boolean;
  onClose: () => void;
}

export function MobileDrawer({ profile, isOpen, onClose }: MobileDrawerProps) {
  const pathname = usePathname();
  const router = useRouter();
  const supabase = createClient();

  async function handleLogout() {
    await supabase.auth.signOut();
    onClose();
    toast.success("Sessão encerrada");
    router.push("/login");
    router.refresh();
  }

  return (
    <>
      {/* Backdrop */}
      <div
        className={cn(
          "fixed inset-0 z-50 bg-black/60 backdrop-blur-sm transition-opacity duration-300 md:hidden",
          isOpen ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
        )}
        onClick={onClose}
      />

      {/* Drawer panel */}
      <aside
        className={cn(
          "fixed left-0 top-0 bottom-0 z-50 w-72 bg-zinc-900 border-r border-zinc-800 flex flex-col transition-transform duration-300 ease-in-out md:hidden",
          isOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-600">
              <Zap className="h-5 w-5 text-white" />
            </div>
            <div>
              <p className="text-sm font-bold text-zinc-100 leading-none">Treinador</p>
              <p className="text-xs text-blue-400 font-semibold mt-0.5">Jayme EDN</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-zinc-500 hover:text-zinc-100 hover:bg-zinc-800 transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-3 py-4 space-y-5 overflow-y-auto">
          {NAV_GROUPS.map((group) => (
            <div key={group.label}>
              <p className="text-[10px] font-semibold text-zinc-600 uppercase tracking-wider px-3 mb-1.5">
                {group.label}
              </p>
              <div className="space-y-0.5">
                {group.items.map((item) => {
                  const isActive =
                    pathname === item.href ||
                    (item.href !== "/app/dashboard" && pathname.startsWith(item.href));
                  const Icon = item.icon;
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={onClose}
                      className={cn(
                        "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150",
                        isActive
                          ? "bg-blue-600 text-white"
                          : "text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100"
                      )}
                    >
                      <Icon size={16} className="shrink-0" />
                      {item.label}
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        {/* User section */}
        <div className="p-3 border-t border-zinc-800">
          <div className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-zinc-800 transition-colors">
            <Avatar className="h-8 w-8 shrink-0">
              <AvatarImage src={profile?.avatar_url ?? undefined} />
              <AvatarFallback className="bg-zinc-700 text-zinc-100 text-xs font-semibold">
                {getInitials(profile?.name ?? "U")}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-zinc-100 truncate">{profile?.name ?? "Usuário"}</p>
              <p className="text-[10px] text-zinc-500 capitalize">(GOAL_LABELS as Record<string, string>)[profile?.goal ?? ''] ?? profile?.goal ?? ''</p>
            </div>
            <button
              onClick={handleLogout}
              className="text-zinc-600 hover:text-red-400 transition-colors p-1"
              title="Sair"
            >
              <LogOut size={14} />
            </button>
          </div>
        </div>
      </aside>
    </>
  );
}
