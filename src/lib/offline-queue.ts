// Outbox / fila offline para gravações no Supabase.
// Se uma gravação falhar (sem internet), o registro é salvo no localStorage
// e reenviado automaticamente assim que a conexão voltar. Nada se perde.
//
// Idempotência: cada linha enfileirada já leva um `id` (uuid) gerado no
// cliente, então um reenvio que tenha parcialmente funcionado não duplica
// (PK duplicada -> erro 23505 é tratado como sucesso).

const KEY = 'edn_offline_queue_v1';

export interface QueuedInsert {
  table: string;
  rows: Record<string, unknown>[];
  onConflict?: string; // se definido, usa upsert(...) em vez de insert(...)
}

export interface QueuedTx {
  id: string;
  createdAt: number;
  label?: string;
  inserts: QueuedInsert[];
}

function read(): QueuedTx[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) || '[]');
  } catch {
    return [];
  }
}

function write(q: QueuedTx[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(q));
  } catch {
    /* ignore */
  }
}

export function newId(): string {
  try {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  } catch {
    /* fallback */
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

export function enqueueTx(tx: Omit<QueuedTx, 'id' | 'createdAt'>): void {
  const q = read();
  q.push({ ...tx, id: newId(), createdAt: Date.now() });
  write(q);
}

export function queueSize(): number {
  return read().length;
}

// Detecta erro de rede/offline (vs. erro de validação do servidor).
function isNetworkError(err: unknown): boolean {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return true;
  if (!err) return false;
  const e = err as { message?: string; name?: string; code?: string };
  const msg = (e.message || '').toLowerCase();
  return (
    e.name === 'TypeError' ||
    msg.includes('failed to fetch') ||
    msg.includes('networkerror') ||
    msg.includes('network request failed') ||
    msg.includes('load failed') ||
    e.code === 'ENOTFOUND' ||
    e.code === 'ECONNREFUSED'
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseClient = any;

// Tenta enviar a fila. Retorna quantas transações foram enviadas.
export async function flushQueue(supabase: SupabaseClient): Promise<number> {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return 0;
  const q = read();
  if (!q.length) return 0;

  let flushed = 0;
  const remaining: QueuedTx[] = [];

  for (const tx of q) {
    let ok = true;
    for (const ins of tx.inserts) {
      if (!ins.rows?.length) continue;
      try {
        const { error } = ins.onConflict
          ? await supabase.from(ins.table).upsert(ins.rows, { onConflict: ins.onConflict })
          : await supabase.from(ins.table).insert(ins.rows);
        // 23505 = PK duplicada (já inserido num envio anterior) -> idempotente
        if (error && error.code !== '23505') {
          if (isNetworkError(error)) {
            ok = false;
            break;
          }
          // erro não-recuperável (validação): registra e descarta para não
          // travar a fila para sempre.
          console.warn('[offline-queue] descartando insert com erro permanente', ins.table, error);
        }
      } catch (err) {
        if (isNetworkError(err)) {
          ok = false;
          break;
        }
        console.warn('[offline-queue] erro inesperado', ins.table, err);
      }
    }
    if (ok) flushed++;
    else remaining.push(tx);
  }

  write(remaining);
  return flushed;
}

// Tenta gravar online; se falhar por rede, enfileira. Retorna 'sent' | 'queued' | 'error'.
export async function insertOrQueue(
  supabase: SupabaseClient,
  inserts: QueuedInsert[],
  label?: string,
): Promise<'sent' | 'queued' | 'error'> {
  try {
    for (const ins of inserts) {
      if (!ins.rows?.length) continue;
      const { error } = ins.onConflict
        ? await supabase.from(ins.table).upsert(ins.rows, { onConflict: ins.onConflict })
        : await supabase.from(ins.table).insert(ins.rows);
      if (error) {
        if (isNetworkError(error)) {
          enqueueTx({ label, inserts });
          return 'queued';
        }
        return 'error';
      }
    }
    return 'sent';
  } catch (err) {
    if (isNetworkError(err)) {
      enqueueTx({ label, inserts });
      return 'queued';
    }
    return 'error';
  }
}

// Registra o auto-flush: tenta esvaziar a fila ao carregar, ao voltar a
// conexão e periodicamente. Devolve uma função de cleanup.
export function startQueueAutoFlush(supabase: SupabaseClient, onFlushed?: (n: number) => void): () => void {
  if (typeof window === 'undefined') return () => {};
  let stopped = false;
  const run = async () => {
    if (stopped) return;
    const n = await flushQueue(supabase);
    if (n > 0 && onFlushed) onFlushed(n);
  };
  window.addEventListener('online', run);
  const interval = window.setInterval(run, 30000);
  run();
  return () => {
    stopped = true;
    window.removeEventListener('online', run);
    window.clearInterval(interval);
  };
}
