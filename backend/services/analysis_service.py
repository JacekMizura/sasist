"""
Analysis Service
================

Odpowiada za:
- wczytanie CSV
- uruchomienie analysis_engine
- uruchomienie simulation_service
- zwrócenie pełnego wyniku

Brak kodu HTTP.
Brak global state.
"""

import pandas as pd
from sqlalchemy.orm import Session
from ..domain.analysis_engine import analyze_orders
from ..services.simulation_service import SimulationService


class AnalysisService:

    def __init__(self, db: Session):
        self.db = db

    def run_analysis(self, orders_file, products_file):
        """
        orders_file, products_file = pliki UploadFile z FastAPI
        """

        # Wczytanie CSV do DataFrame
        orders_df = pd.read_csv(orders_file.file, sep=";")
        products_df = pd.read_csv(products_file.file, sep=";")

        # 1️⃣ Analiza zamówień
        analysis_result = analyze_orders(orders_df, products_df)

        order_volumes = analysis_result["order_volumes"]

        # 2️⃣ Symulacja infrastruktury
        simulation_service = SimulationService(self.db)
        simulation_result = simulation_service.simulate(order_volumes)

        # 3️⃣ Zwracamy połączony wynik
        return {
            "analysis": analysis_result,
            "simulation": simulation_result
        }
