'use client';
import { useEffect, useState, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { toast } from 'sonner';
import { Camera, Mic, Plus, Search, Loader2, X, Trash2, CheckCircle2, UtensilsCrossed } from 'lucide-react';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Food = any;
interface Row { name: string; quantity: number; unit: string; preparation: string | null; confidence: number | null;
  serving_size: number; serving_unit: string; calories: number; protein: number; carbohydrates: number; fat: number; fiber: number | null; food_id?: string | null; }

const MEALS = [['cafe','Café'],['almoco','Almoço'],['lanche','Lanche'],['jantar','Jantar'],['ceia','Ceia'],['outro','Outro']] as const;
const confDot = (c: number | null) => c == null ? '' : c >= 0.8 ? '🟢' : c >= 0.55 ? '🟡' : '🔴';

/** Registro inteligente de refeição: foto / voz / texto / manual → confirmação → cálculo determinístico. */
export function MealLogger({ onLogged }: { onLogged?: () => void }) {
  const supabase = createClient();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [meal, setMeal] = useState<string>('almoco');
  const [rows, setRows] = useState<Row[]>([]);
  const [notes, setNotes] = useState('');
  const [source, setSource] = useState<'manual'|'photo'|'voice'|'text'>('manual');
  const [photo, setPhoto] = useState<{ b64: string; type: string } | null>(null);
  const [search, setSearch] = useState('');
  const [results, setResults] = useState<Food[]>([]);
  const [textInput, setTextInput] = useState('');

  const reset = () => { setRows([]); setNotes(''); setPhoto(null); setSearch(''); setResults([]); setTextInput(''); setSource('manual'); };

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
    setBusy(true); setSource(src);
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
      setRows(newRows); setNotes(d.notes ?? '');
      if (d.notes) toast(d.notes);
    } catch { toast.error('Erro ao analisar'); }
    setBusy(false);
  }

  async function onPhoto(file: File) {
    const b64 = await new Promise<string>((res, rej) => { const rd = new FileReader(); rd.onload = () => res(String(rd.result).split(',')[1]); rd.onerror = rej; rd.readAsDataURL(file); });
    setPhoto({ b64, type: file.type });
    analyze({ image: b64, mediaType: file.type }, 'photo');
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
    const items = rows.map(r => ({ name: r.name, quantity: r.quantity, unit: r.unit, preparation: r.preparation, confidence: r.confidence,
      serving_size: r.serving_size, serving_unit: r.serving_unit, calories: r.calories, protein: r.protein, carbohydrates: r.carbohydrates, fat: r.fat, fiber: r.fiber, food_id: r.food_id }));
    const r = await fetch('/api/nutrition/log-meal', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ meal, source, items, photoBase64: photo?.b64, photoType: photo?.type }) });
    const d = await r.json();
    if (!r.ok) { toast.error(d?.error ?? 'Erro ao salvar'); setBusy(false); return; }
    toast.success(`Refeição registrada — ${d.totals.calories_kcal} kcal · ${d.totals.protein_g}g P`);
    setBusy(false); setOpen(false); reset(); onLogged?.();
  }

  if (!open) return (
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

        {notes && <p className="text-[11px] text-amber-300/90">⚠ {notes}</p>}

        {/* itens confirmáveis */}
        {rows.length > 0 && (
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
