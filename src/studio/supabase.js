import { createClient } from '@supabase/supabase-js';
import { SUPABASE_KEY, SUPABASE_URL } from '../inquiry.js';

// Signed-in requests carry Kidus's session; row-level security only lets studio owners through
export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: { persistSession: true, detectSessionInUrl: true },
});
