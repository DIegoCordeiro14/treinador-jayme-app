"use client";

import { useEffect, useState, useRef } from "react";
import { X, SkipForward } from "lucide-react";
import { Button } from "@/components/ui/button";
import { padZero } from "@/lib/utils";

interface RestTimerProps {
  durationSeconds: number;
  onComplete: () => void;
  onSkip: () => void;
}

export function RestTimer({ durationSeconds, onComplete, onSkip }: RestTimerProps) {
  const [remaining, setRemaining] = useState(durationSeconds);

  const onCompleteRef = useRef(onComplete);
  useEffect(() => { onCompleteRef.current = onComplete; }, [onComplete]);

  // Fim absoluto (timestamp). Assim o tempo continua correto mesmo se a aba/app
  // for para segundo plano ou a tela apagar — o setInterval é congelado pelo SO,
  // mas ao voltar recalculamos pelo relógio real.
  const endAtRef = useRef<number>(Date.now() + durationSeconds * 1000);
  const doneRef = useRef(false);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const audioCtxRef = useRef<any>(null);
  const prevRemRef = useRef<number>(durationSeconds);

  // Bip curto via Web Audio (sem arquivo). Aviso nos 10s finais.
  function beep(freq: number, durMs: number, volume = 0.18) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const Ctx = (window as any).AudioContext || (window as any).webkitAudioContext;
      if (!Ctx) return;
      if (!audioCtxRef.current) audioCtxRef.current = new Ctx();
      const ctx = audioCtxRef.current;
      if (ctx.state === 'suspended') ctx.resume();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      const now = ctx.currentTime;
      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(volume, now + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + durMs / 1000);
      osc.connect(gain); gain.connect(ctx.destination);
      osc.start(now); osc.stop(now + durMs / 1000 + 0.02);
    } catch { /* áudio indisponível — ignora */ }
  }

  useEffect(() => {
    endAtRef.current = Date.now() + durationSeconds * 1000;
    doneRef.current = false;
    prevRemRef.current = durationSeconds;

    const tick = () => {
      const rem = Math.max(0, Math.round((endAtRef.current - Date.now()) / 1000));
      setRemaining(rem);
      // Aviso sonoro na contagem regressiva final
      if (rem !== prevRemRef.current) {
        if (rem === 10) { beep(880, 180); try { navigator.vibrate?.(120); } catch { /* */ } }
        else if (rem === 3 || rem === 2 || rem === 1) beep(700, 120);
        else if (rem === 0) { beep(1040, 450, 0.22); try { navigator.vibrate?.([90, 60, 90]); } catch { /* */ } }
        prevRemRef.current = rem;
      }
      if (rem <= 0 && !doneRef.current) {
        doneRef.current = true;
        onCompleteRef.current();
      }
    };

    tick();
    const interval = setInterval(tick, 250);
    // Recalcula imediatamente quando o app volta ao primeiro plano
    const onVisible = () => { if (document.visibilityState === "visible") tick(); };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);

    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
  }, [durationSeconds]);

  const progress = ((durationSeconds - remaining) / durationSeconds) * 100;
  const circumference = 2 * Math.PI * 54; // r=54
  const strokeDashoffset = circumference - (progress / 100) * circumference;

  const minutes = Math.floor(remaining / 60);
  const seconds = remaining % 60;

  const urgencyColor =
    remaining <= 10 ? "#8B5A5A" : remaining <= 30 ? "#A67C3A" : "#D4853A";

  return (
    <div
      className="fixed inset-0 z-50 bg-zinc-950 flex flex-col items-center justify-center gap-8 animate-in fade-in-0"
      style={{
        paddingTop: "calc(env(safe-area-inset-top, 0px) + 1rem)",
        paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 1rem)",
      }}
    >
      <div>
        <h2 className="text-center text-xl font-bold text-zinc-100 mb-1">Descanso</h2>
        <p className="text-center text-sm text-zinc-400">Próxima série em breve</p>
      </div>

      {/* Circular progress */}
      <div className="relative flex items-center justify-center">
        <svg width="140" height="140" className="-rotate-90">
          <circle cx="70" cy="70" r="54" fill="none" stroke="#1C2933" strokeWidth="8" />
          <circle
            cx="70" cy="70" r="54" fill="none"
            stroke={urgencyColor} strokeWidth="8" strokeLinecap="round"
            strokeDasharray={circumference} strokeDashoffset={strokeDashoffset}
            style={{ transition: "stroke-dashoffset 1s linear, stroke 0.5s ease" }}
          />
        </svg>
        <div className="absolute flex flex-col items-center">
          <span className="text-3xl font-bold font-mono tabular-nums tracking-tight" style={{ color: urgencyColor }}>
            {padZero(minutes)}:{padZero(seconds)}
          </span>
          <span className="text-xs text-zinc-500 mt-1">
            de {Math.floor(durationSeconds / 60)}:{padZero(durationSeconds % 60)}
          </span>
        </div>
      </div>

      {/* Actions */}
      <div className="flex gap-3">
        <Button variant="outline" onClick={onSkip} className="gap-2">
          <SkipForward className="h-4 w-4" />
          Pular Descanso
        </Button>
        <Button variant="ghost" onClick={onSkip} className="gap-2 text-zinc-500">
          <X className="h-4 w-4" />
          Cancelar
        </Button>
      </div>

      <p className="text-xs text-zinc-600 max-w-xs text-center">
        O descanso adequado entre séries é fundamental para manter a performance. Não pule!
      </p>
    </div>
  );
}
