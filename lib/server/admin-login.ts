import { verifyAdminPassword } from "./admin-password";

export type AdminSession = { access_token: string; refresh_token: string };
export type AuthenticationResult =
  | { kind: "authenticated"; session: AdminSession }
  | { kind: "denied" | "unavailable" | "rate-limited" };
export type LoginSettings = { demo: boolean; passwordHash: string };
export type Authenticate = (password: string) => Promise<AuthenticationResult>;

function json(body: object, status = 200) {
  return Response.json(body, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

export async function handleAdminLogin(
  request: Request,
  settings: LoginSettings,
  authenticate: Authenticate,
): Promise<Response> {
  // Never accept cross-origin form submissions. Authentication responses contain tokens.
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin)
    return json({ error: "Запрос с другого сайта запрещён" }, 403);
  if (
    request.headers.get("content-type")?.split(";")[0].trim() !==
    "application/json"
  )
    return json({ error: "Ожидается JSON" }, 415);
  if (Number(request.headers.get("content-length")) > 2048)
    return json({ error: "Слишком большой запрос" }, 413);

  let data: unknown;
  try {
    // Bound the stream even when Content-Length is missing or inaccurate.
    const reader = request.body?.getReader();
    if (!reader) return json({ error: "Пустой запрос" }, 400);
    const chunks: Uint8Array[] = [];
    let size = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > 2048) {
          await reader.cancel();
          return json({ error: "Слишком большой запрос" }, 413);
        }
        chunks.push(value);
      }
    } finally {
      reader.releaseLock();
    }
    data = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    return json({ error: "Некорректный запрос" }, 400);
  }

  if (!data || typeof data !== "object" || Array.isArray(data))
    return json({ error: "Укажите логин и пароль" }, 400);
  const { login, password } = data as Record<string, unknown>;
  if (
    typeof login !== "string" ||
    typeof password !== "string" ||
    login.length > 100 ||
    !password.length ||
    password.length > 256
  )
    return json({ error: "Укажите логин и пароль" }, 400);
  if (login.trim() !== "admin")
    return json({ error: "Неверный логин или пароль" }, 401);

  try {
    if (settings.demo) {
      if (!(await verifyAdminPassword(password, settings.passwordHash)))
        return json({ error: "Неверный логин или пароль" }, 401);
      return json({ demo: true });
    }
    // A demo hash can never grant access to production products or orders.
    const result = await authenticate(password);
    if (result.kind === "rate-limited")
      return json({ error: "Слишком много попыток. Попробуйте позже." }, 429);
    if (result.kind === "unavailable")
      return json(
        { error: "Вход владельца ещё не настроен или временно недоступен." },
        503,
      );
    if (result.kind !== "authenticated")
      return json({ error: "Неверный логин или пароль" }, 401);
    return json({ demo: false, session: result.session });
  } catch {
    return json(
      { error: "Сервис входа временно недоступен. Попробуйте ещё раз." },
      503,
    );
  }
}
