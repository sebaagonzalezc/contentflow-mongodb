"""Conexion a MongoDB Atlas con pymongo.

Nivel de consistencia elegido (documentado en el informe):
- write concern "majority" + journal: una escritura se confirma cuando la
  mayoria de los 3 nodos del replica set la tiene en disco. Es el valor por
  defecto de MongoDB 5.0+ y Atlas; se fija explicito para no depender de ello.
- read concern "majority": las lecturas solo devuelven datos ya confirmados
  por la mayoria, asi la API nunca muestra algo que pueda revertirse (rollback).
"""
import logging
import time

from pymongo import MongoClient
from pymongo.database import Database

from .config import settings

log = logging.getLogger("contentflow.db")

_client: MongoClient | None = None


def connect() -> MongoClient:
    global _client
    if not settings.mongodb_uri:
        raise RuntimeError("Falta la variable de entorno MONGODB_URI (ver .env.example)")
    _client = MongoClient(
        settings.mongodb_uri,
        appname="contentflow-api",
        serverSelectionTimeoutMS=settings.server_selection_timeout_ms,
        w="majority",
        journal=True,
        readConcernLevel="majority",
        retryWrites=True,
        tz_aware=True,
    )
    log.info("Cliente MongoDB creado (db=%s)", settings.mongodb_db)
    return _client


def close() -> None:
    if _client is not None:
        _client.close()
        log.info("Cliente MongoDB cerrado")


def get_db() -> Database:
    if _client is None:
        connect()
    return _client[settings.mongodb_db]


def ping() -> float:
    """Prueba de conectividad: devuelve la latencia en ms o lanza excepcion."""
    t0 = time.perf_counter()
    get_db().command("ping")
    return round((time.perf_counter() - t0) * 1000, 1)
