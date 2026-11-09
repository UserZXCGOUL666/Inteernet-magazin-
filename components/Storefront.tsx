"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowDownUp,
  ArrowRight,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Heart,
  LayoutGrid,
  Menu,
  Minus,
  Package,
  Plus,
  Search,
  ShieldCheck,
  ShoppingBag,
  SlidersHorizontal,
  Truck,
  X,
} from "lucide-react";
import type { CartItem, Customer, Order, Product } from "@/lib/types";
import { allSizes, categories, productTypes } from "@/lib/types";
import {
  cartTotal,
  filterProducts,
  lineKey,
  money,
  validateCart,
} from "@/lib/catalog";
import { demoProducts } from "@/lib/data";
import { demoMode, supabase } from "@/lib/supabase";
import Modal from "./Modal";
import Admin from "./Admin";

const readLocal = <T,>(key: string, fallback: T): T => {
  try {
    const value = localStorage.getItem(key);
    return value ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
};
export default function Storefront() {
  const orderRequest = useRef<{ id: string; signature: string } | null>(null);
  const [products, setProducts] = useState<Product[]>([]),
    [loading, setLoading] = useState(true),
    [loadError, setLoadError] = useState("");
  const [cart, setCart] = useState<CartItem[]>([]),
    [favorites, setFavorites] = useState<string[]>([]),
    [hydrated, setHydrated] = useState(false);
  const [query, setQuery] = useState(""),
    [category, setCategory] = useState("Все товары"),
    [types, setTypes] = useState<string[]>([]),
    [sizes, setSizes] = useState<string[]>([]),
    [min, setMin] = useState(""),
    [max, setMax] = useState(""),
    [sort, setSort] = useState("new"),
    [favoritesOnly, setFavoritesOnly] = useState(false);
  const [selected, setSelected] = useState<Product | null>(null),
    [selectedSize, setSelectedSize] = useState(""),
    [selectedColor, setSelectedColor] = useState("");
  const [cartOpen, setCartOpen] = useState(false),
    [checkout, setCheckout] = useState(false),
    [success, setSuccess] = useState<{ number: number; demo: boolean } | null>(
      null,
    ),
    [submitting, setSubmitting] = useState(false),
    [checkoutError, setCheckoutError] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(false),
    [adminOpen, setAdminOpen] = useState(false),
    [info, setInfo] = useState(""),
    [toast, setToast] = useState("");
  const [customer, setCustomer] = useState<Customer>({
    name: "",
    phone: "",
    delivery: "pickup",
    address: "",
    comment: "",
  });
  const notify = useCallback((message: string) => setToast(message), []);
  const loadProducts = useCallback(async () => {
    setLoading(true);
    setLoadError("");
    if (demoMode) {
      const saved = readLocal<Product[]>("shop-products-v1", demoProducts);
      setProducts(Array.isArray(saved) ? saved : demoProducts);
      setLoading(false);
      return;
    }
    try {
      const { data, error } = await supabase!
        .from("products")
        .select("*")
        .eq("active", true)
        .order("created_at", { ascending: false });
      if (error) throw error;
      setProducts(data ?? []);
    } catch {
      setLoadError(
        "Не удалось загрузить каталог. Проверьте подключение и попробуйте ещё раз.",
      );
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    const savedCart = readLocal<CartItem[]>("shop-cart-v1", []),
      savedFav = readLocal<string[]>("shop-favorites-v1", []);
    setCart(
      Array.isArray(savedCart)
        ? savedCart.filter(
            (i) =>
              i &&
              typeof i.productId === "string" &&
              typeof i.size === "string" &&
              typeof i.color === "string" &&
              Number.isInteger(i.quantity) &&
              i.quantity > 0 &&
              i.quantity <= 20,
          )
        : [],
    );
    setFavorites(
      Array.isArray(savedFav)
        ? savedFav.filter((i) => typeof i === "string")
        : [],
    );
    setHydrated(true);
    loadProducts();
    if (new URLSearchParams(location.search).get("admin") === "1")
      setAdminOpen(true);
  }, [loadProducts]);
  useEffect(() => {
    if (hydrated)
      try {
        localStorage.setItem("shop-cart-v1", JSON.stringify(cart));
        localStorage.setItem("shop-favorites-v1", JSON.stringify(favorites));
      } catch {
        notify(
          "Браузер не разрешает сохранить корзину. Она доступна до закрытия страницы.",
        );
      }
  }, [cart, favorites, hydrated, notify]);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(""), 3500);
    return () => clearTimeout(timer);
  }, [toast]);
  const visible = useMemo(
    () =>
      filterProducts(products, {
        query,
        category,
        types,
        sizes,
        min,
        max,
        sort,
        favoritesOnly,
        favorites,
      }),
    [
      products,
      query,
      category,
      types,
      sizes,
      min,
      max,
      sort,
      favoritesOnly,
      favorites,
    ],
  );
  const total = cartTotal(cart, products),
    count = cart.reduce((n, i) => n + i.quantity, 0);
  const activeFilters = types.length + sizes.length + Number(!!min || !!max);
  function clearFilters() {
    setTypes([]);
    setSizes([]);
    setMin("");
    setMax("");
    setQuery("");
    setCategory("Все товары");
    setFavoritesOnly(false);
  }
  function toggleFavorite(id: string) {
    setFavorites((old) =>
      old.includes(id) ? old.filter((f) => f !== id) : [...old, id],
    );
  }
  function openProduct(p: Product) {
    setSelected(p);
    setSelectedSize(p.sizes.length === 1 ? p.sizes[0] : "");
    setSelectedColor(p.colors[0] ?? "");
  }
  function addToCart(p: Product, size: string, color: string) {
    if (!size) {
      notify("Выберите размер");
      return;
    }
    const existing = cart
      .filter((i) => i.productId === p.id)
      .reduce((n, i) => n + i.quantity, 0);
    if (existing >= p.stock) {
      notify("Больше нет в наличии");
      return;
    }
    const key = lineKey({ productId: p.id, size, color }),
      found = cart.find((i) => lineKey(i) === key);
    if (found && found.quantity >= 20) {
      notify("Максимум 20 единиц одного варианта");
      return;
    }
    setCart((old) =>
      found
        ? old.map((i) =>
            lineKey(i) === key ? { ...i, quantity: i.quantity + 1 } : i,
          )
        : [...old, { productId: p.id, size, color, quantity: 1 }],
    );
    notify("Товар добавлен в корзину");
  }
  function changeQuantity(item: CartItem, delta: number) {
    const p = products.find((p) => p.id === item.productId);
    if (
      delta > 0 &&
      (!p ||
        cart
          .filter((i) => i.productId === p.id)
          .reduce((n, i) => n + i.quantity, 0) >= p.stock ||
        item.quantity >= 20)
    ) {
      notify("Достигнуто доступное количество");
      return;
    }
    setCart((old) =>
      old
        .map((i) =>
          lineKey(i) === lineKey(item)
            ? { ...i, quantity: i.quantity + delta }
            : i,
        )
        .filter((i) => i.quantity > 0),
    );
  }
  async function placeOrder(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setCheckoutError("");
    setSubmitting(true);
    try {
      validateCart(cart, products);
      if (customer.name.trim().length < 2) throw new Error("Укажите имя");
      const digits = customer.phone.replace(/\D/g, "");
      if (digits.length < 10 || digits.length > 15)
        throw new Error("Проверьте номер телефона");
      if (
        customer.delivery === "delivery" &&
        customer.address.trim().length < 5
      )
        throw new Error("Укажите адрес доставки");
      let number: number;
      if (demoMode) {
        const orders = readLocal<Order[]>("shop-orders-v1", []);
        number = Math.max(1000, ...orders.map((o) => o.number)) + 1;
        const order: Order = {
          id: crypto.randomUUID(),
          number,
          customer_name: customer.name.trim(),
          phone: customer.phone,
          delivery: customer.delivery,
          address: customer.address,
          comment: customer.comment,
          total,
          status: "new",
          created_at: new Date().toISOString(),
          order_items: cart.map((i) => ({
            product_id: i.productId,
            name: products.find((p) => p.id === i.productId)!.name,
            price: products.find((p) => p.id === i.productId)!.price,
            size: i.size,
            color: i.color,
            quantity: i.quantity,
          })),
        };
        const updated = products.map((p) => ({
          ...p,
          stock:
            p.stock -
            cart
              .filter((i) => i.productId === p.id)
              .reduce((n, i) => n + i.quantity, 0),
        }));
        const oldProducts = localStorage.getItem("shop-products-v1");
        try {
          localStorage.setItem("shop-products-v1", JSON.stringify(updated));
          localStorage.setItem(
            "shop-orders-v1",
            JSON.stringify([order, ...orders]),
          );
        } catch {
          if (oldProducts)
            localStorage.setItem("shop-products-v1", oldProducts);
          else localStorage.removeItem("shop-products-v1");
          throw new Error(
            "Не удалось сохранить демо-заказ: освободите место в браузере.",
          );
        }
        setProducts(updated);
      } else {
        const signature = JSON.stringify({ customer, cart });
        if (orderRequest.current?.signature !== signature)
          orderRequest.current = { id: crypto.randomUUID(), signature };
        const { data, error } = await supabase!.rpc("place_order", {
          request_id: orderRequest.current!.id,
          customer: { ...customer, name: customer.name.trim() },
          items: cart.map((i) => ({
            product_id: i.productId,
            size: i.size,
            color: i.color,
            quantity: i.quantity,
          })),
        });
        if (error)
          throw new Error(
            error.message.includes("Недостаточно") ||
              error.message.includes("недоступен")
              ? error.message
              : "Не удалось отправить заявку. Попробуйте ещё раз.",
          );
        number = data.number;
        await loadProducts();
      }
      orderRequest.current = null;
      setSuccess({ number, demo: demoMode });
      setCart([]);
      setCheckout(false);
      setCustomer({
        name: "",
        phone: "",
        delivery: "pickup",
        address: "",
        comment: "",
      });
    } catch (error) {
      setCheckoutError(
        error instanceof Error ? error.message : "Произошла ошибка",
      );
    } finally {
      setSubmitting(false);
    }
  }
  useEffect(() => {
    const shortcut = (e: KeyboardEvent) => {
      if (
        e.key === "/" &&
        !["INPUT", "TEXTAREA", "SELECT"].includes(
          (e.target as HTMLElement).tagName,
        ) &&
        !selected &&
        !cartOpen &&
        !adminOpen &&
        !info
      ) {
        e.preventDefault();
        document
          .querySelector<HTMLInputElement>('input[aria-label="Поиск товаров"]')
          ?.focus();
      }
    };
    document.addEventListener("keydown", shortcut);
    return () => document.removeEventListener("keydown", shortcut);
  }, [selected, cartOpen, adminOpen, info]);
  const closeProduct = useCallback(() => setSelected(null), []),
    closeCart = useCallback(() => {
      if (!submitting) {
        setCartOpen(false);
        setCheckout(false);
        setSuccess(null);
        setCheckoutError("");
      }
    }, [submitting]);
  const closeAdmin = useCallback(() => setAdminOpen(false), []),
    closeFilters = useCallback(() => setFiltersOpen(false), []),
    closeInfo = useCallback(() => setInfo(""), []);
  const filters = (
    <>
      <div className="filter-heading">
        <h3>Фильтры</h3>
        {activeFilters > 0 && (
          <button
            className="text-button"
            onClick={() => {
              setTypes([]);
              setSizes([]);
              setMin("");
              setMax("");
            }}
          >
            Сбросить
          </button>
        )}
      </div>
      <fieldset>
        <legend>Категория</legend>
        {productTypes.map((type) => (
          <label className="check-row" key={type}>
            <input
              type="checkbox"
              checked={types.includes(type)}
              onChange={() =>
                setTypes((old) =>
                  old.includes(type)
                    ? old.filter((t) => t !== type)
                    : [...old, type],
                )
              }
            />
            <span>{type}</span>
            <span className="muted small">
              {products.filter((p) => p.type === type && p.active).length}
            </span>
          </label>
        ))}
      </fieldset>
      <fieldset>
        <legend>Цена, ₽</legend>
        <div className="price-inputs">
          <label>
            <span>от</span>
            <input
              aria-label="Цена от"
              type="number"
              min="0"
              value={min}
              placeholder="0"
              onChange={(e) => setMin(e.target.value)}
            />
          </label>
          <span>—</span>
          <label>
            <span>до</span>
            <input
              aria-label="Цена до"
              type="number"
              min="0"
              value={max}
              placeholder="20 000"
              onChange={(e) => setMax(e.target.value)}
            />
          </label>
        </div>
      </fieldset>
      <fieldset>
        <legend>Размер</legend>
        <div className="size-options">
          {allSizes.map((size) => (
            <button
              key={size}
              className={sizes.includes(size) ? "size active" : "size"}
              aria-pressed={sizes.includes(size)}
              onClick={() =>
                setSizes((old) =>
                  old.includes(size)
                    ? old.filter((s) => s !== size)
                    : [...old, size],
                )
              }
            >
              {size}
            </button>
          ))}
        </div>
      </fieldset>
      <div className="filter-note">
        <Package size={22} />
        <p>
          Найдите то, что
          <br />
          подойдёт именно вам.
        </p>
      </div>
    </>
  );
  return (
    <>
      {demoMode && (
        <div className="demo-bar">
          <span className="status-dot" />
          Демонстрационный магазин
          <span className="demo-detail">
            {" "}
            · Товары и заказы сохраняются в этом браузере
          </span>
          <button onClick={() => setAdminOpen(true)}>
            Попробовать панель <ArrowRight size={12} />
          </button>
        </div>
      )}
      <div className="utility-bar">
        <span>Одежда и аксессуары на каждый день</span>
        <nav>
          <button onClick={() => setInfo("Доставка и оплата")}>
            Доставка и оплата
          </button>
          <button onClick={() => setInfo("Как заказать")}>Как заказать</button>
          <button onClick={() => setAdminOpen(true)}>
            Вход для владельца <ChevronRight size={12} />
          </button>
        </nav>
      </div>
      <header className="header">
        <a
          className="store-mark"
          href="#"
          onClick={(e) => {
            e.preventDefault();
            clearFilters();
            window.scrollTo({ top: 0, behavior: "smooth" });
          }}
          aria-label="На главную"
        >
          <ShoppingBag size={27} strokeWidth={1.7} />
          <span>
            магазин<span className="mark-dot">.</span>
          </span>
        </a>
        <button
          className="catalog-button"
          onClick={() =>
            document
              .getElementById("catalog")
              ?.scrollIntoView({ behavior: "smooth" })
          }
        >
          <LayoutGrid size={18} />
          <span>Каталог</span>
        </button>
        <div className="search-box">
          <Search size={19} />
          <input
            aria-label="Поиск товаров"
            placeholder="Найти что-нибудь своё"
            onKeyDown={(e) => {
              if (e.key === "Enter")
                document
                  .getElementById("catalog")
                  ?.scrollIntoView({ behavior: "smooth" });
            }}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
            }}
          />
          {query && (
            <button onClick={() => setQuery("")} aria-label="Очистить поиск">
              <X size={16} />
            </button>
          )}
          <kbd>/</kbd>
        </div>
        <button
          className={`header-action ${favoritesOnly ? "selected-action" : ""}`}
          onClick={() => {
            setFavoritesOnly((old) => !old);
            document
              .getElementById("catalog")
              ?.scrollIntoView({ behavior: "smooth" });
          }}
          aria-label="Избранное"
        >
          <span className="action-icon">
            <Heart size={22} />
            {favorites.length > 0 && <b>{favorites.length}</b>}
          </span>
          <span>Избранное</span>
        </button>
        <button
          className="header-action"
          onClick={() => {
            setCartOpen(true);
            setSuccess(null);
          }}
          aria-label="Корзина"
        >
          <span className="action-icon">
            <ShoppingBag size={22} />
            {count > 0 && <b>{count}</b>}
          </span>
          <span>Корзина</span>
        </button>
      </header>
      <nav className="category-nav">
        {categories.map((c) => (
          <button
            key={c}
            className={category === c ? "current" : ""}
            onClick={() => {
              setCategory(c);
              setFavoritesOnly(false);
            }}
          >
            {c}
          </button>
        ))}
        <span className="nav-season">
          Коллекция на каждый день <span>↗</span>
        </span>
      </nav>
      <main>
        <section className="hero">
          <div className="hero-copy">
            <div className="eyebrow">
              <span />
              МЕНЬШЕ ЛИШНЕГО. БОЛЬШЕ ВАШЕГО.
            </div>
            <h1>
              Простые вещи.
              <br />
              <span>Ваш характер.</span>
            </h1>
            <p>
              Удобная одежда и детали, из которых
              <br className="desktop-br" /> складывается каждый день.
            </p>
            <button
              className="primary hero-button"
              onClick={() =>
                document
                  .getElementById("catalog")
                  ?.scrollIntoView({ behavior: "smooth" })
              }
            >
              Выбрать своё <ArrowRight size={18} />
            </button>
            <div className="hero-foot">
              <span>БАЗОВЫЙ ГАРДЕРОБ</span>
              <span>КОЛЛЕКЦИЯ / 01</span>
            </div>
          </div>
          <div className="hero-visual">
            <img
              src="/images/hero.jpg"
              alt="Повседневный образ в нейтральных оттенках"
              fetchPriority="high"
            />
            <div className="hero-photo-shade" />
            <div className="photo-caption">
              <span>В своём ритме.</span>
              <ArrowRight size={30} strokeWidth={1} />
            </div>
            <span className="photo-label">everyday essentials</span>
          </div>
        </section>
        <div className="benefits">
          <div>
            <Package size={20} />
            <span>Всё нужное в одном месте</span>
          </div>
          <div>
            <ShieldCheck size={20} />
            <span>Детали и состав в карточке</span>
          </div>
          <div>
            <Truck size={21} />
            <span>Удобный способ получения</span>
          </div>
        </div>
        <section id="catalog" className="catalog-section">
          <div className="catalog-title">
            <div>
              <div className="eyebrow muted">НАЙДИТЕ СВОЁ</div>
              <h2>
                {favoritesOnly
                  ? "Избранное"
                  : category === "Все товары"
                    ? "Каталог"
                    : category}
                <span>
                  {visible.length}{" "}
                  {visible.length === 1
                    ? "товар"
                    : visible.length > 1 && visible.length < 5
                      ? "товара"
                      : "товаров"}
                </span>
              </h2>
            </div>
            <div className="catalog-tools">
              <button
                className="filter-mobile"
                onClick={() => setFiltersOpen(true)}
              >
                <SlidersHorizontal size={16} />
                Фильтры{activeFilters > 0 && <b>{activeFilters}</b>}
              </button>
              <label className="sort-select">
                <ArrowDownUp size={15} />
                <select
                  aria-label="Сортировка"
                  value={sort}
                  onChange={(e) => setSort(e.target.value)}
                >
                  <option value="new">Сначала новые</option>
                  <option value="price-asc">Сначала дешевле</option>
                  <option value="price-desc">Сначала дороже</option>
                </select>
                <ChevronDown size={13} />
              </label>
            </div>
          </div>
          <div className="catalog-layout">
            <aside className="filters">{filters}</aside>
            <div className="catalog-main">
              <div className="catalog-chips">
                <button
                  className={!types.length ? "chip active" : "chip"}
                  onClick={() => setTypes([])}
                >
                  Все вещи
                </button>
                {[
                  "Футболки",
                  "Худи и свитшоты",
                  "Брюки и джинсы",
                  "Сумки и аксессуары",
                ].map((t) => (
                  <button
                    className={types.includes(t) ? "chip active" : "chip"}
                    key={t}
                    onClick={() =>
                      setTypes((old) =>
                        old.includes(t) ? old.filter((x) => x !== t) : [t],
                      )
                    }
                  >
                    {t}
                  </button>
                ))}
              </div>
              {query && (
                <div className="search-result">
                  Результаты поиска: «{query}»
                </div>
              )}
              {loading ? (
                <div className="product-grid">
                  {[1, 2, 3, 4].map((i) => (
                    <div className="skeleton" key={i} />
                  ))}
                </div>
              ) : loadError ? (
                <div className="empty-state">
                  <Package size={38} />
                  <h3>Каталог временно недоступен</h3>
                  <p>{loadError}</p>
                  <button className="secondary" onClick={loadProducts}>
                    Попробовать ещё раз
                  </button>
                </div>
              ) : visible.length === 0 ? (
                <div className="empty-state">
                  <Search size={38} />
                  <h3>
                    {favoritesOnly
                      ? "Здесь будут любимые вещи"
                      : "Пока ничего не нашлось"}
                  </h3>
                  <p>
                    {favoritesOnly
                      ? "Нажмите на сердечко у понравившегося товара."
                      : "Попробуйте изменить фильтры или поисковый запрос."}
                  </p>
                  <button className="secondary" onClick={clearFilters}>
                    Показать все товары
                  </button>
                </div>
              ) : (
                <div className="product-grid">
                  {visible.map((p) => (
                    <article className="product-card" key={p.id}>
                      <div className="product-image">
                        <button
                          className="product-image-open"
                          onClick={() => openProduct(p)}
                          aria-label={`Открыть ${p.name}`}
                        >
                          <img
                            src={p.images[0] || "/images/placeholder.svg"}
                            onError={(e) => {
                              e.currentTarget.src = "/images/placeholder.svg";
                            }}
                            alt={p.name}
                            loading="lazy"
                          />
                        </button>
                        {p.badge && (
                          <span
                            className={`badge ${p.badge === "Новинка" ? "badge-new" : ""}`}
                          >
                            {p.badge}
                          </span>
                        )}
                        <button
                          className={`favorite-button ${favorites.includes(p.id) ? "is-favorite" : ""}`}
                          onClick={() => toggleFavorite(p.id)}
                          aria-label={
                            favorites.includes(p.id)
                              ? `Убрать ${p.name} из избранного`
                              : `Добавить ${p.name} в избранное`
                          }
                          aria-pressed={favorites.includes(p.id)}
                        >
                          <Heart
                            size={19}
                            fill={
                              favorites.includes(p.id) ? "currentColor" : "none"
                            }
                          />
                        </button>
                        {p.old_price && p.old_price > p.price && (
                          <span className="discount">
                            −{Math.round((1 - p.price / p.old_price) * 100)}%
                          </span>
                        )}
                      </div>
                      <div className="product-body">
                        <div className="product-price">
                          <strong>{money(p.price)}</strong>
                          {p.old_price && p.old_price > p.price && (
                            <del>{money(p.old_price)}</del>
                          )}
                        </div>
                        <button
                          className="product-name"
                          onClick={() => openProduct(p)}
                        >
                          {p.name}
                        </button>
                        <div className="product-meta">
                          {p.category} <span>·</span>{" "}
                          {p.sizes.length === 1
                            ? p.sizes[0]
                            : `${p.sizes[0]}–${p.sizes[p.sizes.length - 1]}`}
                        </div>
                        <button
                          className="add-button"
                          disabled={p.stock === 0}
                          onClick={() =>
                            p.sizes.length === 1
                              ? addToCart(p, p.sizes[0], p.colors[0])
                              : openProduct(p)
                          }
                        >
                          {p.stock === 0 ? (
                            "Нет в наличии"
                          ) : (
                            <>
                              <Plus size={16} />В корзину
                            </>
                          )}
                        </button>
                      </div>
                    </article>
                  ))}
                </div>
              )}
              <div className="catalog-bottom">
                <span>
                  {visible.length > 0
                    ? `Вы посмотрели все товары: ${visible.length}`
                    : "Свои вещи обязательно найдутся"}
                </span>
                <div className="tiny-rule" />
              </div>
            </div>
          </div>
        </section>
        <section className="closing-note">
          <span className="closing-icon">
            <ShoppingBag size={26} strokeWidth={1.3} />
          </span>
          <div>
            <h3>Вещи, к которым хочется возвращаться.</h3>
            <p>Без сложных сочетаний. Просто на каждый день.</p>
          </div>
          <button
            onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
            aria-label="Наверх"
          >
            <ArrowRight size={23} />
          </button>
        </section>
      </main>
      <footer>
        <div className="footer-mark">
          магазин<span>.</span>
          <p>Меньше лишнего. Больше вашего.</p>
        </div>
        <div className="footer-links">
          <button onClick={() => setInfo("Как заказать")}>Как заказать</button>
          <button onClick={() => setInfo("Доставка и оплата")}>
            Доставка и оплата
          </button>
          <button onClick={() => setAdminOpen(true)}>
            Панель владельца <ArrowRight size={13} />
          </button>
        </div>
        <span className="copyright">© {new Date().getFullYear()} Магазин</span>
      </footer>
      {selected && (
        <Modal title="Подробнее о товаре" wide onClose={closeProduct}>
          <div className="product-detail">
            <div className="detail-images">
              {selected.images.map((src, i) => (
                <img
                  src={src}
                  alt={`${selected.name}, фото ${i + 1}`}
                  key={src}
                  onError={(e) => {
                    e.currentTarget.src = "/images/placeholder.svg";
                  }}
                />
              ))}
            </div>
            <div className="detail-info">
              <span className="eyebrow muted">
                {selected.category} / {selected.type}
              </span>
              <h2>{selected.name}</h2>
              <div className="product-price detail-price">
                <strong>{money(selected.price)}</strong>
                {selected.old_price && <del>{money(selected.old_price)}</del>}
              </div>
              <p className="detail-description">{selected.description}</p>
              <label className="field-label">Цвет: {selectedColor}</label>
              <div className="variant-options">
                {selected.colors.map((c) => (
                  <button
                    key={c}
                    className={`variant ${selectedColor === c ? "active" : ""}`}
                    onClick={() => setSelectedColor(c)}
                  >
                    {c}
                  </button>
                ))}
              </div>
              <div className="size-label">
                <label className="field-label">
                  Размер{selectedSize ? `: ${selectedSize}` : ""}
                </label>
                <span className="muted small">Выберите свой</span>
              </div>
              <div className="size-options">
                {selected.sizes.map((s) => (
                  <button
                    key={s}
                    className={`size ${selectedSize === s ? "active" : ""}`}
                    aria-pressed={selectedSize === s}
                    onClick={() => setSelectedSize(s)}
                  >
                    {s}
                  </button>
                ))}
              </div>
              <div className="availability">
                <span
                  className={`status-dot ${selected.stock === 0 ? "out-of-stock" : ""}`}
                />
                {selected.stock > 0 ? "В наличии" : "Нет в наличии"}
              </div>
              <button
                className="primary full"
                disabled={selected.stock === 0}
                onClick={() => addToCart(selected, selectedSize, selectedColor)}
              >
                <ShoppingBag size={18} />
                Добавить в корзину
              </button>
              <button
                className="secondary full"
                onClick={() => toggleFavorite(selected.id)}
              >
                <Heart
                  size={17}
                  fill={
                    favorites.includes(selected.id) ? "currentColor" : "none"
                  }
                />
                {favorites.includes(selected.id)
                  ? "В избранном"
                  : "В избранное"}
              </button>
              {demoMode && (
                <p className="demo-caption">
                  Демонстрационный товар. Фотографии показывают пример
                  оформления каталога.
                </p>
              )}
            </div>
          </div>
        </Modal>
      )}
      {cartOpen && (
        <Modal
          title={
            success
              ? "Заявка оформлена"
              : checkout
                ? "Оформление заказа"
                : `Корзина${count ? ` · ${count}` : ""}`
          }
          drawer
          onClose={closeCart}
        >
          {success ? (
            <div className="order-success">
              <CheckCircle2 size={58} />
              <h3>
                {success.demo ? "Демо-заказ сохранён" : "Спасибо за заказ!"}
              </h3>
              <p>Заявка № {success.number}</p>
              <p className="muted">
                {success.demo
                  ? "Это пробный заказ. Он виден в панели владельца только в этом браузере."
                  : "Мы свяжемся с вами по указанному телефону, чтобы подтвердить заказ и согласовать получение."}
              </p>
              <button className="primary full" onClick={closeCart}>
                Продолжить покупки
              </button>
            </div>
          ) : !cart.length ? (
            <div className="empty-state cart-empty">
              <ShoppingBag size={48} />
              <h3>Здесь пока пусто</h3>
              <p>Добавьте вещи, которые вам понравились.</p>
              <button className="primary" onClick={closeCart}>
                Перейти к каталогу <ArrowRight size={16} />
              </button>
            </div>
          ) : checkout ? (
            <form className="checkout-form" onSubmit={placeOrder}>
              <button
                type="button"
                className="text-button back-button"
                onClick={() => setCheckout(false)}
              >
                ← Вернуться в корзину
              </button>
              {demoMode && (
                <div className="notice">
                  Демонстрация: заявка сохранится только в вашем браузере и не
                  будет отправлена продавцу.
                </div>
              )}
              <label>
                Ваше имя
                <input
                  required
                  autoComplete="name"
                  maxLength={100}
                  minLength={2}
                  value={customer.name}
                  onChange={(e) =>
                    setCustomer({ ...customer, name: e.target.value })
                  }
                  placeholder="Как к вам обращаться"
                />
              </label>
              <label>
                Телефон
                <input
                  required
                  type="tel"
                  autoComplete="tel"
                  maxLength={30}
                  value={customer.phone}
                  onChange={(e) =>
                    setCustomer({ ...customer, phone: e.target.value })
                  }
                  placeholder="+7 (999) 123-45-67"
                />
              </label>
              <fieldset>
                <legend>Получение</legend>
                <label className="radio-row">
                  <input
                    type="radio"
                    name="delivery"
                    checked={customer.delivery === "pickup"}
                    onChange={() =>
                      setCustomer({ ...customer, delivery: "pickup" })
                    }
                  />
                  Самовывоз <span className="muted">по договорённости</span>
                </label>
                <label className="radio-row">
                  <input
                    type="radio"
                    name="delivery"
                    checked={customer.delivery === "delivery"}
                    onChange={() =>
                      setCustomer({ ...customer, delivery: "delivery" })
                    }
                  />
                  Доставка <span className="muted">по договорённости</span>
                </label>
              </fieldset>
              {customer.delivery === "delivery" && (
                <label>
                  Адрес
                  <input
                    required
                    autoComplete="street-address"
                    maxLength={500}
                    value={customer.address}
                    onChange={(e) =>
                      setCustomer({ ...customer, address: e.target.value })
                    }
                    placeholder="Город, улица, дом"
                  />
                </label>
              )}
              <label>
                Комментарий <span className="muted">необязательно</span>
                <textarea
                  maxLength={1000}
                  rows={3}
                  value={customer.comment}
                  onChange={(e) =>
                    setCustomer({ ...customer, comment: e.target.value })
                  }
                  placeholder="Пожелания к заказу"
                />
              </label>
              <div className="checkout-total">
                <span>Стоимость товаров</span>
                <strong>{money(total)}</strong>
              </div>
              <p className="small muted">
                Оплата после подтверждения продавцом. Стоимость доставки
                согласуется отдельно.
              </p>
              <label className="check-row consent">
                <input type="checkbox" required />
                <span>
                  Разрешаю использовать мои имя и телефон для связи по этому
                  заказу.
                </span>
              </label>
              {checkoutError && (
                <div className="error-message" role="alert">
                  {checkoutError}
                </div>
              )}
              <button className="primary full" disabled={submitting}>
                {submitting
                  ? "Отправляем…"
                  : demoMode
                    ? "Сохранить демо-заказ"
                    : "Отправить заявку"}
                <ArrowRight size={17} />
              </button>
            </form>
          ) : (
            <>
              <div className="cart-items">
                {cart.map((item) => {
                  const p = products.find((p) => p.id === item.productId);
                  return (
                    <div className="cart-item" key={lineKey(item)}>
                      <img
                        src={p?.images[0] || "/images/placeholder.svg"}
                        alt={p?.name || "Товар недоступен"}
                      />
                      <div className="cart-item-info">
                        <h3>{p?.name || "Товар недоступен"}</h3>
                        <p>
                          {item.size} · {item.color}
                        </p>
                        {p && <strong>{money(p.price * item.quantity)}</strong>}
                        <div className="quantity">
                          <button
                            aria-label="Уменьшить количество"
                            onClick={() => changeQuantity(item, -1)}
                          >
                            <Minus size={13} />
                          </button>
                          <span>{item.quantity}</span>
                          <button
                            aria-label="Увеличить количество"
                            onClick={() => changeQuantity(item, 1)}
                          >
                            <Plus size={13} />
                          </button>
                        </div>
                      </div>
                      <button
                        className="icon-button remove-item"
                        aria-label="Удалить товар"
                        onClick={() =>
                          setCart((old) =>
                            old.filter((i) => lineKey(i) !== lineKey(item)),
                          )
                        }
                      >
                        <X size={16} />
                      </button>
                    </div>
                  );
                })}
              </div>
              <div className="cart-summary">
                <div>
                  <span>Итого</span>
                  <strong>{money(total)}</strong>
                </div>
                <p>Доставка и оплата — после подтверждения</p>
                <button
                  className="primary full"
                  onClick={() => {
                    try {
                      validateCart(cart, products);
                      setCheckout(true);
                    } catch (error) {
                      notify((error as Error).message);
                    }
                  }}
                >
                  Перейти к оформлению <ArrowRight size={17} />
                </button>
                <button className="text-button full" onClick={closeCart}>
                  Продолжить покупки
                </button>
              </div>
            </>
          )}
        </Modal>
      )}
      {filtersOpen && (
        <Modal title="Фильтры каталога" drawer onClose={closeFilters}>
          <div className="mobile-filter-content">
            {filters}
            <button className="primary full" onClick={closeFilters}>
              Показать товары · {visible.length}
            </button>
          </div>
        </Modal>
      )}
      {adminOpen && (
        <Admin
          onClose={closeAdmin}
          products={products}
          onProductsChange={setProducts}
          onReload={loadProducts}
          notify={notify}
        />
      )}
      {info && (
        <Modal title={info} onClose={closeInfo}>
          <div className="info-content">
            {info === "Как заказать" ? (
              <>
                <p>1. Выберите вещь, размер и цвет.</p>
                <p>2. Добавьте её в корзину и укажите имя и телефон.</p>
                <p>
                  3. После отправки заявки продавец свяжется с вами для
                  подтверждения и согласования получения.
                </p>
              </>
            ) : (
              <>
                <p>
                  Доступны самовывоз и доставка по договорённости с продавцом.
                </p>
                <p>
                  Адрес самовывоза, сроки, стоимость доставки и способ оплаты
                  согласуются при подтверждении заявки.
                </p>
                <p>Онлайн-оплата на сайте пока не подключена.</p>
              </>
            )}
            {demoMode && (
              <div className="notice">
                Сейчас открыт демонстрационный магазин. Реальные заказы не
                отправляются.
              </div>
            )}
          </div>
        </Modal>
      )}
      {toast && (
        <div className="toast" role="status">
          <Check size={17} />
          {toast}
        </div>
      )}
    </>
  );
}
