import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

test("database authorization and atomic order lifecycle", async (t) => {
  const db = new PGlite();
  const owner = "00000000-0000-0000-0000-000000000001",
    stranger = "00000000-0000-0000-0000-000000000002";
  const product = "10000000-0000-0000-0000-000000000001";
  const request = "20000000-0000-0000-0000-000000000001";
  try {
    await db.exec(`create role anon;create role authenticated;create schema auth;create schema storage;
   create table auth.users(id uuid primary key);
   create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
   grant usage on schema auth to anon,authenticated;grant execute on function auth.uid() to anon,authenticated;
   create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
   create table storage.objects(id uuid default gen_random_uuid(),bucket_id text,name text);
   alter table storage.objects enable row level security;
   grant usage on schema storage to anon,authenticated;
   grant select,insert,delete on storage.objects to authenticated;`);
    await db.exec(
      await readFile(
        new URL("../supabase/schema.sql", import.meta.url),
        "utf8",
      ),
    );
    await db.query("insert into auth.users(id) values ($1),($2)", [
      owner,
      stranger,
    ]);
    await db.query("insert into public.store_admins(user_id) values ($1)", [
      owner,
    ]);
    await db.query(
      `insert into public.products(id,name,category,type,price,images,sizes,colors,stock) values ($1,'Тестовая футболка','Унисекс','Футболки',1890,array['https://example.com/photo.jpg'],array['S','M'],array['Белый'],5)`,
      [product],
    );
    await db.query(
      `insert into public.products(name,category,type,price,images,sizes,colors,stock,active) values ('Скрытая вещь','Унисекс','Футболки',1000,array['https://example.com/hidden.jpg'],array['S'],array['Белый'],1,false)`,
    );
    await t.test(
      "guests only read published products and cannot change the catalog",
      async () => {
        await db.exec("set role anon");
        assert.equal(
          (await db.query("select * from public.products")).rows.length,
          1,
        );
        await assert.rejects(
          db.query("update public.products set price=1"),
          /permission denied/,
        );
        await assert.rejects(
          db.query("select * from public.orders"),
          /permission denied/,
        );
        await db.exec("reset role");
      },
    );
    await t.test(
      "a signed-in non-owner cannot promote themself or write products",
      async () => {
        await db.exec("set role authenticated");
        await db.query("select set_config('request.jwt.claim.sub',$1,false)", [
          stranger,
        ]);
        assert.equal(
          (await db.query("select * from public.store_admins")).rows.length,
          0,
        );
        await assert.rejects(
          db.query("insert into public.store_admins(user_id) values ($1)", [
            stranger,
          ]),
          /permission denied/,
        );
        assert.equal(
          (await db.query("update public.products set price=1 returning id"))
            .rows.length,
          0,
        );
        assert.equal(
          (await db.query("select * from public.orders")).rows.length,
          0,
        );
        await db.exec("reset role");
        await db.exec("select set_config('request.jwt.claim.sub','',false)");
      },
    );
    await t.test(
      "photo storage only accepts uploads from the owner",
      async () => {
        await db.exec("set role anon");
        await assert.rejects(
          db.query(
            "insert into storage.objects(bucket_id,name) values ('product-images','forbidden.webp')",
          ),
          /permission denied/,
        );
        await db.exec("reset role");
        await db.exec("set role authenticated");
        await db.query("select set_config('request.jwt.claim.sub',$1,false)", [
          stranger,
        ]);
        await assert.rejects(
          db.query(
            "insert into storage.objects(bucket_id,name) values ('product-images','forbidden.webp')",
          ),
          /row-level security/,
        );
        await db.query("select set_config('request.jwt.claim.sub',$1,false)", [
          owner,
        ]);
        await db.query(
          "insert into storage.objects(bucket_id,name) values ('product-images','allowed.webp')",
        );
        assert.equal(
          (await db.query("select * from storage.objects")).rows.length,
          1,
        );
        await db.exec("reset role");
        await db.exec("select set_config('request.jwt.claim.sub','',false)");
      },
    );
    const customer = {
      name: "Тестовый покупатель",
      phone: "+7 (999) 123-45-67",
      delivery: "pickup",
      address: "",
      comment: "",
    };
    const items = [
      { product_id: product, size: "M", color: "Белый", quantity: 2, price: 1 },
    ];
    let number: number;
    await t.test(
      "anonymous order calculates prices in the database and reserves stock",
      async () => {
        await db.exec("set role anon");
        const result = await db.query<{ result: { number: number } }>(
          "select public.place_order($1::jsonb,$2::jsonb,$3::uuid) result",
          [JSON.stringify(customer), JSON.stringify(items), request],
        );
        number = result.rows[0].result.number;
        assert.equal(number, 1001);
        await db.exec("reset role");
        assert.equal(
          (
            await db.query<{ stock: number }>(
              "select stock from public.products where id=$1",
              [product],
            )
          ).rows[0].stock,
          3,
        );
        assert.equal(
          Number(
            (
              await db.query<{ total: number }>(
                "select total from public.orders",
              )
            ).rows[0].total,
          ),
          3780,
        );
      },
    );
    await t.test(
      "retrying the same request does not create another order or reserve twice",
      async () => {
        await db.exec("set role anon");
        const result = await db.query<{ result: { number: number } }>(
          "select public.place_order($1::jsonb,$2::jsonb,$3::uuid) result",
          [JSON.stringify(customer), JSON.stringify(items), request],
        );
        assert.equal(result.rows[0].result.number, number!);
        await db.exec("reset role");
        assert.equal(
          (await db.query("select * from public.orders")).rows.length,
          1,
        );
        assert.equal(
          (
            await db.query<{ stock: number }>(
              "select stock from public.products where id=$1",
              [product],
            )
          ).rows[0].stock,
          3,
        );
      },
    );
    await t.test(
      "combined size variants cannot oversell and invalid variants fully roll back",
      async () => {
        await db.exec("set role anon");
        const over = [
          { ...items[0], size: "S", quantity: 2 },
          { ...items[0], size: "M", quantity: 2 },
        ];
        await assert.rejects(
          db.query("select public.place_order($1::jsonb,$2::jsonb,$3::uuid)", [
            JSON.stringify(customer),
            JSON.stringify(over),
            crypto.randomUUID(),
          ]),
          /Недостаточно/,
        );
        await assert.rejects(
          db.query("select public.place_order($1::jsonb,$2::jsonb,$3::uuid)", [
            JSON.stringify(customer),
            JSON.stringify([{ ...items[0], size: "XXL" }]),
            crypto.randomUUID(),
          ]),
          /вариант недоступен/,
        );
        await db.exec("reset role");
        assert.equal(
          (await db.query("select * from public.orders")).rows.length,
          1,
        );
        assert.equal(
          (
            await db.query<{ stock: number }>(
              "select stock from public.products where id=$1",
              [product],
            )
          ).rows[0].stock,
          3,
        );
      },
    );
    await t.test(
      "only owner may change status; cancellation restores stock exactly once",
      async () => {
        const order = (
          await db.query<{ id: string }>("select id from public.orders")
        ).rows[0];
        await db.exec("set role authenticated");
        await db.query("select set_config('request.jwt.claim.sub',$1,false)", [
          stranger,
        ]);
        await assert.rejects(
          db.query("select public.set_order_status($1,'cancelled')", [
            order.id,
          ]),
          /Нет доступа/,
        );
        await db.query("select set_config('request.jwt.claim.sub',$1,false)", [
          owner,
        ]);
        assert.equal(
          (await db.query("select * from public.products")).rows.length,
          2,
        );
        assert.equal(
          (await db.query("select * from public.orders")).rows.length,
          1,
        );
        await db.query("select public.set_order_status($1,'cancelled')", [
          order.id,
        ]);
        await db.query("select public.set_order_status($1,'cancelled')", [
          order.id,
        ]);
        await assert.rejects(
          db.query("select public.set_order_status($1,'new')", [order.id]),
          /нельзя открыть/,
        );
        assert.equal(
          (
            await db.query<{ stock: number }>(
              "select stock from public.products where id=$1",
              [product],
            )
          ).rows[0].stock,
          5,
        );
        await db.exec("reset role");
      },
    );
  } finally {
    await db.close();
  }
});
