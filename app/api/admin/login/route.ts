import { createClient } from "@supabase/supabase-js";
import {
  handleAdminLogin,
  type AuthenticationResult,
} from "@/lib/server/admin-login";
import { DEFAULT_DEMO_PASSWORD_HASH } from "@/lib/server/admin-password";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const demo = process.env.NEXT_PUBLIC_DEMO_MODE === "true" || !url || !key;
  return handleAdminLogin(
    request,
    {
      demo,
      passwordHash:
        process.env.ADMIN_DEMO_PASSWORD_HASH || DEFAULT_DEMO_PASSWORD_HASH,
    },
    async (password): Promise<AuthenticationResult> => {
      const email = process.env.ADMIN_EMAIL;
      if (!url || !key || !email) return { kind: "unavailable" };
      // Separate per-request client: never share an owner's session across requests.
      const client = createClient(url, key, {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
          detectSessionInUrl: false,
        },
      });
      const { data, error } = await client.auth.signInWithPassword({
        email,
        password,
      });
      if (error?.status === 429) return { kind: "rate-limited" };
      if (error || !data.user || !data.session)
        return {
          kind:
            error && error.status && error.status >= 500
              ? "unavailable"
              : "denied",
        };
      const membership = await client
        .from("store_admins")
        .select("user_id")
        .eq("user_id", data.user.id)
        .maybeSingle();
      if (membership.error || !membership.data) {
        await client.auth.signOut({ scope: "local" });
        return { kind: membership.error ? "unavailable" : "denied" };
      }
      return {
        kind: "authenticated",
        session: {
          access_token: data.session.access_token,
          refresh_token: data.session.refresh_token,
        },
      };
    },
  );
}
