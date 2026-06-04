"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Dumbbell,
  Bot,
  Utensils,
  User,
  MoreHorizontal,
} from "lucide-react";
import { cn } from "@/lib/utils";

const PRIMARY_ITEMS = [
  { href: "/app/dashboard", label: "Inicio", icon: LayoutDashboard },
  { href: "/app/treinos", label: "Treinos", icon: Dumbbell },
  { href: "/app/ia", label: "Coach EDN", icon: Bot },
  { href: "/app/nutricao", label: "Nutricao", icon: Utensils },
  { href: "/app/perfil", label: "Perfil", icon: User },
];

interface BottomNavProps {
  onOpenDrawer?: () => void;
}

export function BottomNav({ onOpenDrawer }: BottomNavProps) {
  const pathname = usePathname();

  const inPrimary = PRIMARY_ITEMS.some(
    (item) =>
      pathname === item.href ||
      (item.href !== "/app/dashboard" && pathname.startsWith(item.href))
  );

  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-zinc-950/95 backdrop-blur-sm border-t border-white/[0.07] pb-safe">
      <div className="flex items-center justify-around px-1 py-1.5">
        {PRIMARY_ITEMS.map((item) => {
          const isActive =
            pathname === item.href ||
            (item.href !== "/app/dashboard" && pathname.startsWith(item.href));
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex flex-col items-center gap-0.5 px-2 py-1.5 rounded-lg transition-all min-w-0",
                isActive ? "text-[#D4853A]" : "text-zinc-500 hover:text-zinc-300"
              )}
            >
              <Icon
                size={19}
                className={cn(
                  "transition-all shrink-0",
                  isActive && "drop-shadow-[0_0_6px_rgba(212,133,58,0.8)]"
                )}
              />
              <span className="text-[9px] font-bold leading-none tracking-wide uppercase">{item.label}</span>
            </Link>
          );
        })}

        <button
          onClick={onOpenDrawer}
          className={cn(
            "flex flex-col items-center gap-0.5 px-2 py-1.5 rounded-lg transition-all min-w-0",
            !inPrimary ? "text-[#D4853A]" : "text-zinc-500 hover:text-zinc-300"
          )}
        >
          <MoreHorizontal
            size={19}
            className={cn(
              "shrink-0",
              !inPrimary && "drop-shadow-[0_0_6px_rgba(212,133,58,0.8)]"
            )}
          />
          <span className="text-[9px] font-bold leading-none tracking-wide uppercase">Mais</span>
        </button>
      </div>
    </nav>
  );
}
