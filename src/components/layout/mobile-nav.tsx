"use client";

import { useState } from "react";
import { Header } from "@/components/layout/header";
import { BottomNav } from "@/components/layout/bottom-nav";
import { MobileDrawer } from "@/components/layout/mobile-drawer";
import type { Profile } from "@/types";

interface MobileNavProps {
  profile: Profile | null;
}

export function MobileNav({ profile }: MobileNavProps) {
  const [drawerOpen, setDrawerOpen] = useState(false);

  return (
    <>
      <Header
        profile={profile}
        onOpenDrawer={() => setDrawerOpen(true)}
      />
      <MobileDrawer
        profile={profile}
        isOpen={drawerOpen}
        onClose={() => setDrawerOpen(false)}
      />
      <BottomNav onOpenDrawer={() => setDrawerOpen(true)} />
    </>
  );
}
