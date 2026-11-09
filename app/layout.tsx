import type { Metadata } from "next";
import "./globals.css";
const demo =
  process.env.NEXT_PUBLIC_DEMO_MODE === "true" ||
  !process.env.NEXT_PUBLIC_SUPABASE_URL ||
  !(
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );
export const metadata: Metadata = {
  title: "Каталог — одежда и аксессуары",
  description: "Одежда и аксессуары на каждый день. Выберите своё в каталоге.",
  robots: { index: !demo, follow: !demo },
};
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ru">
      <body>{children}</body>
    </html>
  );
}
