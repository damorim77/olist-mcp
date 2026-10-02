"""ETL Olist: Kaggle CSVs -> data/<table>/part-0000.parquet + manifest + categories.

Uso:
    python scripts/etl_olist.py [--csv-dir DIR] [--out-dir data]

Decisões (PLAN Fase 1 + itens 33/34/37):
- 7 tabelas (geolocation fora); orders com TODAS as colunas (sem poda).
- products.product_category_name em INGLÊS (join tradução); original em _pt.
- Arquivo único por tabela (glob HTTPS não funciona; N1). Lista explícita
  em src/generated/manifest.ts (sem listing em runtime).
- Timestamps naive (sem fuso) — serialização ISO sem Z.
- Licença CC BY-NC-SA 4.0: ver data/LICENSE-ATTRIBUTION.md (NC antes do push).
"""

from __future__ import annotations

import argparse
import os
import sys

import pandas as pd

TABLES = [
    "orders",
    "order_items",
    "products",
    "customers",
    "reviews",
    "order_payments",
    "sellers",
]

TS_COLS = {
    "orders": [
        "order_purchase_timestamp",
        "order_approved_at",
        "order_delivered_carrier_date",
        "order_delivered_customer_date",
        "order_estimated_delivery_date",
    ],
    "order_items": ["shipping_limit_date"],
    "reviews": ["review_creation_date", "review_answer_timestamp"],
}

ORDER_COLS = {
    "orders": ["order_id"],
    "order_items": ["order_id", "order_item_id"],
    "products": ["product_id"],
    "customers": ["customer_id"],
    "reviews": ["review_id"],
    "order_payments": ["order_id", "payment_sequential"],
    "sellers": ["seller_id"],
}


def load(csv_dir: str, name: str) -> pd.DataFrame:
    return pd.read_csv(os.path.join(csv_dir, name))


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--csv-dir", default=os.environ.get("OLIST_CSV_DIR", ""))
    ap.add_argument("--out-dir", default="data")
    ap.add_argument("--generated-dir", default="src/generated")
    args = ap.parse_args()
    if not args.csv_dir or not os.path.isdir(args.csv_dir):
        print("ERRO: informe --csv-dir com os 9 CSVs do Kaggle.", file=sys.stderr)
        return 1

    csv = args.csv_dir
    out: dict[str, pd.DataFrame] = {}

    out["orders"] = load(csv, "olist_orders_dataset.csv")
    out["order_items"] = load(csv, "olist_order_items_dataset.csv")
    products = load(csv, "olist_products_dataset.csv")
    translation = load(csv, "product_category_name_translation.csv")
    tmap = dict(
        zip(
            translation["product_category_name"],
            translation["product_category_name_english"],
        )
    )
    products["product_category_name_pt"] = products["product_category_name"]
    products["product_category_name"] = products[
        "product_category_name"
    ].map(tmap).fillna(products["product_category_name"])
    out["products"] = products
    out["customers"] = load(csv, "olist_customers_dataset.csv")
    out["reviews"] = load(csv, "olist_order_reviews_dataset.csv")
    out["order_payments"] = load(csv, "olist_order_payments_dataset.csv")
    out["sellers"] = load(csv, "olist_sellers_dataset.csv")

    # Timestamps naive (sem tz) + ordenação por PK.
    for table, cols in TS_COLS.items():
        for col in cols:
            out[table][col] = pd.to_datetime(out[table][col], errors="coerce")
    for table in TABLES:
        out[table] = out[table].sort_values(ORDER_COLS[table]).reset_index(
            drop=True
        )

    if out["reviews"]["review_score"].isnull().any():
        print("ERRO: review_score com NULL (esperado 1-5).", file=sys.stderr)
        return 1

    manifest: dict[str, list[str]] = {}
    for table in TABLES:
        tdir = os.path.join(args.out_dir, table)
        os.makedirs(tdir, exist_ok=True)
        # Remove part-* antigos (troca de layout não deixa entulho).
        for f in os.listdir(tdir):
            if f.endswith(".parquet"):
                os.remove(os.path.join(tdir, f))
        path = os.path.join(tdir, "part-0000.parquet")
        out[table].to_parquet(path, engine="pyarrow", compression="snappy", index=False)
        size_mb = os.path.getsize(path) / 1_000_000
        print(f"{table}: rows={len(out[table])} size={size_mb:.1f}MB")
        if size_mb > 20:
            print(f"ERRO: {table} > 20MB (limite jsDelivr).", file=sys.stderr)
            return 1
        manifest[table] = ["part-0000.parquet"]

    os.makedirs(args.generated_dir, exist_ok=True)
    with open(
        os.path.join(args.generated_dir, "manifest.ts"), "w", encoding="utf-8"
    ) as f:
        f.write("// Gerado por scripts/etl_olist.py — não editar à mão.\n")
        f.write("export const PARQUET_FILES: Record<string, string[]> = ")
        f.write(str({k: v for k, v in manifest.items()}).replace("'", '"'))
        f.write(";\n")

    cats = sorted(
        c
        for c in out["products"]["product_category_name"].dropna().unique()
        if c
    )
    os.makedirs("lib/db", exist_ok=True)
    with open("lib/db/categories.ts", "w", encoding="utf-8") as f:
        f.write("// Gerado por scripts/etl_olist.py — não editar à mão.\n")
        f.write("export const PRODUCT_CATEGORIES = [\n")
        for c in cats:
            f.write(f"  {c!r},\n".replace("'", '"'))
        f.write("] as const;\n")
    print(f"categories: {len(cats)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
