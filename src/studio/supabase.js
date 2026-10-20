import { createClient } from '@supabase/supabase-js';
import { SUPABASE_KEY, SUPABASE_URL } from '../inquiry.js';

// Read before the client clears the hash: a password reset link lands here with type=recovery
export const isRecoveryReturn = /type=recovery/.test(window.location.hash);

// Signed-in requests carry Kidus's session; row-level security only lets studio owners through
export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: { persistSession: true, detectSessionInUrl: true },
});
