import Link from "next/link";
import { Bot, TrendingUp, Dumbbell, Zap, ChevronRight, Star } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-zinc-950 flex flex-col">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b border-zinc-800/60 bg-zinc-950/80 backdrop-blur-sm">
        <div className="container mx-auto max-w-6xl px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#D4853A] font-black italic text-base text-white shadow-glow-blue-sm">
              E
            </div>
            <div>
              <span className="font-extrabold italic text-zinc-100 leading-none block">Coach EDN</span>
              <span className="text-[8px] text-zinc-500 font-semibold uppercase tracking-[0.14em] block">Escola dos Naturais</span>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Link href="/login">
              <Button variant="ghost" size="sm">
                Entrar
              </Button>
            </Link>
            <Link href="/register">
              <Button size="sm">
                Começar Grátis
              </Button>
            </Link>
          </div>
        </div>
      </header>

      {/* Hero */}
      <main className="flex-1">
        <section className="relative overflow-hidden py-24 md:py-36">
          {/* Background gradient */}
          <div className="absolute inset-0 bg-gradient-to-br from-zinc-950 via-zinc-900 to-zinc-950" />
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-96 h-96 bg-[#D4853A]/10 rounded-full blur-3xl" />
          <div className="absolute bottom-0 left-1/4 w-64 h-64 bg-[#D4853A]/5 rounded-full blur-3xl" />

          <div className="container relative mx-auto max-w-5xl px-4 text-center">
            {/* Badge */}
            <div className="inline-flex items-center gap-2 rounded-full border border-[#D4853A]/30 bg-[#D4853A]/10 px-4 py-1.5 text-xs font-semibold text-[#D4853A] mb-6">
              <Star className="h-3 w-3" />
              Metodologia Escola dos Naturais (EDN)
            </div>

            {/* Headline */}
            <h1 className="text-4xl md:text-6xl lg:text-7xl font-bold text-zinc-100 leading-tight mb-6">
              Treine como um
              <br />
              <span className="text-[#D4853A]">natural de elite</span>
            </h1>

            {/* Subtext */}
            <p className="text-lg md:text-xl text-zinc-400 max-w-2xl mx-auto mb-10 leading-relaxed">
              Plataforma criada pela metodologia do Jayme De Lamadrid. Treino estruturado,
              progressão inteligente, coach de IA e tracking completo — tudo para quem
              treina de verdade, sem atalhos.
            </p>

            {/* CTAs */}
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-16">
              <Link href="/register">
                <Button size="lg" className="gap-2 min-w-[220px] shadow-glow-blue">
                  <Zap className="h-5 w-5" />
                  Começar Gratuitamente
                </Button>
              </Link>
              <Link href="/login">
                <Button size="lg" variant="outline" className="gap-2 min-w-[180px]">
                  Já tenho conta
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </Link>
            </div>

            {/* Social proof */}
            <p className="text-sm text-zinc-500">
              Baseado na metodologia de{" "}
              <span className="text-zinc-300 font-semibold">Jayme De Lamadrid</span>,
              atleta profissional de fisiculturismo natural
            </p>
          </div>
        </section>

        {/* Quote */}
        <section className="py-12 border-y border-zinc-800/60 bg-zinc-900/30">
          <div className="container mx-auto max-w-3xl px-4 text-center">
            <blockquote className="text-xl md:text-2xl font-medium text-zinc-300 italic">
              &ldquo;Se o seu treino melhora, o seu físico melhora.&rdquo;
            </blockquote>
            <cite className="text-sm text-zinc-500 mt-3 block not-italic">
              — Jayme De Lamadrid, Escola dos Naturais
            </cite>
          </div>
        </section>

        {/* Feature cards */}
        <section className="py-20">
          <div className="container mx-auto max-w-6xl px-4">
            <div className="text-center mb-12">
              <h2 className="text-3xl md:text-4xl font-bold text-zinc-100 mb-4">
                Tudo que um natural precisa
              </h2>
              <p className="text-zinc-400 max-w-xl mx-auto">
                Ferramentas construídas com base na ciência do treinamento natural.
                Não copiamos o que funciona para hormonizados.
              </p>
            </div>

            <div className="grid md:grid-cols-3 gap-6">
              {/* Feature 1 */}
              <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-6 hover:border-zinc-700 transition-all group">
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-[#D4853A]/15 border border-[#D4853A]/30 mb-5 group-hover:bg-[#D4853A]/20 transition-colors">
                  <Bot className="h-6 w-6 text-[#D4853A]" />
                </div>
                <h3 className="text-lg font-semibold text-zinc-100 mb-3">
                  Coach EDN
                </h3>
                <p className="text-sm text-zinc-400 leading-relaxed">
                  Converse com um coach de IA treinado na metodologia EDN. Monte treinos,
                  tire dúvidas sobre RIR, progressão, deload e periodização — respostas
                  baseadas em ciência + prática real.
                </p>
              </div>

              {/* Feature 2 */}
              <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-6 hover:border-zinc-700 transition-all group">
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-green-600/15 border border-green-600/30 mb-5 group-hover:bg-green-600/20 transition-colors">
                  <TrendingUp className="h-6 w-6 text-green-400" />
                </div>
                <h3 className="text-lg font-semibold text-zinc-100 mb-3">
                  Tracking de Evolução
                </h3>
                <p className="text-sm text-zinc-400 leading-relaxed">
                  Registre peso, medidas corporais e volume de treino. Visualize sua
                  progressão com gráficos detalhados. Identifique estagnações antes que
                  elas atrapalhem seus resultados.
                </p>
              </div>

              {/* Feature 3 */}
              <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-6 hover:border-zinc-700 transition-all group">
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-purple-600/15 border border-purple-600/30 mb-5 group-hover:bg-purple-600/20 transition-colors">
                  <Dumbbell className="h-6 w-6 text-purple-400" />
                </div>
                <h3 className="text-lg font-semibold text-zinc-100 mb-3">
                  Planejamento Inteligente
                </h3>
                <p className="text-sm text-zinc-400 leading-relaxed">
                  Crie e execute planos de treino com controle total de séries, reps,
                  carga e descanso. Timer automático, controle por exercício e salvamento
                  automático do histórico de sessões.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* EDN Methodology */}
        <section className="py-20 bg-zinc-900/30">
          <div className="container mx-auto max-w-6xl px-4">
            <div className="grid md:grid-cols-2 gap-12 items-center">
              <div>
                <div className="inline-flex items-center gap-2 rounded-full border border-zinc-700 bg-zinc-800/50 px-3 py-1 text-xs font-medium text-zinc-400 mb-4">
                  <Zap className="h-3 w-3 text-[#D4853A]" />
                  Metodologia EDN
                </div>
                <h2 className="text-3xl font-bold text-zinc-100 mb-4">
                  Ciência do treinamento natural
                </h2>
                <p className="text-zinc-400 leading-relaxed mb-6">
                  90% dos naturais treinam errado porque copiam o treino de hormonizados.
                  A EDN foi criada especificamente para naturais, com progressão estruturada
                  e gestão de fadiga adequada.
                </p>
                <ul className="space-y-3">
                  {[
                    "Sistema RIR para controle preciso de intensidade",
                    "Progressão linear, por volume e por repetições",
                    "Warm Up, Feeder e Working Sets estruturados",
                    "Deload estratégico para sustentabilidade",
                    "Frequência baseada em recuperação, não em regras",
                  ].map((item, i) => (
                    <li key={i} className="flex items-start gap-3 text-sm text-zinc-300">
                      <span className="text-[#D4853A] mt-0.5 shrink-0 font-bold">✓</span>
                      {item}
                    </li>
                  ))}
                </ul>
              </div>

              <div className="grid grid-cols-2 gap-4">
                {[
                  { label: "Microciclo", value: "7 dias", desc: "Unidade básica de planejamento" },
                  { label: "Mesociclo", value: "8–12 sem", desc: "Bloco de treinamento estruturado" },
                  { label: "RIR 0", value: "Falha", desc: "Repetições até a falha concêntrica" },
                  { label: "Top Set", value: "Carga máx", desc: "Série com maior carga da sessão" },
                ].map((item) => (
                  <div
                    key={item.label}
                    className="rounded-xl border border-zinc-800 bg-zinc-900 p-4"
                  >
                    <p className="text-xs text-zinc-500 mb-1">{item.label}</p>
                    <p className="text-lg font-bold text-[#D4853A]">{item.value}</p>
                    <p className="text-xs text-zinc-500 mt-1">{item.desc}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* CTA Section */}
        <section className="py-24">
          <div className="container mx-auto max-w-3xl px-4 text-center">
            <h2 className="text-3xl md:text-4xl font-bold text-zinc-100 mb-4">
              Pronto para treinar com ciência?
            </h2>
            <p className="text-zinc-400 mb-8 text-lg">
              Crie sua conta gratuitamente e comece hoje mesmo.
            </p>
            <Link href="/register">
              <Button size="lg" className="gap-2 shadow-glow-blue">
                <Zap className="h-5 w-5" />
                Criar conta grátis
              </Button>
            </Link>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-zinc-800 py-8">
        <div className="container mx-auto max-w-6xl px-4 flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <div className="flex h-6 w-6 items-center justify-center rounded bg-[#D4853A] font-black italic text-xs text-white">
              E
            </div>
            <span className="text-sm font-extrabold italic text-zinc-400">Coach EDN</span>
          </div>
          <p className="text-xs text-zinc-600">
            © {new Date().getFullYear()} Coach EDN. Metodologia Escola dos Naturais (EDN).
          </p>
          <div className="flex items-center gap-4 text-xs text-zinc-600">
            <Link href="/login" className="hover:text-zinc-400 transition-colors">
              Entrar
            </Link>
            <Link href="/register" className="hover:text-zinc-400 transition-colors">
              Cadastrar
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
