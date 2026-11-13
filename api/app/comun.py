"""Utilidades compartidas por los routers."""
import uuid
from datetime import datetime, timezone

from .db import get_db
from .errors import NoEncontrado, ReferenciaInvalida


def nuevo_id(prefijo: str) -> str:
    """_id de texto con el mismo estilo del dataset (ej. user_..., pub_...)."""
    return f"{prefijo}_{uuid.uuid4().hex[:10]}"


def ahora() -> datetime:
    return datetime.now(timezone.utc)


def obtener(coleccion: str, id_: str, proyeccion: dict | None = None) -> dict:
    doc = get_db()[coleccion].find_one({"_id": id_}, proyeccion)
    if doc is None:
        raise NoEncontrado(coleccion, id_)
    return doc


def exigir_referencia(coleccion: str, campo: str, valor: str) -> None:
    """Valida que una referencia (usuario_id, publicacion_id) exista antes de escribir."""
    if get_db()[coleccion].count_documents({"_id": valor}, limit=1) == 0:
        raise ReferenciaInvalida(campo, valor)
