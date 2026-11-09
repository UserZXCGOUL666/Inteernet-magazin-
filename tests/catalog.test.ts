import { test } from "node:test";
import assert from "node:assert/strict";
import {
  cartTotal,
  filterProducts,
  lineKey,
  validateCart,
} from "../lib/catalog";
import { demoProducts } from "../lib/data";
const defaults = {
  query: "",
  category: "Все товары",
  types: [] as string[],
  sizes: [] as string[],
  min: "",
  max: "",
  sort: "new",
  favoritesOnly: false,
  favorites: [] as string[],
};
test("catalog combines category, price, size and search filters", () => {
  const result = filterProducts(demoProducts, {
    ...defaults,
    query: "футболка",
    category: "Унисекс",
    min: "1500",
    max: "2000",
    sizes: ["XL"],
  });
  assert.deepEqual(
    result.map((p) => p.id),
    ["demo-1"],
  );
});
test("favorites never expose hidden products", () => {
  const result = filterProducts(
    [{ ...demoProducts[0], active: false }, demoProducts[1]],
    { ...defaults, favoritesOnly: true, favorites: ["demo-1", "demo-2"] },
  );
  assert.deepEqual(
    result.map((p) => p.id),
    ["demo-2"],
  );
});
test("price sort is numeric", () => {
  const result = filterProducts(demoProducts, {
    ...defaults,
    sort: "price-asc",
  });
  assert.ok(result.every((p, i) => i === 0 || p.price >= result[i - 1].price));
});
test("stock is aggregated across sizes of the same product", () => {
  const products = [{ ...demoProducts[0], stock: 3 }];
  assert.throws(
    () =>
      validateCart(
        [
          { productId: "demo-1", size: "S", color: "Молочный", quantity: 2 },
          { productId: "demo-1", size: "M", color: "Молочный", quantity: 2 },
        ],
        products,
      ),
    /Недостаточно/,
  );
});
test("removed variants, hidden products, zero or fractional quantity cannot be ordered", () => {
  const line = {
    productId: "demo-1",
    size: "S",
    color: "Молочный",
    quantity: 1,
  };
  assert.throws(
    () => validateCart([{ ...line, size: "XXXL" }], demoProducts),
    /вариант/,
  );
  assert.throws(
    () => validateCart([line], [{ ...demoProducts[0], active: false }]),
    /недоступен/,
  );
  for (const quantity of [0, -1, 1.5, 21])
    assert.throws(
      () => validateCart([{ ...line, quantity }], demoProducts),
      /единиц/,
    );
});
test("totals use current catalog prices and include quantity", () => {
  assert.equal(
    cartTotal(
      [{ productId: "demo-1", size: "M", color: "Молочный", quantity: 2 }],
      demoProducts,
    ),
    3780,
  );
});
test("variant keys include color and cannot collide through punctuation", () => {
  assert.notEqual(
    lineKey({ productId: "a-b", size: "c", color: "d" }),
    lineKey({ productId: "a", size: "b-c", color: "d" }),
  );
  assert.notEqual(
    lineKey({ productId: "a", size: "S", color: "Белый" }),
    lineKey({ productId: "a", size: "S", color: "Чёрный" }),
  );
});
