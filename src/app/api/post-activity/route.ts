import { createClient } from '@/lib/supabase/server';
import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const { type, data, team_id } = body;

  if (!type || !data) return NextResponse.json({ error: 'Missing type or data' }, { status: 400 });

  const { error } = await supabase.from('activity_feed').insert({
    user_id: user.id,
    type,
    data,
    team_id: team_id ?? null,
  });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
