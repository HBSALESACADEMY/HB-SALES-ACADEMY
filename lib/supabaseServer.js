import { createClient } from "@supabase/supabase-js";

// Creates a Supabase client scoped to the calling user's JWT, so that
// Row Level Security policies apply exactly as if the request came
// from the browser. The token is read from the Authorization header
// that the frontend attaches to every /api/* call.
export function getUserSupabase(req) {
  const authHeader = req.headers.authorization || "";
  const token = authHeader.replace("Bearer ", "");
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  const client = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false },
  });

  return { client, token };
}

export async function requireUser(req, res) {
  const { client } = getUserSupabase(req);
  const {
    data: { user },
    error,
  } = await client.auth.getUser();
  if (error || !user) {
    res.status(401).json({ error: "Nicht authentifiziert." });
    return null;
  }
  return { client, user };
}
