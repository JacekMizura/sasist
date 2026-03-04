"""
Analysis Engine (czysta logika)

Nie zna:
- FastAPI
- SQLAlchemy
- global state

Przyjmuje DataFrame
Zwraca dict z wynikiem analizy
"""

import pandas as pd


def analyze_orders(orders_df: pd.DataFrame, products_df: pd.DataFrame):

    orders_id = "Identyfikator (ID)"
    orders_ean = "EAN"
    orders_qty = "Ilość"

    products_ean = "Kod EAN"
    length_col = "Wymiary opakowań"
    width_col = "Wymiary opakowań.1"
    height_col = "Wymiary opakowań.2"

    orders_df = orders_df.dropna(subset=[orders_id])
    orders_df[orders_qty] = pd.to_numeric(
        orders_df[orders_qty], errors="coerce"
    ).fillna(0)

    products_df = products_df.dropna(subset=[products_ean])

    merged = orders_df.merge(
        products_df,
        left_on=orders_ean,
        right_on=products_ean,
        how="left"
    )

    merged[length_col] = pd.to_numeric(merged[length_col], errors="coerce").fillna(0)
    merged[width_col] = pd.to_numeric(merged[width_col], errors="coerce").fillna(0)
    merged[height_col] = pd.to_numeric(merged[height_col], errors="coerce").fillna(0)

    merged["line_volume"] = (
        merged[length_col]
        * merged[width_col]
        * merged[height_col]
        * merged[orders_qty]
    )

    grouped = merged.groupby(orders_id)

    single = []
    multi = []
    order_volumes = {}
    orders_details = {}

    for order_id, group in grouped:

        real = group[
            (group[orders_ean].notna()) &
            (group[orders_qty] > 0)
        ]

        total_volume = float(group["line_volume"].sum())
        order_volumes[str(order_id)] = total_volume

        details = []

        for _, row in real.iterrows():
            details.append({
                "ean": str(row[orders_ean]).replace(".0", ""),
                "qty": float(row[orders_qty]),
                "length": float(row[length_col]),
                "width": float(row[width_col]),
                "height": float(row[height_col]),
                "line_volume": float(row["line_volume"])
            })

        orders_details[str(order_id)] = details

        if len(details) == 1:
            single.append(order_id)
        else:
            multi.append(order_id)

    return {
        "single_count": len(single),
        "multi_count": len(multi),
        "order_volumes": order_volumes,
        "orders_details": orders_details
    }
