'use client';
/**
 * AvatarUploader — inserir, alterar e remover a foto de perfil.
 * Sobe a imagem para o bucket `avatars` (pasta <uid>/) no Supabase Storage,
 * grava a URL pública em profiles.avatar_url e atualiza a UI em tempo real.
 */

import { useRef, useState } from 'react';
import { Camera, Trash2, Loader2 } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { createClient } from '@/lib/supabase/client';
import { getInitials } from '@/lib/utils';
import { toast } from 'sonner';

interface AvatarUploaderProps {
  initialUrl?: string | null;
  name: string;
  onChange?: (url: string | null) => void;
}

const MAX_BYTES = 5 * 1024 * 1024; // 5MB
const ALLOWED = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

export function AvatarUploader({ initialUrl, name, onChange }: AvatarUploaderProps) {
  const supabase = createClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [url, setUrl] = useState<string | null>(initialUrl ?? null);
  const [busy, setBusy] = useState(false);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ''; // permite re-selecionar o mesmo arquivo
    if (!file) return;

    if (!ALLOWED.includes(file.type)) {
      toast.error('Formato inválido. Use JPG, PNG, WEBP ou GIF.');
      return;
    }
    if (file.size > MAX_BYTES) {
      toast.error('Imagem muito grande (máx. 5MB).');
      return;
    }

    setBusy(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { toast.error('Sessão expirada. Faça login novamente.'); return; }

      const ext = (file.name.split('.').pop() || 'jpg').toLowerCase();
      const path = `${user.id}/avatar.${ext}`;

      const { error: upErr } = await supabase.storage
        .from('avatars')
        .upload(path, file, { upsert: true, contentType: file.type, cacheControl: '3600' });
      if (upErr) { toast.error('Falha no upload da imagem.'); return; }

      const { data: pub } = supabase.storage.from('avatars').getPublicUrl(path);
      const publicUrl = `${pub.publicUrl}?v=${Date.now()}`; // cache-bust

      const { error: dbErr } = await supabase.from('profiles').update({ avatar_url: publicUrl }).eq('id', user.id);
      if (dbErr) { toast.error('Imagem enviada, mas não foi possível salvar no perfil.'); return; }

      setUrl(publicUrl);
      onChange?.(publicUrl);
      toast.success('Foto de perfil atualizada!');
    } finally {
      setBusy(false);
    }
  }

  async function handleRemove() {
    setBusy(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { toast.error('Sessão expirada.'); return; }

      // remove qualquer arquivo de avatar do usuário
      const { data: list } = await supabase.storage.from('avatars').list(user.id);
      if (list && list.length > 0) {
        await supabase.storage.from('avatars').remove(list.map((f) => `${user.id}/${f.name}`));
      }
      const { error: dbErr } = await supabase.from('profiles').update({ avatar_url: null }).eq('id', user.id);
      if (dbErr) { toast.error('Não foi possível remover a foto.'); return; }

      setUrl(null);
      onChange?.(null);
      toast.success('Foto removida.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="relative">
        <Avatar className="h-20 w-20">
          <AvatarImage src={url ?? undefined} />
          <AvatarFallback className="bg-zinc-700 text-zinc-200 text-xl font-bold">
            {getInitials(name || 'Atleta')}
          </AvatarFallback>
        </Avatar>

        {/* Botão de câmera (inserir / alterar) */}
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={busy}
          aria-label={url ? 'Alterar foto' : 'Inserir foto'}
          className="absolute -bottom-1 -right-1 flex h-8 w-8 items-center justify-center rounded-full bg-[#D4853A] text-white shadow-lg ring-2 ring-zinc-900 hover:bg-[#B8702E] transition-colors disabled:opacity-60"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
        </button>

        <input
          ref={fileRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif"
          onChange={handleFile}
          className="hidden"
        />
      </div>

      {url && (
        <button
          type="button"
          onClick={handleRemove}
          disabled={busy}
          className="inline-flex items-center gap-1 text-[11px] text-zinc-500 hover:text-red-400 transition-colors disabled:opacity-60"
        >
          <Trash2 className="h-3 w-3" /> Remover foto
        </button>
      )}
    </div>
  );
}
