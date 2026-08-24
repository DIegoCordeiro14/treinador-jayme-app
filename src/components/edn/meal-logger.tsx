'use client';
import { useEffect, useState, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { toast } from 'sonner';
import { Camera, Mic, Plus, Search, Loader2, X, Trash2, CheckCircle2, UtensilsCrossed } from 'lucide-react';
import { calculateMeal, compareToTargets, type MealItemInput } from '@/lib/edn/nutrition-calculation-engine';
import { newId, insertOrQueue } from '@/lib/offline-queue';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Food = any;
interface Row { name: string; quantity: number; unit: string; preparation: string | null; confidence: number | null;
  serving_size: number; serving_unit: string; calories: number; protein: number; carbohydrates: number; fat: number; fiber: number | null; food_id?: string | null; }

const MEALS = [['cafe','Café'],['almoco','Almoço'],['lanche','Lanche'],['jantar','Jantar'],['ceia','Ceia'],['outro','Outro']] as const;
const confDot = (c: number | null) => c == null ? '' : c >= 0.8 ? '🟢' : c >= 0.55 ? '🟡' : '🔴';

/** Registro inteligente de refeição: foto / voz / texto / manual → confirmação → cálculo determinístico. */
export function MealLogger({ onLogged, controlledOpen, onClose }: { onLogged?: () => void; controlledOpen?: boolean; onClose?: () => void }) {
  const supabase = createClient();
  const [openInner, setOpenInner] = useState(false);
  const open = controlledOpen ?? openInner;
  const setOpen = (v: boolean) => { if (controlledOpen !== undefined) { if (!v) onClose?.(); } else { setOpenInner(v); } };
  const [busy, setBusy] = useState(false);
  const [meal, setMeal] = useState<string>('almoco');
  const [rows, setRows] = useState<Row[]>([]);
  const [notes, setNotes] = useState('');
  const [description, setDescription] = useState('');
  const [source, setSource] = useState<'manual'|'photo'|'voice'|'text'>('manual');
  const [photo, setPhoto] = useState<{ b64: string; type: string } | null>(null);
  const [search, setSearch] = useState('');
  const [results, setResults] = useState<Food[]>([]);
  const [textInput, setTextInput] = useState('');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [fit, setFit] = useState<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [templates, setTemplates] = useState<any[]>([]);
  const analyzeStart = { t: 0 };

  const loadTemplates = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data } = await supabase.from('user_meal_templates').select('meal, signature, items, times_used').eq('user_id', user.id).order('last_used', { ascending: false }).limit(4);
    setTemplates(data ?? []);
  }, [supabase]);
  useEffect(() => { if (open) loadTemplates(); }, [open, loadTemplates]);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function useTemplate(t: any) {
    setRows((t.items ?? []).map((f: any) => ({ name: f.name, quantity: f.quantity ?? 100, unit: f.unit ?? 'g', preparation: f.preparation ?? null, confidence: null, serving_size: f.serving_size ?? 100, serving_unit: f.serving_unit ?? 'g', calories: f.calories ?? 0, protein: f.protein ?? 0, carbohydrates: f.carbohydrates ?? 0, fat: f.fat ?? 0, fiber: f.fiber ?? null, food_id: f.food_id ?? null })));
    if (t.meal) setMeal(t.meal);
    toast('Refeição habitual carregada — ajuste se precisar.');
  }
  const reset = () => { setRows([]); setNotes(''); setPhoto(null); setSearch(''); setResults([]); setTextInput(''); setSource('manual'); setFit(null); setDescription(''); };

  // ── Busca na base ──
  const doSearch = useCallback(async (q: string) => {
    if (q.trim().length < 2) { setResults([]); return; }
    try { const r = await fetch(`/api/nutrition/foods?q=${encodeURIComponent(q)}`); const d = await r.json(); setResults(d.foods ?? []); } catch { /* */ }
  }, []);
  useEffect(() => { const t = setTimeout(() => doSearch(search), 300); return () => clearTimeout(t); }, [search, doSearch]);

  function addFood(f: Food, qty = 100) {
    setRows(r => [...r, { name: f.name, quantity: f.usual_quantity ?? qty, unit: f.serving_unit ?? 'g', preparation: f.usual_preparation ?? null, confidence: null,
      serving_size: f.serving_size ?? 100, serving_unit: f.serving_unit ?? 'g', calories: f.calories ?? 0, protein: f.protein ?? 0, carbohydrates: f.carbohydrates ?? 0, fat: f.fat ?? 0, fiber: f.fiber ?? null, food_id: f.id ?? null }]);
    setSearch(''); setResults([]);
  }

  // resolve um candidato (nome) para um alimento da base, aproximando
  async function resolveCandidate(name: string): Promise<Food | null> {
    try { const r = await fetch(`/api/nutrition/foods?q=${encodeURIComponent(name)}`); const d = await r.json(); return (d.foods ?? [])[0] ?? null; } catch { return null; }
  }

  async function analyze(payload: { image?: string; mediaType?: string; text?: string }, src: 'photo'|'voice'|'text') {
    setBusy(true); setSource(src); analyzeStart.t = Date.now();
    try {
      const r = await fetch('/api/nutrition/analyze-meal', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(payload) });
      const d = await r.json();
      if (!r.ok) { toast.error(d?.error ?? 'Não consegui analisar'); setBusy(false); return; }
      const newRows: Row[] = [];
      for (const it of (d.items ?? [])) {
        const f = await resolveCandidate(it.candidate_name);
        if (!f) { newRows.push({ name: it.candidate_name, quantity: it.estimated_quantity ?? 100, unit: it.unit ?? 'g', preparation: it.preparation ?? null, confidence: it.confidence, serving_size:100, serving_unit:'g', calories:0, protein:0, carbohydrates:0, fat:0, fiber:null }); continue; }
        newRows.push({ name: f.name, quantity: it.estimated_quantity ?? f.usual_quantity ?? 100, unit: it.unit ?? f.serving_unit ?? 'g', preparation: it.preparation ?? null, confidence: it.confidence,
          serving_size: f.serving_size ?? 100, serving_unit: f.serving_unit ?? 'g', calories: f.calories, protein: f.protein, carbohydrates: f.carbohydrates, fat: f.fat, fiber: f.fiber ?? null, food_id: f.id ?? null });
      }
      setRows(newRows); setNotes(d.notes ?? ''); setDescription(d.description ?? '');
      if (d.description) toast(`Identifiquei: ${d.description}`);
      else if (!newRows.length) toast.error('Não consegui identificar alimentos na foto. Tente uma foto mais nítida ou registre por texto.');
      const confs = newRows.map(r => r.confidence).filter((c): c is number => c != null);
      const { data: { user } } = await supabase.auth.getUser();
      if (user) supabase.from('nutrition_vision_events').insert({ user_id: user.id, kind: newRows.length ? 'photo_analysis_success' : 'photo_analysis_failure', source: src, items_detected: newRows.length, avg_confidence: confs.length ? confs.reduce((a,b)=>a+b,0)/confs.length : null, latency_ms: Date.now() - analyzeStart.t }).then(() => {}, () => {});
    } catch { toast.error('Erro ao analisar'); }
    setBusy(false);
  }

  // Converte QUALQUER foto (inclusive HEIC do iPhone) para JPEG reduzido — evita
  // formato não suportado pela IA e payload grande demais.
  async function fileToJpeg(file: File, maxDim = 1280, quality = 0.82): Promise<{ b64: string } | null> {
    try {
      const url = URL.createObjectURL(file);
      const img = await new Promise<HTMLImageElement>((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = rej; im.src = url; });
      const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
      const w = Math.max(1, Math.round(img.width * scale)), h = Math.max(1, Math.round(img.height * scale));
      const canvas = document.createElement('canvas'); canvas.width = w; canvas.height = h;
      const ctx = canvas.getContext('2d'); if (!ctx) { URL.revokeObjectURL(url); return null; }
      ctx.drawImage(img, 0, 0, w, h);
      URL.revokeObjectURL(url);
      const dataUrl = canvas.toDataURL('image/jpeg', quality);
      return { b64: dataUrl.split(',')[1] };
    } catch { return null; }
  }

  async function onPhoto(file: File) {
    setBusy(true); setSource('photo');
    const conv = await fileToJpeg(file);
    if (!conv) {
      // fallback: envia como está se a conversão falhar
      try {
        const b64 = await new Promise<string>((res, rej) => { const rd = new FileReader(); rd.onload = () => res(String(rd.result).split(',')[1]); rd.onerror = rej; rd.readAsDataURL(file); });
        setPhoto({ b64, type: file.type || 'image/jpeg' });
        analyze({ image: b64, mediaType: file.type || 'image/jpeg' }, 'photo');
      } catch { toast.error('Não consegui ler a imagem'); setBusy(false); }
      return;
    }
    setPhoto({ b64: conv.b64, type: 'image/jpeg' });
    analyze({ image: conv.b64, mediaType: 'image/jpeg' }, 'photo');
  }

  function onVoice() {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) { toast('Voz indisponível neste dispositivo — use texto.'); return; }
    const rec = new SR(); rec.lang = 'pt-BR'; rec.interimResults = false;
    rec.onresult = (e: any) => { const t = e.results[0][0].transcript; setTextInput(t); analyze({ text: t }, 'voice'); };
    rec.onerror = () => toast.error('Não consegui captar o áudio');
    rec.start(); toast('Fale sua refeição…');
  }

  async function save() {
    if (!rows.length) return;
    setBusy(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { toast.error('Sessão expirada'); setBusy(false); return; }

    // Cálculo DETERMINÍSTICO no cliente (mesmo motor da API) — permite offline-first.
    const inputs: MealItemInput[] = rows.map(r => ({
      food: { name: r.name, serving_size: r.serving_size, serving_unit: r.serving_unit, calories: r.calories, protein: r.protein, carbohydrates: r.carbohydrates, fat: r.fat, fiber: r.fiber },
      quantity: r.quantity, unit: r.unit, preparation: r.preparation, confidence: r.confidence,
    }));
    const calc = calculateMeal(inputs);

    // Foto (opcional) — só quando online; falha não impede o registro.
    let photoPath: string | null = null;
    if (photo?.b64) {
      try {
        const path = `${user.id}/${crypto.randomUUID()}.${photo.type.includes('png') ? 'png' : 'jpg'}`;
        const bytes = Uint8Array.from(atob(photo.b64), c => c.charCodeAt(0));
        const up = await supabase.storage.from('meal-photos').upload(path, bytes, { contentType: photo.type });
        if (!up.error) photoPath = path;
      } catch { /* foto opcional */ }
    }

    const nowIso = new Date().toISOString();
    const logDate = nowIso.slice(0, 10);
    const foodRows = calc.items.map((it, idx) => ({
      id: newId(), user_id: user.id, logged_at: nowIso, log_date: logDate, meal, food_id: rows[idx]?.food_id ?? null,
      name: it.name, quantity: it.quantity, unit: it.unit, preparation: it.preparation,
      calories_kcal: it.calories_kcal, protein_g: it.protein_g, carbs_g: it.carbs_g, fat_g: it.fat_g, fiber_g: it.fiber_g,
      source, confidence: it.confidence, photo_path: idx === 0 ? photoPath : null,
    }));
    // Persistência idêntica ao peso/plano (escrita client-side com fila offline).
    const res = await insertOrQueue(supabase, [{ table: 'food_logs', rows: foodRows }], 'Refeição');
    if (res === 'error') { toast.error('Erro ao salvar refeição'); setBusy(false); return; }
    supabase.from('nutrition_vision_events').insert({ user_id: user.id, kind: 'meal_logged', source, items_confirmed: foodRows.length, avg_confidence: calc.avgConfidence }).then(() => {}, () => {});

    // Aprendizado das quantidades habituais (best-effort, não bloqueia).
    for (const it of calc.items) {
      supabase.from('user_food_preferences').upsert({ user_id: user.id, food_name: it.name.toLowerCase(), usual_quantity: it.quantity, usual_unit: it.unit, usual_preparation: it.preparation, updated_at: nowIso }, { onConflict: 'user_id,food_name' }).then(() => {}, () => {});
    }
    // Refeição recorrente como template reutilizável (§25).
    supabase.from('user_meal_templates').upsert({ user_id: user.id, meal, signature: calc.items.map(i => i.name.toLowerCase()).sort().join('|'), items: foodRows.map(r => ({ name: r.name, quantity: r.quantity, unit: r.unit, food_id: r.food_id, serving_size: rows.find(x=>x.name===r.name)?.serving_size ?? 100, serving_unit: rows.find(x=>x.name===r.name)?.serving_unit ?? 'g', calories: rows.find(x=>x.name===r.name)?.calories ?? 0, protein: rows.find(x=>x.name===r.name)?.protein ?? 0, carbohydrates: rows.find(x=>x.name===r.name)?.carbohydrates ?? 0, fat: rows.find(x=>x.name===r.name)?.fat ?? 0, fiber: rows.find(x=>x.name===r.name)?.fiber ?? null })), last_used: nowIso }, { onConflict: 'user_id,signature' }).then(() => {}, () => {});

    // "Como isso se encaixa no seu dia" (§35) — consumido do dia vs meta.
    try {
      const { data: fl } = await supabase.from('food_logs').select('calories_kcal, protein_g, carbs_g, fat_g').eq('user_id', user.id).eq('log_date', logDate);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const all = (fl ?? []) as any[];
      const consumed = { kcal: all.reduce((a, r) => a + (r.calories_kcal ?? 0), 0) + (res === 'queued' ? calc.totals.calories_kcal : 0),
        protein: all.reduce((a, r) => a + (r.protein_g ?? 0), 0) + (res === 'queued' ? calc.totals.protein_g : 0),
        carbs: all.reduce((a, r) => a + (r.carbs_g ?? 0), 0) + (res === 'queued' ? calc.totals.carbs_g : 0),
        fat: all.reduce((a, r) => a + (r.fat_g ?? 0), 0) + (res === 'queued' ? calc.totals.fat_g : 0) };
      const ad = await fetch('/api/autopilot').then(r => r.json()).catch(() => null);
      const t = ad?.targets ?? ad?.nutrition ?? {};
      const cmp = compareToTargets(consumed, { kcal: t.targetKcal ?? t.target_calories ?? null, protein: t.proteinG ?? t.protein_g ?? null, carbs: t.carbsG ?? t.carbs_g ?? null, fat: t.fatG ?? t.fat_g ?? null });
      setFit({ totals: calc.totals, status: cmp.status, messages: cmp.messages });
    } catch { setFit({ totals: calc.totals, status: {}, messages: [] }); }

    toast.success(res === 'queued' ? 'Refeição salva offline — será enviada ao reconectar.' : `Refeição registrada — ${calc.totals.calories_kcal} kcal · ${calc.totals.protein_g}g P`);
    setBusy(false); onLogged?.();
  }

  if (!open) return controlledOpen !== undefined ? null : (
    <div className="grid grid-cols-3 gap-2">
      <button onClick={() => { reset(); setOpen(true); }} className="flex flex-col items-center gap-1 py-3 rounded-xl bg-[#D4853A] text-white text-xs font-semibold"><Camera className="h-4 w-4" />Foto</button>
      <button onClick={() => { reset(); setOpen(true); setTimeout(onVoice, 300); }} className="flex flex-col items-center gap-1 py-3 rounded-xl border border-zinc-700 text-zinc-200 text-xs font-semibold"><Mic className="h-4 w-4" />Voz</button>
      <button onClick={() => { reset(); setOpen(true); }} className="flex flex-col items-center gap-1 py-3 rounded-xl border border-zinc-700 text-zinc-200 text-xs font-semibold"><Plus className="h-4 w-4" />Manual</button>
    </div>
  );

  return (
    <div className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center bg-black/70 p-2">
      <div className="w-full max-w-md rounded-2xl bg-zinc-900 border border-zinc-800 p-4 space-y-3 max-h-[92vh] overflow-y-auto">
        <div className="flex items-center justify-between">
          <h2 className="font-bold text-zinc-100 flex items-center gap-1.5"><UtensilsCrossed className="h-4 w-4 text-[#D4853A]" />Registrar refeição</h2>
          <button onClick={() => { setOpen(false); reset(); }}><X className="h-5 w-5 text-zinc-400" /></button>
        </div>

        <div className="flex flex-wrap gap-1.5">
          {MEALS.map(([k,l]) => <button key={k} onClick={() => setMeal(k)} className={`text-[11px] font-semibold px-2 py-1 rounded-full border ${meal===k?'border-[#D4853A] bg-[#D4853A]/10 text-[#E09B5A]':'border-zinc-700 text-zinc-400'}`}>{l}</button>)}
        </div>
        {!fit && templates.length > 0 && rows.length === 0 && (
          <div className="space-y-1">
            <p className="text-[10px] text-zinc-500">Refeições habituais</p>
            <div className="flex flex-wrap gap-1.5">
              {templates.map((t, i) => <button key={i} onClick={() => useTemplate(t)} className="text-[11px] px-2 py-1 rounded-full border border-zinc-700 text-zinc-300">↺ {(t.items ?? []).slice(0,3).map((x:any)=>x.name).join(', ')}</button>)}
            </div>
          </div>
        )}

        {/* entradas */}
        <div className="grid grid-cols-3 gap-2">
          <label className="flex flex-col items-center gap-1 py-2 rounded-lg bg-zinc-800 text-zinc-200 text-[11px] font-semibold cursor-pointer">
            {busy && source==='photo' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}Foto
            <input type="file" accept="image/*" capture="environment" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) onPhoto(f); }} />
          </label>
          <button onClick={onVoice} className="flex flex-col items-center gap-1 py-2 rounded-lg bg-zinc-800 text-zinc-200 text-[11px] font-semibold"><Mic className="h-4 w-4" />Voz</button>
          <button onClick={() => analyze({ text: textInput }, 'text')} disabled={!textInput.trim()||busy} className="flex flex-col items-center gap-1 py-2 rounded-lg bg-zinc-800 text-zinc-200 text-[11px] font-semibold disabled:opacity-50">{busy&&source==='text'?<Loader2 className="h-4 w-4 animate-spin" />:<Search className="h-4 w-4" />}Texto</button>
        </div>
        <input value={textInput} onChange={e=>setTextInput(e.target.value)} placeholder='ex.: 150g arroz, 180g frango, 100g feijão' className="w-full bg-zinc-800 rounded-lg p-2 text-sm text-zinc-100" />

        {/* busca manual */}
        <div className="relative">
          <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Buscar alimento na base…" className="w-full bg-zinc-800 rounded-lg p-2 text-sm text-zinc-100" />
          {results.length > 0 && (
            <div className="absolute z-10 mt-1 w-full bg-zinc-800 border border-zinc-700 rounded-lg max-h-48 overflow-y-auto">
              {results.map((f, i) => <button key={i} onClick={() => addFood(f)} className="w-full text-left px-3 py-2 text-sm text-zinc-200 hover:bg-zinc-700 flex justify-between"><span>{f.name}{f.brand?` · ${f.brand}`:''}</span><span className="text-[10px] text-zinc-500">{f.calories}kcal/100{f.serving_unit}</span></button>)}
            </div>
          )}
        </div>

        {!fit && description && <p className="text-[12px] text-zinc-200">🍽️ <span className="font-semibold">{description}</span></p>}
        {!fit && notes && <p className="text-[11px] text-amber-300/90">⚠ {notes}</p>}

        {/* Como isso se encaixa no seu dia (§35) */}
        {fit ? (
          <div className="space-y-2">
            <div className="rounded-lg bg-emerald-500/5 border border-emerald-500/20 p-3 text-center">
              <p className="text-sm font-bold text-emerald-300">✅ Refeição registrada</p>
              <p className="text-[12px] text-zinc-300 mt-0.5">{fit.totals.calories_kcal} kcal · {fit.totals.protein_g}g P · {fit.totals.carbs_g}g C · {fit.totals.fat_g}g G</p>
            </div>
            <p className="text-[11px] font-bold text-zinc-300">Como isso se encaixa no seu dia</p>
            {([['calories','Calorias'],['protein','Proteína'],['carbs','Carboidrato'],['fat','Gordura']] as const).map(([k,l]) => {
              const st = fit.status?.[k];
              const icon = st==='ok'?'✅':st==='below'?'⚠️ abaixo':st==='above'?'⚠️ acima':'—';
              return <div key={k} className="flex justify-between text-[12px]"><span className="text-zinc-400">{l}</span><span className={st==='ok'?'text-emerald-300':st==='na'?'text-zinc-500':'text-amber-300'}>{icon}</span></div>;
            })}
            {fit.messages?.length > 0 && <p className="text-[11px] text-amber-300/90 mt-1">{fit.messages.join(' ')}</p>}
            <button onClick={() => { setOpen(false); reset(); }} className="w-full py-2.5 rounded-xl bg-[#D4853A] text-white font-semibold">Concluir</button>
          </div>
        ) : null}

        {/* itens confirmáveis */}
        {!fit && rows.length > 0 && (
          <div className="space-y-2">
            <p className="text-[11px] font-bold text-zinc-300">Refeição identificada — revise e confirme</p>
            {rows.map((r, i) => (
              <div key={i} className="flex items-center gap-2 rounded-lg bg-black/30 border border-white/[0.06] p-2">
                <div className="flex-1 min-w-0">
                  <p className="text-[12px] text-zinc-100 truncate">{confDot(r.confidence)} {r.name}</p>
                  <div className="flex items-center gap-1 mt-1">
                    <input type="number" value={r.quantity} onChange={e=>setRows(x=>x.map((y,j)=>j===i?{...y,quantity:Number(e.target.value)}:y))} className="w-16 bg-zinc-800 rounded p-1 text-xs text-zinc-100" />
                    <select value={r.unit} onChange={e=>setRows(x=>x.map((y,j)=>j===i?{...y,unit:e.target.value}:y))} className="bg-zinc-800 rounded p-1 text-xs text-zinc-100">
                      {['g','ml','un','colher_sopa','colher_cha','xicara','copo','fatia','concha','file'].map(u=><option key={u} value={u}>{u}</option>)}
                    </select>
                    {r.calories === 0 && <span className="text-[10px] text-red-300">sem base — busque acima</span>}
                  </div>
                </div>
                <button onClick={()=>setRows(x=>x.filter((_,j)=>j!==i))} className="text-zinc-500 hover:text-red-400"><Trash2 className="h-4 w-4" /></button>
              </div>
            ))}
            <button onClick={save} disabled={busy || rows.some(r=>r.calories===0)} className="w-full py-2.5 rounded-xl bg-[#D4853A] text-white font-semibold flex items-center justify-center gap-1.5 disabled:opacity-50">{busy?<Loader2 className="h-4 w-4 animate-spin" />:<CheckCircle2 className="h-4 w-4" />}Confirmar refeição</button>
          </div>
        )}
      </div>
    </div>
  );
}
