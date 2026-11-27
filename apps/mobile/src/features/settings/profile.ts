import { getSupabase } from '@/lib/supabase';
import { sessionPhone } from '@/lib/session';

export interface MyProfile {
  name: string | null;
  phone: string | null;
  examYear: number | null;
  stream: 'bio' | 'maths' | null;
}

/** The signed-in student's own profile card (RLS: a student reads only their own row). */
export async function loadMyProfile(): Promise<MyProfile> {
  const phone = await sessionPhone();
  const empty: MyProfile = { name: null, phone, examYear: null, stream: null };
  const supabase = getSupabase();
  if (!supabase) return empty;
  try {
    const { data: session } = await supabase.auth.getSession();
    const userId = session.session?.user.id;
    if (!userId) return empty;
    const { data, error } = await supabase
      .from('profiles')
      .select('display_name, exam_year, stream')
      .eq('id', userId)
      .maybeSingle();
    if (error || !data) return empty;
    const row = data as { display_name?: unknown; exam_year?: unknown; stream?: unknown };
    return {
      name: typeof row.display_name === 'string' ? row.display_name : null,
      phone,
      examYear: typeof row.exam_year === 'number' ? row.exam_year : null,
      stream: row.stream === 'bio' || row.stream === 'maths' ? row.stream : null,
    };
  } catch {
    return empty;
  }
}
