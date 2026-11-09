import { test } from "node:test";
import assert from "node:assert/strict";
import {
  hashAdminPassword,
  verifyAdminPassword,
} from "../lib/server/admin-password";
import { handleAdminLogin, type Authenticate } from "../lib/server/admin-login";

const correctPassword = "TestAuth#1234";
const denied: Authenticate = async () => ({ kind: "denied" });
function request(body: unknown, headers: Record<string, string> = {}) {
  return new Request("https://shop.example/api/admin/login", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

test("admin password hashing uses random salts and rejects incorrect or malformed hashes", async () => {
  const first = await hashAdminPassword(correctPassword),
    second = await hashAdminPassword(correctPassword);
  assert.notEqual(first, second);
  assert.equal(await verifyAdminPassword(correctPassword, first), true);
  assert.equal(await verifyAdminPassword("wrong-password", first), false);
  assert.equal(await verifyAdminPassword(correctPassword, "invalid"), false);
  assert.equal(await verifyAdminPassword("x".repeat(257), first), false);
});

test("demo login requires the assigned password and returns no production session", async () => {
  const passwordHash = await hashAdminPassword(correctPassword);
  let called = false;
  const response = await handleAdminLogin(
    request({ login: "admin", password: correctPassword }),
    { demo: true, passwordHash },
    async () => {
      called = true;
      return { kind: "denied" };
    },
  );
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.deepEqual(await response.json(), { demo: true });
  assert.equal(called, false);
  const wrong = await handleAdminLogin(
    request({ login: "admin", password: "incorrect" }),
    { demo: true, passwordHash },
    denied,
  );
  assert.equal(wrong.status, 401);
});

test("only admin is accepted and invalid input never reaches the identity provider", async () => {
  let called = false;
  const authenticate: Authenticate = async () => {
    called = true;
    return { kind: "denied" };
  };
  for (const body of [
    { login: "other", password: correctPassword },
    { login: "admin", password: "" },
    { login: ["admin"], password: correctPassword },
    null,
  ]) {
    const response = await handleAdminLogin(
      request(body),
      { demo: false, passwordHash: "" },
      authenticate,
    );
    assert.ok([400, 401].includes(response.status));
  }
  assert.equal(called, false);
});

test("production login cannot use the demo password as an authentication bypass", async () => {
  const passwordHash = await hashAdminPassword(correctPassword);
  let called = false;
  const response = await handleAdminLogin(
    request({ login: "admin", password: correctPassword }),
    { demo: false, passwordHash },
    async (password) => {
      called = true;
      assert.equal(password, correctPassword);
      return { kind: "denied" };
    },
  );
  assert.equal(response.status, 401);
  assert.equal(called, true);
});

test("production response only exposes session tokens returned after owner verification", async () => {
  const session = {
    access_token: "test-access",
    refresh_token: "test-refresh",
  };
  const response = await handleAdminLogin(
    request({ login: "admin", password: correctPassword }),
    { demo: false, passwordHash: "" },
    async () => ({ kind: "authenticated", session }),
  );
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { demo: false, session });
  assert.equal(response.headers.get("cache-control"), "no-store");
  for (const [kind, status] of [
    ["unavailable", 503],
    ["rate-limited", 429],
  ] as const) {
    const failed = await handleAdminLogin(
      request({ login: "admin", password: correctPassword }),
      { demo: false, passwordHash: "" },
      async () => ({ kind }),
    );
    assert.equal(failed.status, status);
    assert.equal("session" in (await failed.json()), false);
  }
});

test("login rejects cross-origin, non-JSON and oversized bodies including streamed requests", async () => {
  const settings = { demo: false, passwordHash: "" };
  const cross = await handleAdminLogin(
    request(
      { login: "admin", password: correctPassword },
      { origin: "https://attacker.example" },
    ),
    settings,
    denied,
  );
  assert.equal(cross.status, 403);
  const form = await handleAdminLogin(
    new Request("https://shop.example/api/admin/login", {
      method: "POST",
      body: "login=admin&password=x",
    }),
    settings,
    denied,
  );
  assert.equal(form.status, 415);
  const large = await handleAdminLogin(
    request({ login: "admin", password: "x".repeat(3000) }),
    settings,
    denied,
  );
  assert.equal(large.status, 413);
  const malformed = await handleAdminLogin(
    new Request("https://shop.example/api/admin/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{",
    }),
    settings,
    denied,
  );
  assert.equal(malformed.status, 400);
});
