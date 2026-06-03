'use client';

import { useState, useRef, useEffect } from 'react';
import { Bot, Send, Plus, Trash2, Brain, RefreshCw, X, History } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { createClient } from '@/lib/supabase/client';
import { toast } from 'sonner';
import type { AIMessage } from '@/lib/ai-coach';
import { detectAgent, AGENT_CONFIGS, type AgentType } from '@/lib/ai-coach/agents';
import { MarkdownText } from '@/components/ai/markdown-text';

const QUICK_PROMPTS = [
  { icon: '💪', label: 'Analisar meu treino', prompt: 'Analise meu histórico de treino recente e diga o que posso melhorar segundo a metodologia EDN.' },
  { icon: '📈', label: 'Progressão travada', prompt: 'Minha progressão travou. Como devo proceder segundo a EDN?' },
  { icon: '🔄', label: 'Preciso fazer deload?', prompt: 'Como sei quando preciso fazer um deload? Quais sinais devo observar?' },
  { icon: '🍽️', label: 'Nutrição para natural', prompt: 'Qual deve ser minha estratégia nutricional para hipertrofia como natural?' },
  { icon: '📅', label: 'Montar mesociclo', prompt: 'Me ajude a estruturar um mesociclo de 10 semanas com foco em hipertrofia para intermediário.' },
  { icon: '❓', label: 'RIR na prática', prompt: 'Como aplicar o sistema RIR no dia a dia? Dê exemplos práticos.' },
];

