"""API REST de ContentFlow conectada a MongoDB Atlas.

Ejecutar (desde la carpeta api/):
    uvicorn app.main:app --reload
Documentacion interactiva: http://127.0.0.1:8000/docs
"""
import logging
import time
import uuid
from contextlib import asynccontextmanager
from logging.handlers import RotatingFileHandler
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

from . import db
from .config import settings
from .errors import registrar_manejadores
from .routers import interacciones, publicaciones, reportes, usuarios


def configurar_logs() -> None:
    Path(settings.log_file).parent.mkdir(parents=True, exist_ok=True)
    fmt = logging.Formatter("%(asctime)s %(levelname)s %(name)s %(message)s")
    archivo = RotatingFileHandler(settings.log_file, maxBytes=1_000_000, backupCount=3, encoding="utf-8")
    consola = logging.StreamHandler()
    for h in (archivo, consola):
        h.setFormatter(fmt)
    raiz = logging.getLogger("contentflow")
    raiz.setLevel(settings.log_level)
    raiz.handlers = [archivo, consola]


configurar_logs()
log = logging.getLogger("contentflow.api")


@asynccontextmanager
async def lifespan(app: FastAPI):
    db.connect()
    try:  # prueba de conectividad al iniciar: no detiene la API, pero queda en el log
        log.info("Conexion a MongoDB OK (ping %.1f ms)", db.ping())
    except Exception as e:  # noqa: BLE001
        log.error("No se pudo conectar a MongoDB al iniciar: %s", e)
    yield
    db.close()


app = FastAPI(title="ContentFlow API", version="1.0.0",
              description="API REST sobre MongoDB Atlas para ContentFlow (Forma A)",
              lifespan=lifespan)
registrar_manejadores(app)


@app.middleware("http")
async def registro_de_actividad(request: Request, call_next):
    """Log de actividad: cada request queda con id, metodo, ruta, estado y duracion."""
    request.state.request_id = uuid.uuid4().hex[:8]
    t0 = time.perf_counter()
    response = await call_next(request)
    ms = (time.perf_counter() - t0) * 1000
    log.info("rid=%s %s %s -> %s (%.1f ms)", request.state.request_id, request.method,
             request.url.path, response.status_code, ms)
    response.headers["X-Request-ID"] = request.state.request_id
    return response


@app.get("/health", tags=["salud"])
def health():
    """Prueba de conectividad con la base de datos (ping)."""
    try:
        latencia = db.ping()
        return {"status": "ok", "base_de_datos": settings.mongodb_db, "ping_ms": latencia}
    except Exception as e:  # noqa: BLE001
        log.error("health: sin conexion a MongoDB: %s", e)
        return JSONResponse(status_code=503, content={"status": "error", "detalle": str(e)[:200]})


app.include_router(usuarios.router)
app.include_router(publicaciones.router)
app.include_router(interacciones.router)
app.include_router(reportes.router)
