'use client';
/**
 * /auth/reset-password — página de redefinição de senha.
 * O link "Esqueci minha senha" (login) envia um e-mail do Supabase que
 * redireciona para cá. Esta página não existia — o link caía em 404,
 * por isso "trocar senha não funcionava".
 *
 * Suporta os dois formatos de link do Supabase:
 *  - PKCE:    ?code=...        → exchangeCodeForSession(code)
 *  - Implicit: #access_token=… → detectSessionInUrl do client cuida sozinho
 */

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Zap, Lock, Eye, EyeOff, Loader2, CheckCircle2 } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

type Stage = 'verifying' | 'ready' | 'saving' | 'done' | 'invalid';

export default function ResetPasswordPage() {
  const supabase = createClient();
  const router = useRouter();
  const [stage, setStage] = useState<Stage>('verifying');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [show, setShow] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let done = false;

    // O evento PASSWORD_RECOVERY dispara quando o client processa o link
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (done) return;
      if (event === 'PASSWORD_RECOVERY' || (event === 'SIGNED_IN' && session)) {
        done = true;
        setStage('ready');
      }
    });

    (async () => {
      // Fluxo PKCE: troca o ?code= por sessão
      const params = new URLSearchParams(window.location.search);
      const code = params.get('code');
      if (code) {
        const { error: exErr } = await supabase.auth.exchangeCodeForSession(code);
        if (!done) {
          done = true;
          setStage(exErr ? 'invalid' : 'ready');
          if (exErr) setError('Link inválido ou expirado. Solicite um novo e-mail de recuperação.');
        }
        return;
      }
      // Erro explícito no hash (link expirado)
      if (window.location.hash.includes('error=')) {
        done = true;
        setStage('invalid');
        setError('Link inválido ou expirado. Solicite um novo e-mail de recuperação.');
        return;
      }
      // Fallback: sessão já existente (usuário logado quer trocar a senha)
      const { data: { session } } = await supabase.auth.getSession();
      if (!done) {
        if (session) { done = true; setStage('ready'); }
        else {
          // dá 3s para o detectSessionInUrl processar o hash do link
          setTimeout(async () => {
            if (done) return;
            const { data: { session: s2 } } = await supabase.auth.getSession();
            done = true;
            if (s2) setStage('ready');
            else {
              setStage('invalid');
              setError('Link inválido ou expirado. Solicite um novo e-mail de recuperação.');
            }
          }, 3000);
        }
      }
    })();

    return () => sub.subscription.unsubscribe();
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (password.length < 6) { setError('A senha deve ter no mínimo 6 caracteres.'); return; }
    if (password !== confirm) { setError('As senhas não coincidem.'); return; }

    setStage('saving');
    const { error: upErr } = await supabase.auth.updateUser({ password });
    if (upErr) {
      setError(upErr.message.includes('different from the old')
        ? 'A nova senha deve ser diferente da anterior.'
        : 'Não foi possível atualizar a senha. Solicite um novo link e tente novamente.');
      setStage('ready');
      return;
    }
    setStage('done');
    setTimeout(() => router.push('/app/dashboard'), 2500);
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-zinc-950 p-4">
      <div className="w-full max-w-sm rounded-2xl border border-zinc-800 bg-zinc-900 p-8 shadow-xl">
        <div className="flex flex-col items-center mb-6">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-[#D4853A] mb-3">
            <Zap className="h-6 w-6 text-white" />
          </div>
          <h1 className="text-xl font-bold text-zinc-100">Redefinir senha</h1>
        </div>

        {stage === 'verifying' && (
          <div className="flex flex-col items-center gap-3 py-6 text-zinc-400">
            <Loader2 className="h-6 w-6 animate-spin text-[#D4853A]" />
            <p className="text-sm">Validando o link de recuperação…</p>
          </div>
        )}

        {stage === 'invalid' && (
          <div className="space-y-4">
            <p className="text-sm text-red-400 bg-red-400/10 border border-red-400/20 rounded-lg px-3 py-2.5">{error}</p>
            <button
              onClick={() => router.push('/login')}
              className="w-full py-2.5 rounded-lg bg-[#D4853A] text-white text-sm font-medium hover:bg-[#B8702E] transition-colors"
            >
              Voltar ao login
            </button>
          </div>
        )}

        {(stage === 'ready' || stage === 'saving') && (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-zinc-300">Nova senha</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500" />
                <input
                  type={show ? 'text' : 'password'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="Mínimo 6 caracteres"
                  autoComplete="new-password"
                  autoFocus
                  className="flex h-10 w-full rounded-lg border border-zinc-700 bg-zinc-800/50 pl-9 pr-10 py-2 text-sm text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-[#D4853A]"
                />
                <button type="button" onClick={() => setShow(v => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300">
                  {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-zinc-300">Confirmar nova senha</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500" />
                <input
                  type={show ? 'text' : 'password'}
                  value={confirm}
                  onChange={e => setConfirm(e.target.value)}
                  placeholder="Repita a senha"
                  autoComplete="new-password"
                  className="flex h-10 w-full rounded-lg border border-zinc-700 bg-zinc-800/50 pl-9 pr-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-[#D4853A]"
                />
              </div>
            </div>

            {error && <p className="text-xs text-red-400 bg-red-400/10 border border-red-400/20 rounded-lg px-3 py-2">{error}</p>}

            <button
              type="submit"
              disabled={stage === 'saving'}
              className="w-full py-2.5 rounded-lg bg-[#D4853A] text-white text-sm font-semibold hover:bg-[#B8702E] disabled:opacity-60 transition-colors flex items-center justify-center gap-2"
            >
              {stage === 'saving' ? <><Loader2 className="h-4 w-4 animate-spin" /> Salvando…</> : 'Salvar nova senha'}
            </button>
          </form>
        )}

        {stage === 'done' && (
          <div className="flex flex-col items-center gap-3 py-6 text-center">
            <CheckCircle2 className="h-10 w-10 text-green-400" />
            <p className="font-semibold text-zinc-100">Senha atualizada!</p>
            <p className="text-sm text-zinc-500">Redirecionando para o app…</p>
          </div>
        )}
      </div>
    </div>
  );
}
