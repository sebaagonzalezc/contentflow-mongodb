"""Configuracion leida desde variables de entorno (archivo .env en desarrollo).

El string de conexion NUNCA se escribe en el codigo: se toma de MONGODB_URI.
"""
import os

from dotenv import load_dotenv

load_dotenv()  # carga api/.env si existe; en produccion se usan variables reales


class Settings:
    mongodb_uri: str = os.getenv("MONGODB_URI", "")
    mongodb_db: str = os.getenv("MONGODB_DB", "contentflow")
    log_level: str = os.getenv("LOG_LEVEL", "INFO")
    log_file: str = os.getenv("LOG_FILE", "logs/api.log")
    # Tiempo maximo para encontrar un nodo del cluster antes de fallar (ms)
    server_selection_timeout_ms: int = int(os.getenv("MONGODB_TIMEOUT_MS", "5000"))


settings = Settings()
