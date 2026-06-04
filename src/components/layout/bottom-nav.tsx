"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

// ── Ícones idênticos aos do mockup mobile ──
type IconProps = { size?: number; className?: string };
const svgProps = (size: number, className?: string) => ({
  width: size, height: size, viewBox: "0 0 24 24", fill: "none",
  stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const, className,
});
const InicioIcon = ({ size = 19, className }: IconProps) => (
  <svg {...svgProps(size, className)}>
    <rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" />
    <rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" />
  </svg>
);
const TreinosIcon = ({ size = 19, className }: IconProps) => (
  <svg {...svgProps(size, className)}>
    <path d="M6 5v14M18 5v14M3 8h4M17 8h4M3 16h4M17 16h4" />
  </svg>
);
const CardioIcon = ({ size = 19, className }: IconProps) => (
  <svg {...svgProps(size, className)}>
    <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
  </svg>
);
const NutricaoIcon = ({ size = 19, className }: IconProps) => (
  <svg {...svgProps(size, className)}>
    <path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10 10-4.5 10-10S17.5 2 12 2z" />
    <path d="M12 6v6l4 2" />
  </svg>
);
const CoachIcon = ({ size = 19, className }: IconProps) => (
  <svg {...svgProps(size, className)}>
    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
  </svg>
);
const PerfilIcon = ({ size = 19, className }: IconProps) => (
  <svg {...svgProps(size, className)}>
    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" />
  </svg>
);
import { cn } from "@/lib/utils";

const PRIMARY_ITEMS = [
  { href: "/app/dashboard", label: "Inicio", icon: InicioIcon },
  { href: "/app/treinos", label: "Treinos", icon: TreinosIcon },
  { href: "/app/cardio", label: "Cardio", icon: CardioIcon },
  { href: "/app/nutricao", label: "Nutricao", icon: NutricaoIcon },
  { href: "/app/ia", label: "Coach", icon: CoachIcon },
  { href: "/app/perfil", label: "Perfil", icon: PerfilIcon },
];

interface BottomNavProps {
  onOpenDrawer?: () => void;
}

export function BottomNav({ onOpenDrawer }: BottomNavProps) {
  const pathname = usePathname();

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

      </div>
    </nav>
  );
}
