/**
 * Cache in-memory para respostas da IA coach.
 * TTL de 1h para perguntas idênticas. Reduz custo de API e latência.
 * Em produção, substituir por Redis/Upstash para cache compartilhado entre instâncias.
 */

interface CacheEntry {
  response: string;
  expiresAt: number;
}

const TTL_MS = 60 * 60 * 1000; // 1 hora
const MAX_ENTRIES = 200;

const cache = new Map<string, CacheEntry>();

/** Gera chave de cache a partir do prompt (normalizado) */
export function makeCacheKey(systemPrompt: string, userMessage: string): string {
  const normalized = (systemPrompt.slice(0, 200) + '|' + userMessage.trim().toLowerCase())
    .replace(/\s+/g, ' ');
  // Hash simples (djb2) — suficiente para cache em memória
  let hash = 5381;
  for (let i = 0; i < normalized.length; i++) {
    hash = ((hash << 5) + hash) ^ normalized.charCodeAt(i);
  }
  return String(hash >>> 0);
}

/** Retorna resposta cacheada ou null se expirada/ausente */
export function getCached(key: string): string | null {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    cache.delete(key);
    return null;
  }
  return entry.response;
}

/** Armazena resposta no cache com TTL */
export function setCached(key: string, response: string): void {
  // Evitar crescimento ilimitado — LRU simples: remover entrada mais antiga
  if (cache.size >= MAX_ENTRIES) {
    const firstKey = cache.keys().next().value;
    if (firstKey) cache.delete(firstKey);
  }
  cache.set(key, { response, expiresAt: Date.now() + TTL_MS });
}

/** Limpar entradas expiradas (pode ser chamado periodicamente) */
export function purgeExpired(): void {
  const now = Date.now();
  for (const [key, entry] of cache.entries()) {
    if (now > entry.expiresAt) cache.delete(key);
  }
}
