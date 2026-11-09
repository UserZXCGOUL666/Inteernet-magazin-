export type Product = {
  id: string;
  name: string;
  description: string;
  category: string;
  type: string;
  price: number;
  old_price: number | null;
  images: string[];
  sizes: string[];
  colors: string[];
  stock: number;
  badge: string;
  active: boolean;
  created_at: string;
};
export type CartItem = {
  productId: string;
  size: string;
  color: string;
  quantity: number;
};
export type Customer = {
  name: string;
  phone: string;
  delivery: "pickup" | "delivery";
  address: string;
  comment: string;
};
export type Order = {
  id: string;
  number: number;
  customer_name: string;
  phone: string;
  delivery: "pickup" | "delivery";
  address: string;
  comment: string;
  total: number;
  status: "new" | "confirmed" | "completed" | "cancelled";
  created_at: string;
  order_items: {
    product_id?: string;
    name: string;
    size: string;
    color: string;
    price: number;
    quantity: number;
  }[];
};
export const categories = [
  "Все товары",
  "Женщинам",
  "Мужчинам",
  "Унисекс",
  "Аксессуары",
];
export const productTypes = [
  "Футболки",
  "Худи и свитшоты",
  "Брюки и джинсы",
  "Верхняя одежда",
  "Обувь",
  "Сумки и аксессуары",
  "Трикотаж",
];
export const allSizes = ["XS", "S", "M", "L", "XL", "XXL", "ONE SIZE"];
