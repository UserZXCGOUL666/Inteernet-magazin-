import { createClient } from "@supabase/supabase-js";
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
export const demoMode =
  process.env.NEXT_PUBLIC_DEMO_MODE === "true" || !url || !key;
export const supabase = !demoMode && url && key ? createClient(url, key) : null;
