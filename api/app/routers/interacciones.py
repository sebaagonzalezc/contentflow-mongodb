from fastapi import APIRouter
from pymongo import ReturnDocument

from ..comun import ahora, exigir_referencia, nuevo_id, obtener
from ..db import get_db
from ..errors import NoEncontrado
from ..schemas import ComentarioIn, ReaccionIn

router = APIRouter(tags=["interacciones"])


@router.post("/comentarios", status_code=201)
def crear_comentario(body: ComentarioIn):
    exigir_referencia("usuarios", "usuario_id", body.usuario_id)
    exigir_referencia("publicaciones", "publicacion_id", body.publicacion_id)
    doc = {"_id": nuevo_id("comm"), **body.model_dump(), "fecha": ahora(), "likes": 0}
    get_db().comentarios.insert_one(doc)
    return doc


@router.post("/comentarios/{comentario_id}/like")
def dar_like(comentario_id: str):
    doc = get_db().comentarios.find_one_and_update(
        {"_id": comentario_id}, {"$inc": {"likes": 1}}, return_document=ReturnDocument.AFTER)
    if doc is None:
        raise NoEncontrado("comentarios", comentario_id)
    return doc


@router.delete("/comentarios/{comentario_id}")
def eliminar_comentario(comentario_id: str):
    if get_db().comentarios.delete_one({"_id": comentario_id}).deleted_count == 0:
        raise NoEncontrado("comentarios", comentario_id)
    return {"eliminado": comentario_id}


@router.get("/reacciones/{reaccion_id}")
def obtener_reaccion(reaccion_id: str):
    return obtener("reacciones", reaccion_id)


@router.post("/reacciones", status_code=201)
def crear_reaccion(body: ReaccionIn):
    exigir_referencia("usuarios", "usuario_id", body.usuario_id)
    exigir_referencia("publicaciones", "publicacion_id", body.publicacion_id)
    doc = {"_id": nuevo_id("react"), **body.model_dump(), "fecha": ahora()}
    # indice unico (usuario_id, publicacion_id): segunda reaccion -> 409
    get_db().reacciones.insert_one(doc)
    return doc


@router.delete("/reacciones/{reaccion_id}")
def eliminar_reaccion(reaccion_id: str):
    if get_db().reacciones.delete_one({"_id": reaccion_id}).deleted_count == 0:
        raise NoEncontrado("reacciones", reaccion_id)
    return {"eliminada": reaccion_id}
