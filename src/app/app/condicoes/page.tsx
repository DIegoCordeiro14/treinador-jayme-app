'use client';
import { useEffect, useState, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { toast } from 'sonner';
import { ShieldCheck, Plus, Upload, Trash2, Loader2, AlertTriangle, CheckCircle2, FileText, X } from 'lucide-react';
import { REGION_LABEL, SIDE_LABEL, STATUS_LABEL, type BodyRegion, type Side, type ConditionStatus, type ConditionType } from '@/lib/edn/condition-mapping';

interface Condition {
  id: string; body_region: BodyRegion; side: Side; status: ConditionStatus; condition_type: ConditionType;
  title: string | null; description: string | null; restricted_movements: string[] | null; allowed_movements: string[] | null;
  source: string; user_confirmed: boolean; professional_validated: boolean;
}

const REGIONS: BodyRegion[] = ['shoulder','elbow','wrist','spine','hip','knee','ankle','foot','other'];
const SIDES: Side[] = ['right','left','bilateral','na'];
const STATUSES: ConditionStatus[] = ['recovering','rehab','partial','cleared','unknown'];
const TYPES: { k: ConditionType; l: string }[] = [
  { k:'injury', l:'Lesão' },{ k:'surgery', l:'Cirurgia' },{ k:'fracture', l:'Fratura' },
  { k:'pain', l:'Dor/limitação' },{ k:'orthopedic', l:'Ortopédica' },{ k:'other', l:'Outra' },
];

export default function ConditionsPage() {
  const supabase = createClient();
  const [items, setItems] = useState<Condition[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [saving, setSaving] = useState(false);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [extracted, setExtracted] = useState<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [docFile, setDocFile] = useState<any>(null);
  const [form, setForm] = useState({ condition_type:'injury' as ConditionType, body_region:'knee' as BodyRegion, side:'na' as Side, status:'unknown' as ConditionStatus, title:'', restricted:'', allowed:'', notes:'' });

  const load = useCallback(async () => {
    const r = await fetch('/api/physical-conditions'); const d = await r.json();
    if (Array.isArray(d?.conditions)) setItems(d.conditions);
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  async function analyzeDoc(file: File) {
    setAnalyzing(true); setExtracted(null);
    try {
      const b64 = await new Promise<string>((res, rej) => { const rd = new FileReader(); rd.onload = () => res(String(rd.result).split(',')[1]); rd.onerror = rej; rd.readAsDataURL(file); });
      const r = await fetch('/api/physical-condition/analyze-document', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ image: b64, mediaType: file.type }) });
      const d = await r.json();
      if (!r.ok) { toast.error(d?.error ?? 'Falha ao analisar'); setAnalyzing(false); return; }
      const e = d.extracted;
      setExtracted(e);
      setDocFile({ base64: b64, fileType: file.type, fileName: file.name, documentType: e.documentType, summary: e.summary, confidence: e.confidence, extractedText: d.raw_text });
      setForm(f => ({ ...f, body_region: e.bodyRegion ?? f.body_region, side: e.side ?? f.side, title: e.procedureOrCondition ?? f.title, restricted: (e.restrictedMovements ?? []).join(', '), allowed: (e.allowedMovements ?? []).join(', '), notes: e.summary ?? f.notes, status: 'unknown' }));
      setShowForm(true);
      toast('Documento interpretado — revise e confirme.');
    } catch { toast.error('Erro ao ler o arquivo'); }
    setAnalyzing(false);
  }

  async function save() {
    setSaving(true);
    const body = {
      condition_type: form.condition_type, body_region: form.body_region, side: form.side, status: form.status,
      title: form.title || null, medical_notes: form.notes || null,
      restricted_movements: form.restricted ? form.restricted.split(',').map(s=>s.trim()).filter(Boolean) : null,
      allowed_movements: form.allowed ? form.allowed.split(',').map(s=>s.trim()).filter(Boolean) : null,
      source: extracted ? 'document' : 'manual', user_confirmed: true,
      ...(docFile ? { document: docFile } : {}),
    };
    const r = await fetch('/api/physical-conditions', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body) });
    if (!r.ok) { const d = await r.json().catch(()=>({})); toast.error(d?.error ?? 'Erro ao salvar'); setSaving(false); return; }
    toast.success('Condição salva — o treino passará a respeitá-la.');
    setShowForm(false); setExtracted(null); setDocFile(null); setSaving(false);
    setForm({ condition_type:'injury', body_region:'knee', side:'na', status:'unknown', title:'', restricted:'', allowed:'', notes:'' });
    load();
  }

  async function remove(id: string) {
    if (!confirm('Remover esta condição? Documentos associados também serão apagados.')) return;
    const r = await fetch(`/api/physical-conditions?id=${id}`, { method:'DELETE' });
    if (r.ok) { toast.success('Condição removida'); load(); } else toast.error('Erro ao remover');
  }

  const badge = (c: Condition) => c.professional_validated
    ? { t:'Validado por profissional', c:'text-sky-300 bg-sky-500/10' }
    : c.user_confirmed ? { t:'Confirmado', c:'text-emerald-300 bg-emerald-500/10' }
    : { t:'Aguardando confirmação', c:'text-amber-300 bg-amber-500/10' };

  return (
    <div className="p-4 max-w-lg mx-auto space-y-4">
      <div className="flex items-center gap-2">
        <ShieldCheck className="h-5 w-5 text-[#D4853A]" />
        <h1 className="text-lg font-bold text-zinc-100">Condições e Restrições Físicas</h1>
      </div>
      <p className="text-[12px] text-zinc-500 -mt-2">Informe lesões, cirurgias, fraturas e limitações. O gerador de treino respeita automaticamente. <strong>Não é diagnóstico médico.</strong></p>

      <div className="flex gap-2">
        <button onClick={() => { setExtracted(null); setShowForm(true); }} className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-[#D4853A] text-white text-sm font-semibold"><Plus className="h-4 w-4" />Adicionar condição</button>
        <label className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl border border-zinc-700 text-zinc-200 text-sm font-semibold cursor-pointer">
          {analyzing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}Enviar documento
          <input type="file" accept="image/*,application/pdf" className="hidden" disabled={analyzing} onChange={e => { const f = e.target.files?.[0]; if (f) analyzeDoc(f); }} />
        </label>
      </div>

      {loading ? <p className="text-sm text-zinc-500">Carregando…</p> : items.length === 0 ? (
        <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-6 text-center text-sm text-zinc-500">Nenhuma condição cadastrada. Você está sem restrições ativas.</div>
      ) : (
        <div className="space-y-2">
          {items.map(c => { const b = badge(c); return (
            <div key={c.id} className="rounded-xl border border-zinc-800 bg-zinc-900 p-3">
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-zinc-100">{REGION_LABEL[c.body_region]}{c.side && c.side!=='na' ? ` (${SIDE_LABEL[c.side]})` : ''}</span>
                <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded text-orange-300 bg-orange-500/10">{STATUS_LABEL[c.status]}</span>
                <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${b.c}`}>{b.t}</span>
                <button onClick={() => remove(c.id)} className="ml-auto text-zinc-500 hover:text-red-400"><Trash2 className="h-4 w-4" /></button>
              </div>
              {c.title && <p className="text-xs text-zinc-400 mt-1">{c.title}</p>}
              {(c.restricted_movements?.length ?? 0) > 0 && <p className="text-[11px] text-red-300/80 mt-1">Evitar: {c.restricted_movements!.join(', ')}</p>}
              {c.source==='document' && <p className="text-[10px] text-sky-300/70 mt-1 flex items-center gap-1"><FileText className="h-3 w-3" />Extraído de documento</p>}
            </div>
          ); })}
        </div>
      )}

      {showForm && (
        <div className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center bg-black/70 p-3">
          <div className="w-full max-w-md rounded-2xl bg-zinc-900 border border-zinc-800 p-4 space-y-3 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <h2 className="font-bold text-zinc-100">{extracted ? 'Revisar e confirmar' : 'Nova condição'}</h2>
              <button onClick={() => { setShowForm(false); setExtracted(null); }}><X className="h-5 w-5 text-zinc-400" /></button>
            </div>
            {extracted && (
              <div className="rounded-lg border border-sky-500/20 bg-sky-500/5 p-2.5 text-[11px] text-zinc-300 space-y-1">
                <p className="flex items-center gap-1 text-sky-300 font-semibold"><FileText className="h-3.5 w-3.5" />Informações encontradas no documento</p>
                {extracted.summary && <p>{extracted.summary}</p>}
                {(extracted.undetermined?.length ?? 0) > 0 && <p className="text-amber-300/90 flex items-start gap-1"><AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />Não determinado: {extracted.undetermined.join('; ')}</p>}
                {extracted.requiresProfessionalReview && <p className="text-amber-300/90">⚠️ Recomenda-se avaliação profissional para confirmar restrições.</p>}
                <p className="text-zinc-500">Confirme abaixo. Nada é salvo como restrição sem sua confirmação.</p>
              </div>
            )}
            <div className="grid grid-cols-2 gap-2 text-sm">
              <label className="col-span-2 text-[11px] text-zinc-500">Tipo
                <select value={form.condition_type} onChange={e=>setForm(f=>({...f,condition_type:e.target.value as ConditionType}))} className="w-full mt-1 bg-zinc-800 rounded-lg p-2 text-zinc-100">{TYPES.map(t=><option key={t.k} value={t.k}>{t.l}</option>)}</select>
              </label>
              <label className="text-[11px] text-zinc-500">Região
                <select value={form.body_region} onChange={e=>setForm(f=>({...f,body_region:e.target.value as BodyRegion}))} className="w-full mt-1 bg-zinc-800 rounded-lg p-2 text-zinc-100">{REGIONS.map(r=><option key={r} value={r}>{REGION_LABEL[r]}</option>)}</select>
              </label>
              <label className="text-[11px] text-zinc-500">Lado
                <select value={form.side} onChange={e=>setForm(f=>({...f,side:e.target.value as Side}))} className="w-full mt-1 bg-zinc-800 rounded-lg p-2 text-zinc-100">{SIDES.map(s=><option key={s} value={s}>{SIDE_LABEL[s]||'N/A'}</option>)}</select>
              </label>
              <label className="col-span-2 text-[11px] text-zinc-500">Status
                <select value={form.status} onChange={e=>setForm(f=>({...f,status:e.target.value as ConditionStatus}))} className="w-full mt-1 bg-zinc-800 rounded-lg p-2 text-zinc-100">{STATUSES.map(s=><option key={s} value={s}>{STATUS_LABEL[s]}</option>)}</select>
              </label>
              <label className="col-span-2 text-[11px] text-zinc-500">Descrição
                <input value={form.title} onChange={e=>setForm(f=>({...f,title:e.target.value}))} className="w-full mt-1 bg-zinc-800 rounded-lg p-2 text-zinc-100" placeholder="ex.: reconstrução do LCA" />
              </label>
              <label className="col-span-2 text-[11px] text-zinc-500">Movimentos a evitar (separados por vírgula)
                <input value={form.restricted} onChange={e=>setForm(f=>({...f,restricted:e.target.value}))} className="w-full mt-1 bg-zinc-800 rounded-lg p-2 text-zinc-100" placeholder="ex.: agachamento livre, afundo" />
              </label>
              <label className="col-span-2 text-[11px] text-zinc-500">Movimentos permitidos
                <input value={form.allowed} onChange={e=>setForm(f=>({...f,allowed:e.target.value}))} className="w-full mt-1 bg-zinc-800 rounded-lg p-2 text-zinc-100" placeholder="ex.: leg press leve" />
              </label>
            </div>
            <button onClick={save} disabled={saving} className="w-full py-2.5 rounded-xl bg-[#D4853A] text-white font-semibold flex items-center justify-center gap-1.5 disabled:opacity-50">{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}Confirmar informações</button>
          </div>
        </div>
      )}
    </div>
  );
}