export default function IAPage() {
  const supabase = createClient();
  const [messages, setMessages] = useState<AIMessage[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [activeAgent, setActiveAgent] = useState<AgentType>('geral');
  const [showHistory, setShowHistory] = useState(false);
  const [conversations, setConversations] = useState<{ id: string; created_at: string; messages: AIMessage[] }[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    loadConversations();
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  async function loadConversations() {
    const { data } = await supabase
      .from('ai_conversations')
      .select('id, created_at, messages')
      .order('updated_at', { ascending: false })
      .limit(10);
    if (data) setConversations(data);
  }

  async function sendMessage(content: string) {
    if (!content.trim() || isLoading) return;

    const userMessage: AIMessage = { role: 'user', content };
    const newMessages = [...messages, userMessage];
    setMessages(newMessages);
    setInput('');
    setIsLoading(true);

    try {
      const response = await fetch('/api/ai-coach', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: newMessages, conversationId, agentHint: detectAgent(content) }),
      });

      if (!response.ok) throw new Error('Falha ao conectar com o treinador');

      const reader = response.body!.getReader();
      const decoder = new TextDecoder();
      let assistantText = '';

      setMessages((prev) => [...prev, { role: 'assistant', content: '' }]);

      let streamDone = false;
      while (!streamDone) {
        const { value, done } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
        const lines = chunk.split('\n');

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6).trim();
            if (data === '[DONE]') { streamDone = true; break; }
            try {
              const parsed = JSON.parse(data);
              if (parsed.error) throw new Error(parsed.error);
              if (parsed.text) {
                assistantText += parsed.text;
                setMessages((prev) => {
                  const updated = [...prev];
                  updated[updated.length - 1] = { role: 'assistant', content: assistantText };
                  return updated;
                });
              }
            } catch (parseErr: any) {
              if (parseErr?.message && parseErr.message !== 'Stream failed') continue;
              if (parseErr?.message === 'Stream failed') throw parseErr;
            }
          }
        }
      }

      // After stream, reload conversations to get new ID
      await loadConversations();
    } catch (err) {
      toast.error('Erro ao conectar com o Coach EDN');
      setMessages((prev) => prev.slice(0, -1)); // remove empty assistant message
    } finally {
      setIsLoading(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  }

  function loadConversation(conv: { id: string; messages: AIMessage[] }) {
    setConversationId(conv.id);
    setMessages(conv.messages);
  }

  function newConversation() {
    setConversationId(null);
    setMessages([]);
  }

  async function deleteConversation(id: string, e: React.MouseEvent) {
    e.stopPropagation();
    await supabase.from('ai_conversations').delete().eq('id', id);
    if (conversationId === id) newConversation();
    await loadConversations();
    toast.success('Conversa removida');
  }

  async function clearAllHistory() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    await supabase.from('ai_conversations').delete().eq('user_id', user.id);
    newConversation();
    setConversations([]);
    toast.success('Histórico limpo');
  }

  return (
    <div className="flex h-[calc(100vh-8rem)] md:h-[calc(100vh-5rem)] gap-4">
      {/* Sidebar — conversation history (desktop) */}
      <aside className="hidden lg:flex flex-col w-64 shrink-0 rounded-xl border border-zinc-800 bg-zinc-900 overflow-hidden">
        <div className="flex items-center justify-between p-4 border-b border-zinc-800">
          <span className="text-sm font-semibold text-zinc-300">Histórico</span>
          <Button size="sm" variant="ghost" onClick={newConversation} className="h-7 w-7 p-0">
            <Plus className="h-4 w-4" />
          </Button>
        </div>
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {conversations.length === 0 && (
            <p className="text-xs text-zinc-600 text-center py-4">Nenhuma conversa ainda</p>
          )}
          {conversations.map((conv) => {
            const firstUserMsg = conv.messages.find((m) => m.role === 'user');
            return (
              <div key={conv.id} className="group relative">
                <button
                  onClick={() => loadConversation(conv)}
                  className={cn(
                    'w-full text-left px-3 py-2.5 pr-8 rounded-lg text-xs transition-colors',
                    conversationId === conv.id
                      ? 'bg-blue-600/20 text-blue-300 border border-blue-600/30'
                      : 'text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200'
                  )}
                >
                  <p className="truncate font-medium">
                    {firstUserMsg?.content.slice(0, 40) ?? 'Conversa'}{firstUserMsg && firstUserMsg.content.length > 40 ? '…' : ''}
                  </p>
                  <p className="text-zinc-600 mt-0.5">
                    {new Date(conv.created_at).toLocaleDateString('pt-BR')}
                  </p>
                </button>
                <button
                  onClick={(e) => deleteConversation(conv.id, e)}
                  className="absolute right-1.5 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity h-5 w-5 flex items-center justify-center rounded text-zinc-600 hover:text-red-400 hover:bg-red-400/10"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            );
          })}
        </div>
        {conversations.length > 0 && (
          <div className="p-2 border-t border-zinc-800">
            <button
              onClick={clearAllHistory}
              className="w-full flex items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-xs text-zinc-500 hover:text-red-400 hover:bg-red-400/10 transition-colors"
            >
              <Trash2 className="h-3.5 w-3.5" />
              Limpar histórico
            </button>
          </div>
        )}
      </aside>

      {/* Main chat */}
      <div className="flex-1 flex flex-col rounded-xl border border-zinc-800 bg-zinc-900 overflow-hidden min-w-0">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800 shrink-0">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-600/15 border border-blue-600/30">
              <Bot className="h-5 w-5 text-blue-400" />
            </div>
            <div>
              <p className="font-semibold text-zinc-100 text-sm">
                {AGENT_CONFIGS[activeAgent].emoji} {AGENT_CONFIGS[activeAgent].label}
              </p>
              <p className="text-xs text-zinc-500">{AGENT_CONFIGS[activeAgent].description}</p>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <Button size="sm" variant="ghost" onClick={() => setShowHistory(true)} className="lg:hidden h-8 w-8 p-0">
              <History className="h-4 w-4" />
            </Button>
            <Button size="sm" variant="ghost" onClick={newConversation} className="gap-1.5 text-xs">
              <Plus className="h-3.5 w-3.5" />
              Nova
            </Button>
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {messages.length === 0 && (
            <div className="h-full flex flex-col items-center justify-center text-center px-4 py-8">
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-blue-600/10 border border-blue-600/20 mb-4">
                <Brain className="h-8 w-8 text-blue-400" />
              </div>
              <h3 className="font-semibold text-zinc-100 mb-2">Olá! Sou o Coach EDN</h3>
              <p className="text-sm text-zinc-400 max-w-sm mb-6">
                Coach especialista em treinamento natural baseado na metodologia EDN.
                Pergunte sobre treino, progressão, deload, nutrição ou qualquer dúvida sobre como treinar de verdade.
              </p>
              <blockquote className="text-sm text-zinc-500 italic border-l-2 border-blue-600/40 pl-3 text-left max-w-xs">
                &ldquo;Se o seu treino melhora, o seu físico melhora.&rdquo;
              </blockquote>
              <div className="grid grid-cols-2 gap-2 mt-6 w-full max-w-md">
                {QUICK_PROMPTS.map((qp) => (
                  <button
                    key={qp.label}
                    onClick={() => sendMessage(qp.prompt)}
                    className="flex items-center gap-2 text-left rounded-lg border border-zinc-800 bg-zinc-900/50 hover:bg-zinc-800 hover:border-zinc-700 px-3 py-2.5 transition-all text-xs text-zinc-300"
                  >
                    <span className="text-base shrink-0">{qp.icon}</span>
                    <span className="truncate">{qp.label}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((msg, i) => (
            <div
              key={i}
              className={cn(
                'flex gap-3',
                msg.role === 'user' ? 'justify-end' : 'justify-start'
              )}
            >
              {msg.role === 'assistant' && (
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-blue-600/15 border border-blue-600/30 mt-0.5">
                  <Bot className="h-3.5 w-3.5 text-blue-400" />
                </div>
              )}
              <div
                className={cn(
                  'max-w-[80%] rounded-xl px-4 py-3 text-sm leading-relaxed',
                  msg.role === 'user'
                    ? 'bg-blue-600 text-white rounded-br-sm'
                    : 'bg-zinc-800 text-zinc-100 rounded-bl-sm border border-zinc-700'
                )}
              >
                {msg.content ? (
                  msg.role === 'assistant'
                    ? <MarkdownText content={msg.content} />
                    : <span className="whitespace-pre-wrap">{msg.content}</span>
                ) : (
                  <div className="flex gap-1 items-center py-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-bounce" style={{ animationDelay: '0ms' }} />
                    <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-bounce" style={{ animationDelay: '150ms' }} />
                    <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-bounce" style={{ animationDelay: '300ms' }} />
                  </div>
                )}
              </div>
              {msg.role === 'user' && (
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-zinc-700 mt-0.5">
                  <span className="text-xs font-bold text-zinc-300">Eu</span>
                </div>
              )}
            </div>
          ))}
          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        <div className="p-4 border-t border-zinc-800 shrink-0">
          <div className="flex gap-2 items-end">
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Pergunte algo sobre treino, progressão, deload…"
              rows={1}
              disabled={isLoading}
              className="flex-1 resize-none rounded-lg border border-zinc-700 bg-zinc-800 px-4 py-3 text-sm text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent transition-colors max-h-32 overflow-y-auto disabled:opacity-50"
              style={{ minHeight: '44px' }}
            />
            <Button
              onClick={() => sendMessage(input)}
              disabled={!input.trim() || isLoading}
              className="h-11 w-11 p-0 shrink-0"
            >
              {isLoading ? (
                <RefreshCw className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
            </Button>
          </div>
        </div>
      </div>
      {/* Mobile History Drawer */}
      {showHistory && (
        <div className="lg:hidden fixed inset-0 z-50 flex">
          <div className="absolute inset-0 bg-black/60" onClick={() => setShowHistory(false)} />
          <div className="relative ml-auto w-72 max-w-[85vw] h-full bg-zinc-900 border-l border-zinc-800 flex flex-col">
            <div className="flex items-center justify-between p-4 border-b border-zinc-800">
              <span className="text-sm font-semibold text-zinc-300">Histórico</span>
              <button onClick={() => setShowHistory(false)} className="h-7 w-7 flex items-center justify-center rounded-lg text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800 transition-colors">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-2 space-y-1">
              {conversations.length === 0 && (
                <p className="text-xs text-zinc-600 text-center py-6">Nenhuma conversa ainda</p>
              )}
              {conversations.map((conv) => {
                const firstUserMsg = conv.messages.find((m) => m.role === 'user');
                return (
                  <div key={conv.id} className="group relative">
                    <button
                      onClick={() => { loadConversation(conv); setShowHistory(false); }}
                      className={cn('w-full text-left px-3 py-2.5 pr-8 rounded-lg text-xs transition-colors',
                        conversationId === conv.id
                          ? 'bg-blue-600/20 text-blue-300 border border-blue-600/30'
                          : 'text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200'
                      )}
                    >
                      <p className="truncate font-medium">
                        {firstUserMsg?.content.slice(0, 45) ?? 'Conversa'}{firstUserMsg && firstUserMsg.content.length > 45 ? '…' : ''}
                      </p>
                      <p className="text-zinc-600 mt-0.5">{new Date(conv.created_at).toLocaleDateString('pt-BR')}</p>
                    </button>
                    <button
                      onClick={(e) => { deleteConversation(conv.id, e); }}
                      className="absolute right-1.5 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity h-5 w-5 flex items-center justify-center rounded text-zinc-600 hover:text-red-400 hover:bg-red-400/10"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                );
              })}
            </div>
            {conversations.length > 0 && (
              <div className="p-2 border-t border-zinc-800">
                <button onClick={() => { clearAllHistory(); setShowHistory(false); }}
                  className="w-full flex items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-xs text-zinc-500 hover:text-red-400 hover:bg-red-400/10 transition-colors">
                  <Trash2 className="h-3.5 w-3.5" />Limpar histórico
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
