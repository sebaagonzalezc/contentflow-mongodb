from fastapi import APIRouter, Query

from ..comun import ahora, nuevo_id, obtener
from ..db import get_db
from ..schemas import Dispositivo, Genero, UsuarioIn

router = APIRouter(prefix="/usuarios", tags=["usuarios"])


@router.get("")
def listar_usuarios(pais: str | None = None, dispositivo: Dispositivo | None = None,
                    genero: Genero | None = None,
                    limit: int = Query(20, ge=1, le=100), skip: int = Query(0, ge=0)):
    filtro = {k: v for k, v in {"pais": pais, "dispositivo": dispositivo, "genero": genero}.items() if v}
    col = get_db().usuarios
    return {"total": col.count_documents(filtro),
            "items": list(col.find(filtro).sort("_id", 1).skip(skip).limit(limit))}


@router.get("/{usuario_id}")
def obtener_usuario(usuario_id: str):
    return obtener("usuarios", usuario_id)


@router.get("/{usuario_id}/publicaciones")
def publicaciones_de_usuario(usuario_id: str, limit: int = Query(20, ge=1, le=100)):
    obtener("usuarios", usuario_id, {"_id": 1})
    return list(get_db().publicaciones.find({"usuario_id": usuario_id})
                .sort("fecha_publicacion", -1).limit(limit))


@router.post("", status_code=201)
def crear_usuario(body: UsuarioIn):
    doc = {"_id": nuevo_id("user"), **body.model_dump(), "fecha_registro": ahora()}
    doc["correo"] = doc["correo"].lower()
    get_db().usuarios.insert_one(doc)   # correo duplicado -> DuplicateKeyError -> 409
    return doc
