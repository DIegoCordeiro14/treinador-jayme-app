import { NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';

/** GET — lista condições ativas do usuário. */
export async function GET() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  const { data, error } = await supabase.from('physical_conditions')
    .select('*').eq('user_id', user.id).eq('active', true).order('created_at', { ascending: false });
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ conditions: data ?? [] });
}

/** POST — cria uma condição (exige confirmação do usuário no fluxo, aqui grava). */
export async function POST(req: NextRequest) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  const b = await req.json();
  const row = {
    user_id: user.id,
    condition_type: b.condition_type ?? 'other',
    body_region: b.body_region ?? 'other',
    side: b.side ?? 'na',
    title: b.title ?? null,
    description: b.description ?? null,
    occurred_at: b.occurred_at || null,
    surgery_date: b.surgery_date || null,
    status: b.status ?? 'unknown',
    medical_notes: b.medical_notes ?? null,
    allowed_movements: b.allowed_movements ?? null,
    restricted_movements: b.restricted_movements ?? null,
    training_restrictions: b.training_restrictions ?? null,
    source: b.source ?? 'manual',
    source_document_id: b.source_document_id ?? null,
    user_confirmed: b.user_confirmed ?? true,
    professional_validated: b.professional_validated ?? false,
    reviewed_at: new Date().toISOString(),
  };
  const { data, error } = await supabase.from('physical_conditions').insert(row).select('*').single();
  if (error) return Response.json({ error: error.message }, { status: 500 });

  // Arquiva o documento enviado (opcional) no bucket privado + registro
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const doc = (b as any).document;
  if (doc?.base64 && data?.id) {
    try {
      const ext = (doc.fileName?.split('.').pop() || (doc.fileType?.includes('pdf') ? 'pdf' : 'bin')).toLowerCase();
      const path = `${user.id}/${data.id}/${crypto.randomUUID()}.${ext}`;
      const bytes = Buffer.from(doc.base64, 'base64');
      const up = await supabase.storage.from('medical-docs').upload(path, bytes, { contentType: doc.fileType || 'application/octet-stream', upsert: false });
      if (!up.error) {
        const { data: docRow } = await supabase.from('physical_condition_documents').insert({
          user_id: user.id, condition_id: data.id, file_path: path, file_type: doc.fileType ?? null, file_name: doc.fileName ?? null,
          document_type: doc.documentType ?? null, ai_extracted_text: doc.extractedText ?? null, ai_summary: doc.summary ?? null,
          ai_confidence: typeof doc.confidence === 'number' ? doc.confidence : null, user_confirmed: true,
        }).select('id').single();
        if (docRow?.id) await supabase.from('physical_conditions').update({ source_document_id: docRow.id }).eq('id', data.id);
      }
    } catch { /* upload best-effort */ }
  }
  return Response.json({ condition: data });
}

/** PATCH — atualiza uma condição do usuário. */
export async function PATCH(req: NextRequest) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  const b = await req.json();
  if (!b.id) return Response.json({ error: 'id obrigatório' }, { status: 400 });
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  for (const k of ['condition_type','body_region','side','title','description','occurred_at','surgery_date','status','medical_notes','allowed_movements','restricted_movements','training_restrictions','user_confirmed','professional_validated','active','reviewed_at']) {
    if (k in b) patch[k] = b[k];
  }
  const { data, error } = await supabase.from('physical_conditions').update(patch).eq('id', b.id).eq('user_id', user.id).select('*').single();
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ condition: data });
}

/** DELETE — remove a condição e seus documentos (?id=). */
export async function DELETE(req: NextRequest) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  const id = req.nextUrl.searchParams.get('id');
  if (!id) return Response.json({ error: 'id obrigatório' }, { status: 400 });
  // remove documentos do storage
  const { data: docs } = await supabase.from('physical_condition_documents').select('file_path').eq('user_id', user.id).eq('condition_id', id);
  const paths = (docs ?? []).map((d: { file_path: string | null }) => d.file_path).filter(Boolean) as string[];
  if (paths.length) { try { await supabase.storage.from('medical-docs').remove(paths); } catch { /* */ } }
  const { error } = await supabase.from('physical_conditions').delete().eq('id', id).eq('user_id', user.id);
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ ok: true });
}
