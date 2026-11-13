from datetime import datetime

from fastapi import APIRouter, Query

from ..comun import ahora, exigir_referencia, nuevo_id, obtener
from ..db import get_db
from ..errors import NoEncontrado
from ..schemas import Categoria, PublicacionIn, PublicacionPatch, TipoPublicacion

router = APIRouter(prefix="/publicaciones", tags=["publicaciones"])


@router.get("")
def listar_publicaciones(categoria: Categoria | None = None, tipo: TipoPublicacion | None = None,
                         hashtag: str | None = None, desde: datetime | None = None,
                         hasta: datetime | None = None,
                         limit: int = Query(20, ge=1, le=100), skip: int = Query(0, ge=0)):
    filtro: dict = {}
    if categoria:
        filtro["categoria"] = categoria
    if tipo:
        filtro["tipo"] = tipo
    if hashtag:
        filtro["hashtags"] = hashtag if hashtag.startswith("#") else f"#{hashtag}"
    if desde or hasta:
        filtro["fecha_publicacion"] = {k: v for k, v in {"$gte": desde, "$lte": hasta}.items() if v}
    col = get_db().publicaciones
    return {"total": col.count_documents(filtro),
            "items": list(col.find(filtro).sort("fecha_publicacion", -1).skip(skip).limit(limit))}


@router.get("/{publicacion_id}")
def obtener_publicacion(publicacion_id: str):
    """Publicacion con conteo de reacciones por tipo y numero de comentarios."""
    res = list(get_db().publicaciones.aggregate([
        {"$match": {"_id": publicacion_id}},
        {"$lookup": {"from": "reacciones", "localField": "_id", "foreignField": "publicacion_id",
                     "as": "r", "pipeline": [{"$group": {"_id": "$tipo_reaccion", "n": {"$sum": 1}}}]}},
        {"$lookup": {"from": "comentarios", "localField": "_id", "foreignField": "publicacion_id",
                     "as": "c", "pipeline": [{"$project": {"_id": 1}}]}},
        {"$addFields": {"reacciones": {"$arrayToObject": {"$map": {
            "input": "$r", "as": "x", "in": {"k": "$$x._id", "v": "$$x.n"}}}},
            "n_comentarios": {"$size": "$c"}}},
        {"$project": {"r": 0, "c": 0}},
    ]))
    if not res:
        raise NoEncontrado("publicaciones", publicacion_id)
    return res[0]


@router.get("/{publicacion_id}/comentarios")
def comentarios_de_publicacion(publicacion_id: str, limit: int = Query(20, ge=1, le=100)):
    obtener("publicaciones", publicacion_id, {"_id": 1})
    return list(get_db().comentarios.find({"publicacion_id": publicacion_id})
                .sort("fecha", -1).limit(limit))


@router.post("", status_code=201)
def crear_publicacion(body: PublicacionIn):
    exigir_referencia("usuarios", "usuario_id", body.usuario_id)
    doc = {"_id": nuevo_id("pub"), **body.model_dump(), "fecha_publicacion": ahora()}
    get_db().publicaciones.insert_one(doc)
    return doc


@router.patch("/{publicacion_id}")
def actualizar_publicacion(publicacion_id: str, body: PublicacionPatch):
    cambios = body.model_dump(exclude_none=True)
    update: dict = {"$set": {"editado": ahora()}}
    if "contenido" in cambios:
        update["$set"]["contenido"] = cambios["contenido"]
    if "categoria" in cambios:
        update["$set"]["categoria"] = cambios["categoria"]
    if cambios.get("agregar_hashtags"):
        update["$addToSet"] = {"hashtags": {"$each": cambios["agregar_hashtags"]}}
    r = get_db().publicaciones.update_one({"_id": publicacion_id}, update)
    if r.matched_count == 0:
        raise NoEncontrado("publicaciones", publicacion_id)
    return obtener("publicaciones", publicacion_id)


@router.delete("/{publicacion_id}")
def eliminar_publicacion(publicacion_id: str):
    """Borrado en cascada: comentarios, reacciones y referencias en campanas."""
    d = get_db()
    obtener("publicaciones", publicacion_id, {"_id": 1})
    c = d.comentarios.delete_many({"publicacion_id": publicacion_id}).deleted_count
    r = d.reacciones.delete_many({"publicacion_id": publicacion_id}).deleted_count
    k = d.campanas.update_many({"publicaciones_asociadas": publicacion_id},
                               {"$pull": {"publicaciones_asociadas": publicacion_id}}).modified_count
    d.publicaciones.delete_one({"_id": publicacion_id})
    return {"eliminada": publicacion_id, "comentarios_eliminados": c,
            "reacciones_eliminadas": r, "campanas_actualizadas": k}
