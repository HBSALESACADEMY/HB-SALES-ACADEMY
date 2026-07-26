import { createClient } from "@supabase/supabase-js";

// Service-role client — bypasses Row Level Security entirely.
// NEVER import this in browser code. Only used inside pages/api/admin/*
// routes, and only after the caller has been verified as a manager.
export function getAdminSupabase() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY ist nicht gesetzt.");
  }
  return createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
