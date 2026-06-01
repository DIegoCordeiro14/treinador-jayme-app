import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Sidebar } from "@/components/layout/sidebar";
import { BottomNav } from "@/components/layout/bottom-nav";
import { Header } from "@/components/layout/header";
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

      {/* Mobile Header */}
      <Header profile={profile as Profile | null} />

      {/* Main content */}
      <main className="md:ml-60 min-h-screen pb-20 md:pb-0">
        <div className="max-w-5xl mx-auto px-4 py-6 md:py-8">
          {children}
        </div>
      </main>

      {/* Mobile Bottom Nav */}
      <BottomNav />
    </div>
  );
}
