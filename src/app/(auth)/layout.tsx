export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-gradient-to-br from-zinc-950 via-zinc-900 to-zinc-950" />
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-96 h-96 bg-[#D4853A]/8 rounded-full blur-3xl pointer-events-none" />
      <div className="relative w-full max-w-md">{children}</div>
    </div>
  );
}
