import { test } from "node:test";
import assert from "node:assert/strict";
import { POST } from "../app/api/admin/login/route";

test("real login maps admin to the private email and checks owner membership before returning tokens", async () => {
  const keys = [
    "NEXT_PUBLIC_SUPABASE_URL",
    "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
    "NEXT_PUBLIC_SUPABASE_ANON_KEY",
    "NEXT_PUBLIC_DEMO_MODE",
    "ADMIN_EMAIL",
  ] as const;
  const previous = Object.fromEntries(
    keys.map((key) => [key, process.env[key]]),
  );
  const originalFetch = globalThis.fetch;
  const userId = "00000000-0000-0000-0000-000000000001";
  const encode = (value: object) =>
    Buffer.from(JSON.stringify(value)).toString("base64url");
  const accessToken = `${encode({ alg: "HS256", typ: "JWT" })}.${encode({ sub: userId, exp: Math.floor(Date.now() / 1000) + 3600, role: "authenticated", aud: "authenticated" })}.test-signature`;
  let isOwner = true,
    logoutCalled = false,
    authCalls = 0;
  try {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://project.supabase.example";
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "test-public-key";
    process.env.NEXT_PUBLIC_DEMO_MODE = "false";
    process.env.ADMIN_EMAIL = "private-owner@example.com";
    globalThis.fetch = async (input, init) => {
      const url = String(input instanceof Request ? input.url : input);
      if (url.includes("/auth/v1/token")) {
        authCalls++;
        const credentials = JSON.parse(String(init?.body));
        assert.equal(credentials.email, "private-owner@example.com");
        assert.equal(credentials.password, "TestAuth#1234");
        return Response.json({
          access_token: accessToken,
          refresh_token: "test-refresh",
          token_type: "bearer",
          expires_in: 3600,
          user: {
            id: userId,
            aud: "authenticated",
            role: "authenticated",
            email: "private-owner@example.com",
          },
        });
      }
      if (url.includes("/rest/v1/store_admins")) {
        assert.equal(
          new Headers(init?.headers).get("authorization"),
          `Bearer ${accessToken}`,
        );
        return Response.json(isOwner ? { user_id: userId } : null);
      }
      if (url.includes("/auth/v1/logout")) {
        logoutCalled = true;
        return new Response(null, { status: 204 });
      }
      throw new Error(`Unexpected network request: ${url}`);
    };
    const request = () =>
      new Request("https://shop.example/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          login: "admin",
          password: "TestAuth#1234",
          email: "attacker@example.com",
        }),
      });
    const allowed = await POST(request());
    assert.equal(allowed.status, 200);
    assert.deepEqual(await allowed.json(), {
      demo: false,
      session: { access_token: accessToken, refresh_token: "test-refresh" },
    });
    isOwner = false;
    const rejected = await POST(request());
    assert.equal(rejected.status, 401);
    assert.equal("session" in (await rejected.json()), false);
    assert.equal(logoutCalled, true);
    delete process.env.ADMIN_EMAIL;
    const unavailable = await POST(request());
    assert.equal(unavailable.status, 503);
    assert.equal(authCalls, 2);
  } finally {
    globalThis.fetch = originalFetch;
    for (const key of keys) {
      if (previous[key] === undefined) delete process.env[key];
      else process.env[key] = previous[key];
    }
  }
});
