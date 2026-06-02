"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Dumbbell,
  Bot,
  Utensils,
  User,
} from "lucide-react";
import { cn } from "@/lib/utils";

const navItems = [
  { href: "/app/dashboard", label: "Início", icon: LayoutDashboard },
  { href: "/app/treinos", label: "Treinos", icon: Dumbbell },
  { href: "/app/ia", label: "Jayme IA", icon: Bot },
  { href: "/app/nutricao", label: "Nutrição", icon: Utensils },
  { href: "/app/perfil", label: "Perfil", icon: User },
];

export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-zinc-900/95 backdrop-blur-sm border-t border-zinc-800 pb-safe">
      <div className="flex items-center justify-around px-1 py-2">
        {navItems.map((item) => {
          const isActive =
            pathname === item.href ||
            (item.href !== "/app/dashboard" && pathname.startsWith(item.href));
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex flex-col items-center gap-0.5 px-2.5 py-1.5 rounded-lg transition-all",
                isActive ? "text-blue-400" : "text-zinc-500 hover:text-zinc-300"
              )}
            >
              <Icon
                size={20}
                className={cn(
                  "transition-all",
                  isActive && "drop-shadow-[0_0_6px_rgba(96,165,250,0.8)]"
                )}
              />
              <span className="text-[10px] font-medium">{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
