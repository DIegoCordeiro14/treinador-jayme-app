'use client';

import React from 'react';

interface Props { children: React.ReactNode; onReset?: () => void; }
interface State { hasError: boolean }

/** Contém erros de render de uma tela (ex.: corrida) para não derrubar o app inteiro. */
export class ScreenErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) { super(props); this.state = { hasError: false }; }
  static getDerivedStateFromError(): State { return { hasError: true }; }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  componentDidCatch(error: any) { try { console.error('[ScreenErrorBoundary]', error); } catch { /* */ } }
  render() {
    if (this.state.hasError) {
      return (
        <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-zinc-950 p-6 text-center gap-3"
          style={{ paddingTop: 'env(safe-area-inset-top,0px)' }}>
          <p className="text-zinc-100 font-semibold text-base">Ops, algo travou nesta tela.</p>
          <p className="text-xs text-zinc-500 max-w-xs">Se você estava correndo, a corrida foi preservada — reabra para continuar de onde parou.</p>
          <button
            onClick={() => { this.setState({ hasError: false }); try { this.props.onReset?.(); } catch { /* */ } }}
            className="mt-2 px-5 py-2.5 rounded-2xl bg-orange-500 hover:bg-orange-400 text-white font-bold"
          >Voltar</button>
        </div>
      );
    }
    return this.props.children;
  }
}
