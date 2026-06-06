import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Sidebar } from "@/components/layout/sidebar";
import { MobileNav } from "@/components/layout/mobile-nav";
import { ApkUpdateBanner } from "@/components/edn/apk-update-banner";
import { FirstLaunchPermissions } from "@/components/edn/first-launch-permissions";
import type { Profile } from "@/types";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();

  return (
    <div className="min-h-screen bg-zinc-950">
      {/* Desktop Sidebar */}
      <Sidebar profile={profile as Profile | null} />

      {/* Mobile: Header + Drawer + BottomNav (state shared) */}
      <MobileNav profile={profile as Profile | null} />

      {/* OTA do shell nativo (só aparece dentro do APK) */}
      <ApkUpdateBanner />

      {/* Primeiro uso: solicita todas as permissões (só no APK nativo) */}
      <FirstLaunchPermissions />

      {/* Main content */}
      <main className="md:ml-60 min-h-screen pb-20 md:pb-0">
        <div className="max-w-5xl mx-auto px-4 py-6 md:py-8">
          {children}
        </div>
      </main>
    </div>
  );
}
