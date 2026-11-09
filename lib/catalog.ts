import type { CartItem, Product } from "./types";
export const money = (value: number) =>
  new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 0 }).format(value) +
  " ₽";
export const lineKey = (item: Pick<CartItem, "productId" | "size" | "color">) =>
  JSON.stringify([item.productId, item.size, item.color]);
export function cartTotal(cart: CartItem[], products: Product[]) {
  return cart.reduce(
    (total, item) =>
      total +
      (products.find((p) => p.id === item.productId)?.price ?? 0) *
        item.quantity,
    0,
  );
}
export function validateCart(cart: CartItem[], products: Product[]) {
  if (!cart.length) throw new Error("В корзине пока нет товаров");
  if (cart.length > 50)
    throw new Error("Допустимо до 50 позиций в одном заказе");
  const totals = new Map<string, number>();
  for (const item of cart) {
    const product = products.find((p) => p.id === item.productId && p.active);
    if (!product)
      throw new Error(
        "Один из товаров больше недоступен. Удалите его из корзины.",
      );
    if (
      !Number.isInteger(item.quantity) ||
      item.quantity < 1 ||
      item.quantity > 20
    )
      throw new Error("Допустимо от 1 до 20 единиц товара");
    if (
      !product.sizes.includes(item.size) ||
      !product.colors.includes(item.color)
    )
      throw new Error("Выбранный вариант больше недоступен");
    totals.set(
      item.productId,
      (totals.get(item.productId) ?? 0) + item.quantity,
    );
    if (totals.get(item.productId)! > product.stock)
      throw new Error(`Недостаточно товара «${product.name}»`);
  }
  return true;
}
export function filterProducts(
  products: Product[],
  filters: {
    query: string;
    category: string;
    types: string[];
    sizes: string[];
    min: string;
    max: string;
    sort: string;
    favoritesOnly: boolean;
    favorites: string[];
  },
) {
  let result = products.filter(
    (p) =>
      p.active &&
      (!filters.query ||
        `${p.name} ${p.type} ${p.description}`
          .toLowerCase()
          .includes(filters.query.toLowerCase().trim())) &&
      (filters.category === "Все товары" || p.category === filters.category) &&
      (!filters.types.length || filters.types.includes(p.type)) &&
      (!filters.sizes.length ||
        p.sizes.some((s) => filters.sizes.includes(s))) &&
      (!filters.min || p.price >= Number(filters.min)) &&
      (!filters.max || p.price <= Number(filters.max)) &&
      (!filters.favoritesOnly || filters.favorites.includes(p.id)),
  );
  result = [...result].sort((a, b) =>
    filters.sort === "price-asc"
      ? a.price - b.price
      : filters.sort === "price-desc"
        ? b.price - a.price
        : new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  );
  return result;
}
