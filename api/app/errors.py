"""Manejo centralizado de errores: cada excepcion se traduce a un codigo HTTP
y a un cuerpo JSON uniforme {"error", "detalle", "request_id"}, y se registra
en el log con el request_id para poder rastrearla (trazabilidad)."""
import logging

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from pymongo.errors import (AutoReconnect, ConnectionFailure, DuplicateKeyError,
                            NetworkTimeout, PyMongoError, ServerSelectionTimeoutError)

log = logging.getLogger("contentflow.errors")


class NoEncontrado(Exception):
    def __init__(self, coleccion: str, id_: str):
        self.coleccion, self.id = coleccion, id_


class ReferenciaInvalida(Exception):
    def __init__(self, campo: str, valor: str):
        self.campo, self.valor = campo, valor


def _resp(request: Request, status: int, error: str, detalle) -> JSONResponse:
    rid = getattr(request.state, "request_id", "-")
    return JSONResponse(status_code=status,
                        content={"error": error, "detalle": detalle, "request_id": rid})


def registrar_manejadores(app: FastAPI) -> None:
    @app.exception_handler(NoEncontrado)
    async def no_encontrado(request: Request, exc: NoEncontrado):
        log.info("404 %s/%s no existe", exc.coleccion, exc.id)
        return _resp(request, 404, "no_encontrado", f"No existe {exc.coleccion} con _id '{exc.id}'")

    @app.exception_handler(ReferenciaInvalida)
    async def ref_invalida(request: Request, exc: ReferenciaInvalida):
        log.warning("422 referencia invalida %s=%s", exc.campo, exc.valor)
        return _resp(request, 422, "referencia_invalida",
                     f"{exc.campo} '{exc.valor}' no existe en la base de datos")

    @app.exception_handler(RequestValidationError)
    async def validacion(request: Request, exc: RequestValidationError):
        errores = [{"campo": ".".join(str(p) for p in e["loc"][1:]), "mensaje": e["msg"]}
                   for e in exc.errors()]
        log.warning("422 validacion %s %s: %s", request.method, request.url.path, errores)
        return _resp(request, 422, "validacion", errores)

    @app.exception_handler(DuplicateKeyError)
    async def duplicado(request: Request, exc: DuplicateKeyError):
        clave = (exc.details or {}).get("keyValue")
        log.warning("409 clave duplicada %s", clave)
        return _resp(request, 409, "clave_duplicada", {"clave": clave})

    async def sin_conexion(request: Request, exc: Exception):
        log.error("503 sin conexion a MongoDB: %s", exc)
        return _resp(request, 503, "base_de_datos_no_disponible",
                     "No se pudo conectar a MongoDB Atlas. Revise red, Network Access o credenciales.")

    for tipo in (ServerSelectionTimeoutError, ConnectionFailure, AutoReconnect, NetworkTimeout):
        app.add_exception_handler(tipo, sin_conexion)

    @app.exception_handler(PyMongoError)
    async def mongo(request: Request, exc: PyMongoError):
        log.exception("500 error de MongoDB")
        return _resp(request, 500, "error_base_de_datos", str(exc)[:300])

    @app.exception_handler(Exception)
    async def generico(request: Request, exc: Exception):
        log.exception("500 error no controlado")
        return _resp(request, 500, "error_interno", "Error inesperado; ver logs con el request_id")
