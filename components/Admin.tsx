"use client";
import { useCallback, useEffect, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Eye,
  EyeOff,
  ImagePlus,
  LayoutGrid,
  LockKeyhole,
  LogOut,
  Package,
  Plus,
  Search,
  ShoppingBag,
  Upload,
  X,
} from "lucide-react";
import type { Order, Product } from "@/lib/types";
import { categories, productTypes } from "@/lib/types";
import { money } from "@/lib/catalog";
import { demoMode, supabase } from "@/lib/supabase";
import Modal from "./Modal";

type Props = {
  onClose: () => void;
  products: Product[];
  onProductsChange: (p: Product[]) => void;
  onReload: () => Promise<void>;
  notify: (text: string) => void;
};
const emptyProduct = (): Product => ({
  id: "",
  name: "",
  description: "",
  category: "Унисекс",
  type: "Футболки",
  price: 0,
  old_price: null,
  images: [],
  sizes: ["S", "M", "L"],
  colors: ["Чёрный"],
  stock: 1,
  badge: "",
  active: true,
  created_at: new Date().toISOString(),
});
const statusLabels: Record<Order["status"], string> = {
  new: "Новая",
  confirmed: "Подтверждена",
  completed: "Завершена",
  cancelled: "Отменена",
};
function readOrders(): Order[] {
  try {
    return JSON.parse(localStorage.getItem("shop-orders-v1") || "[]");
  } catch {
    return [];
  }
}
async function compressImage(file: File): Promise<string> {
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type))
    throw new Error("Выберите JPG, PNG или WebP");
  if (file.size > 5 * 1024 * 1024)
    throw new Error("Размер фотографии — до 5 МБ");
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 1400 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Не удалось обработать изображение");
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return canvas.toDataURL("image/webp", 0.84);
}
export default function Admin({
  onClose,
  products,
  onProductsChange,
  onReload,
  notify,
}: Props) {
  const [authorized, setAuthorized] = useState(false),
    [checking, setChecking] = useState(!demoMode),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [username, setUsername] = useState("admin"),
    [password, setPassword] = useState(""),
    [tab, setTab] = useState<"products" | "orders">("products"),
    [search, setSearch] = useState("");
  const [adminProducts, setAdminProducts] = useState<Product[]>(products),
    [orders, setOrders] = useState<Order[]>([]),
    [editor, setEditor] = useState<Product | null>(null),
    [sizeText, setSizeText] = useState(""),
    [colorText, setColorText] = useState(""),
    [url, setUrl] = useState("");
  const [uploading, setUploading] = useState(false);
  const refresh = useCallback(async () => {
    if (demoMode) {
      setOrders(readOrders());
      return;
    }
    const [p, o] = await Promise.all([
      supabase!
        .from("products")
        .select("*")
        .order("created_at", { ascending: false }),
      supabase!
        .from("orders")
        .select("*, order_items(*)")
        .order("created_at", { ascending: false })
        .limit(200),
    ]);
    if (p.error || o.error)
      throw new Error(
        "Не удалось загрузить данные панели. Проверьте настройку базы.",
      );
    setAdminProducts(p.data ?? []);
    setOrders(o.data ?? []);
  }, []);
  useEffect(() => {
    if (demoMode) return;
    let alive = true;
    async function check() {
      try {
        const {
          data: { user },
        } = await supabase!.auth.getUser();
        if (!user) return;
        const { data, error } = await supabase!
          .from("store_admins")
          .select("user_id")
          .eq("user_id", user.id)
          .maybeSingle();
        if (error) throw error;
        if (data && alive) {
          setAuthorized(true);
          await refresh();
        }
      } catch {
        if (alive)
          setError("Не удалось проверить доступ. Попробуйте войти ещё раз.");
      } finally {
        if (alive) setChecking(false);
      }
    }
    check();
    const {
      data: { subscription },
    } = supabase!.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT" && alive) {
        setAuthorized(false);
        setOrders([]);
        setAdminProducts([]);
        setEditor(null);
      }
    });
    return () => {
      alive = false;
      subscription.unsubscribe();
    };
  }, [refresh]);
  async function login(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      const response = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({ login: username, password }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Не удалось войти");
      if (demoMode) {
        if (data.demo !== true)
          throw new Error("Режим сервера изменился. Обновите страницу.");
        setAdminProducts(products);
        setOrders(readOrders());
      } else {
        if (!data.session || data.demo !== false)
          throw new Error("Режим сервера изменился. Обновите страницу.");
        const { error } = await supabase!.auth.setSession(data.session);
        if (error)
          throw new Error(
            "Не удалось открыть сессию. Попробуйте войти ещё раз.",
          );
        await refresh();
      }
      setAuthorized(true);
      setPassword("");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }
  function edit(p: Product) {
    setEditor({ ...p });
    setSizeText(p.sizes.join(", "));
    setColorText(p.colors.join(", "));
    setError("");
    setUrl("");
  }
  function persistDemo(next: Product[]) {
    localStorage.setItem("shop-products-v1", JSON.stringify(next));
    setAdminProducts(next);
    onProductsChange(next);
  }
  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!editor) return;
    setBusy(true);
    setError("");
    const uploaded: string[] = [];
    try {
      const sizes = [
          ...new Set(
            sizeText
              .split(",")
              .map((s) => s.trim())
              .filter(Boolean),
          ),
        ],
        colors = [
          ...new Set(
            colorText
              .split(",")
              .map((s) => s.trim())
              .filter(Boolean),
          ),
        ];
      if (!editor.name.trim() || !editor.images.length)
        throw new Error("Добавьте название и хотя бы одну фотографию");
      if (
        !sizes.length ||
        sizes.length > 20 ||
        sizes.some((s) => s.length > 20) ||
        !colors.length ||
        colors.length > 12 ||
        colors.some((c) => c.length > 50)
      )
        throw new Error("Укажите размеры и цвета через запятую");
      if (
        !Number.isInteger(editor.price) ||
        editor.price < 1 ||
        editor.price > 10000000 ||
        !Number.isInteger(editor.stock) ||
        editor.stock < 0 ||
        editor.stock > 100000
      )
        throw new Error("Проверьте цену и остаток: нужны целые числа");
      if (editor.old_price !== null && editor.old_price <= editor.price)
        throw new Error("Старая цена должна быть выше текущей");
      const product = {
        ...editor,
        id: editor.id || crypto.randomUUID(),
        name: editor.name.trim(),
        sizes,
        colors,
      };
      if (demoMode) {
        persistDemo(
          editor.id
            ? adminProducts.map((p) => (p.id === product.id ? product : p))
            : [product, ...adminProducts],
        );
      } else {
        const images: string[] = [];
        for (const src of product.images) {
          if (!src.startsWith("data:")) {
            images.push(src);
            continue;
          }
          const blob = await (await fetch(src)).blob(),
            path = `${product.id}/${crypto.randomUUID()}.webp`;
          const { error } = await supabase!.storage
            .from("product-images")
            .upload(path, blob, { contentType: "image/webp", upsert: false });
          if (error)
            throw new Error(
              "Не удалось загрузить фото. Проверьте права хранилища.",
            );
          uploaded.push(path);
          images.push(
            supabase!.storage.from("product-images").getPublicUrl(path).data
              .publicUrl,
          );
        }
        product.images = images;
        const { error } = await supabase!.from("products").upsert(product);
        if (error)
          throw new Error(
            "Не удалось сохранить товар. Проверьте доступ и значения полей.",
          );
        const next = editor.id
          ? adminProducts.map((p) => (p.id === product.id ? product : p))
          : [product, ...adminProducts];
        setAdminProducts(next);
        onProductsChange(next);
      }
      setEditor(null);
      notify("Товар сохранён");
    } catch (err) {
      if (uploaded.length)
        await supabase?.storage.from("product-images").remove(uploaded);
      setError(
        (err as Error).message.includes("quota")
          ? "Браузер заполнен. Удалите лишние фото или подключите Supabase."
          : (err as Error).message,
      );
    } finally {
      setBusy(false);
    }
  }
  async function toggleActive(p: Product) {
    setBusy(true);
    setError("");
    try {
      const next = adminProducts.map((item) =>
        item.id === p.id ? { ...p, active: !p.active } : item,
      );
      if (demoMode) persistDemo(next);
      else {
        const { error } = await supabase!
          .from("products")
          .update({ active: !p.active })
          .eq("id", p.id);
        if (error) throw error;
        setAdminProducts(next);
        onProductsChange(next);
      }
      notify(p.active ? "Товар скрыт из каталога" : "Товар опубликован");
    } catch {
      setError("Не удалось обновить товар");
    } finally {
      setBusy(false);
    }
  }
  async function addFiles(files: FileList | null) {
    if (!files || !editor) return;
    setError("");
    if (editor.images.length + files.length > 4) {
      setError("Можно добавить до 4 фотографий");
      return;
    }
    setUploading(true);
    try {
      const images = await Promise.all(Array.from(files).map(compressImage));
      setEditor((old) =>
        old ? { ...old, images: [...old.images, ...images] } : null,
      );
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setUploading(false);
    }
  }
  async function updateOrder(order: Order, status: Order["status"]) {
    setBusy(true);
    setError("");
    try {
      if (demoMode) {
        const updated = orders.map((o) =>
          o.id === order.id ? { ...o, status } : o,
        );
        if (status === "cancelled" && order.status !== "cancelled") {
          const next = adminProducts.map((p) => ({
            ...p,
            stock:
              p.stock +
              order.order_items
                .filter((i) => i.product_id === p.id)
                .reduce((n, i) => n + i.quantity, 0),
          }));
          const previous = localStorage.getItem("shop-products-v1");
          try {
            localStorage.setItem("shop-products-v1", JSON.stringify(next));
            localStorage.setItem("shop-orders-v1", JSON.stringify(updated));
          } catch (err) {
            if (previous) localStorage.setItem("shop-products-v1", previous);
            else localStorage.removeItem("shop-products-v1");
            throw err;
          }
          setAdminProducts(next);
          onProductsChange(next);
        } else localStorage.setItem("shop-orders-v1", JSON.stringify(updated));
        setOrders(updated);
      } else {
        const { error } = await supabase!.rpc("set_order_status", {
          order_id: order.id,
          new_status: status,
        });
        if (error) throw error;
        await refresh();
        await onReload();
      }
      notify("Статус заявки обновлён");
    } catch {
      setError("Не удалось изменить статус заявки");
    } finally {
      setBusy(false);
    }
  }
  const close = useCallback(() => {
    if (!busy && !uploading) onClose();
  }, [busy, uploading, onClose]);
  const shown = adminProducts.filter((p) =>
    `${p.name} ${p.type}`.toLowerCase().includes(search.toLowerCase()),
  );
  return (
    <Modal
      title={authorized ? "Панель владельца" : "Вход для владельца"}
      wide={authorized}
      onClose={close}
    >
      {checking ? (
        <div className="empty-state">Проверяем доступ…</div>
      ) : !authorized ? (
        <div className="admin-login">
          <div className="login-icon">
            <LockKeyhole size={28} />
          </div>
          <h3>Ваш магазин — под рукой</h3>
          <p className="muted">Товары, фотографии и заказы в одном месте.</p>
          {demoMode && (
            <div className="notice">
              Демонстрационный режим: изменения доступны только в этом браузере.
              После подключения Supabase здесь будет вход в настоящий магазин с
              тем же логином.
            </div>
          )}
          <form onSubmit={login} className="login-form">
            <label>
              Логин
              <input
                required
                type="text"
                autoComplete="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="admin"
                maxLength={100}
                autoCapitalize="none"
                spellCheck={false}
              />
            </label>
            <label>
              Пароль
              <input
                required
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                maxLength={256}
              />
            </label>
            {error && (
              <div className="error-message" role="alert">
                {error}
              </div>
            )}
            <button className="primary full" disabled={busy}>
              {busy ? "Входим…" : "Войти в панель"}
              <ArrowRight size={16} />
            </button>
          </form>
        </div>
      ) : (
        <div className="admin-content">
          <div className="admin-top">
            <span className="admin-status">
              <span className="status-dot" />
              {demoMode ? "Демонстрационный режим" : "Доступ владельца"}
            </span>
            <button
              className="text-button"
              disabled={busy}
              onClick={async () => {
                if (!demoMode) await supabase!.auth.signOut();
                setAuthorized(false);
                setEditor(null);
              }}
            >
              <LogOut size={14} />
              Выйти
            </button>
          </div>
          {editor ? (
            <form className="editor-form" onSubmit={save}>
              <button
                className="text-button back-button"
                type="button"
                disabled={busy || uploading}
                onClick={() => {
                  setEditor(null);
                  setError("");
                }}
              >
                <ArrowLeft size={15} />К списку товаров
              </button>
              <h3>{editor.id ? "Редактировать товар" : "Новый товар"}</h3>
              <div className="editor-layout">
                <div>
                  <label className="field-label">
                    Фотографии · {editor.images.length}/4
                  </label>
                  <div className="upload-grid">
                    {editor.images.map((image, i) => (
                      <div className="upload-preview" key={i}>
                        <img src={image} alt={`Фото ${i + 1}`} />
                        <button
                          type="button"
                          aria-label="Удалить фото"
                          disabled={busy || uploading}
                          onClick={() =>
                            setEditor({
                              ...editor,
                              images: editor.images.filter(
                                (_, idx) => idx !== i,
                              ),
                            })
                          }
                        >
                          <X size={14} />
                        </button>
                        {i === 0 && <span>Главное</span>}
                      </div>
                    ))}
                    {editor.images.length < 4 && (
                      <label className="upload-zone">
                        <ImagePlus size={26} />
                        <span>
                          {uploading ? "Обработка…" : "Загрузить фото"}
                        </span>
                        <small>JPG, PNG, WebP · до 5 МБ</small>
                        <input
                          type="file"
                          accept="image/jpeg,image/png,image/webp"
                          multiple
                          disabled={uploading || busy}
                          onChange={(e) => {
                            addFiles(e.target.files);
                            e.target.value = "";
                          }}
                        />
                      </label>
                    )}
                  </div>
                  <div className="image-url">
                    <input
                      type="url"
                      placeholder="Или ссылка https://…"
                      aria-label="Ссылка на фотографию"
                      value={url}
                      onChange={(e) => setUrl(e.target.value)}
                    />
                    <button
                      type="button"
                      className="secondary"
                      disabled={!url || editor.images.length >= 4}
                      onClick={() => {
                        try {
                          const parsed = new URL(url);
                          if (parsed.protocol !== "https:") throw new Error();
                          setEditor({
                            ...editor,
                            images: [...editor.images, parsed.href],
                          });
                          setUrl("");
                        } catch {
                          setError("Укажите корректную ссылку https://");
                        }
                      }}
                    >
                      <Plus size={17} />
                    </button>
                  </div>
                  <p className="small muted">
                    Первое фото станет обложкой. Фото автоматически сжимаются
                    перед сохранением.
                  </p>
                  <label>
                    Описание
                    <textarea
                      required
                      maxLength={5000}
                      rows={6}
                      value={editor.description}
                      onChange={(e) =>
                        setEditor({ ...editor, description: e.target.value })
                      }
                      placeholder="Посадка, материал, состав и уход"
                    />
                  </label>
                </div>
                <div className="editor-fields">
                  <label>
                    Название
                    <input
                      required
                      maxLength={150}
                      value={editor.name}
                      onChange={(e) =>
                        setEditor({ ...editor, name: e.target.value })
                      }
                      placeholder="Например, футболка oversize"
                    />
                  </label>
                  <div className="form-grid">
                    <label>
                      Раздел
                      <select
                        value={editor.category}
                        onChange={(e) =>
                          setEditor({ ...editor, category: e.target.value })
                        }
                      >
                        {categories.slice(1).map((c) => (
                          <option key={c}>{c}</option>
                        ))}
                      </select>
                    </label>
                    <label>
                      Категория
                      <select
                        value={editor.type}
                        onChange={(e) =>
                          setEditor({ ...editor, type: e.target.value })
                        }
                      >
                        {productTypes.map((t) => (
                          <option key={t}>{t}</option>
                        ))}
                      </select>
                    </label>
                  </div>
                  <div className="form-grid">
                    <label>
                      Цена, ₽
                      <input
                        required
                        type="number"
                        min="1"
                        max="10000000"
                        step="1"
                        value={editor.price || ""}
                        onChange={(e) =>
                          setEditor({
                            ...editor,
                            price: Number(e.target.value),
                          })
                        }
                      />
                    </label>
                    <label>
                      Старая цена, ₽
                      <input
                        type="number"
                        min="1"
                        max="10000000"
                        step="1"
                        placeholder="Необязательно"
                        value={editor.old_price ?? ""}
                        onChange={(e) =>
                          setEditor({
                            ...editor,
                            old_price: e.target.value
                              ? Number(e.target.value)
                              : null,
                          })
                        }
                      />
                    </label>
                  </div>
                  <label>
                    Размеры через запятую
                    <input
                      required
                      value={sizeText}
                      maxLength={400}
                      onChange={(e) => setSizeText(e.target.value)}
                      placeholder="S, M, L или ONE SIZE"
                    />
                  </label>
                  <label>
                    Цвета через запятую
                    <input
                      required
                      value={colorText}
                      maxLength={600}
                      onChange={(e) => setColorText(e.target.value)}
                      placeholder="Чёрный, Молочный"
                    />
                  </label>
                  <div className="form-grid">
                    <label>
                      Общий остаток, шт.
                      <input
                        required
                        type="number"
                        min="0"
                        max="100000"
                        step="1"
                        value={editor.stock}
                        onChange={(e) =>
                          setEditor({
                            ...editor,
                            stock: Number(e.target.value),
                          })
                        }
                      />
                    </label>
                    <label>
                      Метка
                      <select
                        value={editor.badge}
                        onChange={(e) =>
                          setEditor({ ...editor, badge: e.target.value })
                        }
                      >
                        <option value="">Без метки</option>
                        <option>Новинка</option>
                        <option>Бестселлер</option>
                      </select>
                    </label>
                  </div>
                  <p className="small muted">
                    Остаток общий для всех размеров и цветов.
                  </p>
                  <label className="check-row">
                    <input
                      type="checkbox"
                      checked={editor.active}
                      onChange={(e) =>
                        setEditor({ ...editor, active: e.target.checked })
                      }
                    />
                    <span>Показывать товар в каталоге</span>
                  </label>
                </div>
              </div>
              {error && (
                <div className="error-message" role="alert">
                  {error}
                </div>
              )}
              <div className="editor-actions">
                <button
                  type="button"
                  className="secondary"
                  disabled={busy || uploading}
                  onClick={() => setEditor(null)}
                >
                  Отмена
                </button>
                <button className="primary" disabled={busy || uploading}>
                  <Check size={17} />
                  {busy ? "Сохраняем…" : "Сохранить товар"}
                </button>
              </div>
            </form>
          ) : (
            <>
              <div className="admin-tabs">
                <button
                  className={tab === "products" ? "active" : ""}
                  onClick={() => {
                    setTab("products");
                    setError("");
                  }}
                >
                  <LayoutGrid size={17} />
                  Товары <span>{adminProducts.length}</span>
                </button>
                <button
                  className={tab === "orders" ? "active" : ""}
                  onClick={() => {
                    setTab("orders");
                    setError("");
                  }}
                >
                  <ShoppingBag size={17} />
                  Заявки{" "}
                  <span>{orders.filter((o) => o.status === "new").length}</span>
                </button>
              </div>
              {error && (
                <div className="error-message" role="alert">
                  {error}
                </div>
              )}
              {tab === "products" ? (
                <>
                  <div className="admin-toolbar">
                    <div className="search-box">
                      <Search size={16} />
                      <input
                        aria-label="Поиск в панели"
                        placeholder="Поиск по товарам"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                      />
                    </div>
                    <button
                      className="primary"
                      onClick={() => edit(emptyProduct())}
                    >
                      <Plus size={17} />
                      Добавить товар
                    </button>
                  </div>
                  <div className="admin-products">
                    {shown.length === 0 ? (
                      <div className="empty-state">
                        <Package size={34} />
                        <h3>Добавьте первые товары</h3>
                        <p>Загрузите фотографии, укажите цены и размеры.</p>
                      </div>
                    ) : (
                      shown.map((p) => (
                        <div className="admin-product" key={p.id}>
                          <img src={p.images[0]} alt={p.name} />
                          <div className="admin-product-name">
                            <strong>{p.name}</strong>
                            <span>
                              {p.type} · {p.stock} шт.
                            </span>
                          </div>
                          <strong className="admin-price">
                            {money(p.price)}
                          </strong>
                          <span
                            className={`visibility ${p.active ? "published" : ""}`}
                          >
                            {p.active ? "В каталоге" : "Скрыт"}
                          </span>
                          <button className="secondary" onClick={() => edit(p)}>
                            Изменить
                          </button>
                          <button
                            className="icon-button"
                            disabled={busy}
                            aria-label={
                              p.active ? "Скрыть товар" : "Опубликовать товар"
                            }
                            onClick={() => toggleActive(p)}
                          >
                            {p.active ? (
                              <Eye size={18} />
                            ) : (
                              <EyeOff size={18} />
                            )}
                          </button>
                        </div>
                      ))
                    )}
                  </div>
                </>
              ) : (
                <div className="admin-orders">
                  <div className="orders-header">
                    <p className="small muted">
                      Последние 200 заявок · стоимость доставки не включена
                    </p>
                    <button
                      className="text-button"
                      onClick={async () => {
                        setError("");
                        try {
                          await refresh();
                        } catch (err) {
                          setError((err as Error).message);
                        }
                      }}
                    >
                      Обновить
                    </button>
                  </div>
                  {orders.length === 0 ? (
                    <div className="empty-state">
                      <ShoppingBag size={36} />
                      <h3>Пока нет заявок</h3>
                      <p>
                        {demoMode
                          ? "Оформите пробный заказ через корзину."
                          : "Новые заказы появятся здесь."}
                      </p>
                    </div>
                  ) : (
                    orders.map((order) => (
                      <div className="order-card" key={order.id}>
                        <div className="order-card-top">
                          <strong>Заявка № {order.number}</strong>
                          <span className={`order-status ${order.status}`}>
                            {statusLabels[order.status]}
                          </span>
                          <time>
                            {new Date(order.created_at).toLocaleString("ru-RU")}
                          </time>
                        </div>
                        <div className="order-customer">
                          <strong>{order.customer_name}</strong>
                          <a href={`tel:${order.phone.replace(/[^+\d]/g, "")}`}>
                            {order.phone}
                          </a>
                          <span>
                            {order.delivery === "pickup"
                              ? "Самовывоз"
                              : `Доставка: ${order.address}`}
                          </span>
                        </div>
                        {order.order_items.map((i, idx) => (
                          <div className="order-line" key={idx}>
                            <span>
                              {i.name}{" "}
                              <small>
                                {i.size} · {i.color} × {i.quantity}
                              </small>
                            </span>
                            <strong>{money(i.price * i.quantity)}</strong>
                          </div>
                        ))}
                        {order.comment && (
                          <p className="order-comment">{order.comment}</p>
                        )}
                        <div className="order-bottom">
                          <strong>Итого: {money(order.total)}</strong>
                          <select
                            aria-label={`Статус заявки ${order.number}`}
                            value={order.status}
                            disabled={busy || order.status === "cancelled"}
                            onChange={(e) =>
                              updateOrder(
                                order,
                                e.target.value as Order["status"],
                              )
                            }
                          >
                            {Object.entries(statusLabels).map(
                              ([key, label]) => (
                                <option key={key} value={key}>
                                  {label}
                                </option>
                              ),
                            )}
                          </select>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </Modal>
  );
}
