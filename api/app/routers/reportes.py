"""Reportes para la gerencia (agregaciones de lectura)."""
from fastapi import APIRouter, Query

from ..comun import obtener
from ..db import get_db

router = APIRouter(prefix="/reportes", tags=["reportes"])


@router.get("/usuarios-activos")
def usuarios_activos(limit: int = Query(10, ge=1, le=50)):
    return list(get_db().publicaciones.aggregate([
        {"$project": {"usuario_id": 1}},
        {"$unionWith": {"coll": "reacciones", "pipeline": [{"$project": {"usuario_id": 1}}]}},
        {"$unionWith": {"coll": "comentarios", "pipeline": [{"$project": {"usuario_id": 1}}]}},
        {"$group": {"_id": "$usuario_id", "interacciones": {"$sum": 1}}},
        {"$sort": {"interacciones": -1, "_id": 1}},
        {"$limit": limit},
        {"$lookup": {"from": "usuarios", "localField": "_id", "foreignField": "_id", "as": "u"}},
        {"$unwind": "$u"},
        {"$project": {"_id": 0, "usuario_id": "$_id", "nombre": "$u.nombre",
                      "pais": "$u.pais", "interacciones": 1}},
    ]))


@router.get("/publicaciones-populares")
def publicaciones_populares(limit: int = Query(10, ge=1, le=50)):
    return list(get_db().publicaciones.aggregate([
        {"$lookup": {"from": "reacciones", "localField": "_id", "foreignField": "publicacion_id", "as": "r"}},
        {"$lookup": {"from": "comentarios", "localField": "_id", "foreignField": "publicacion_id", "as": "c"}},
        {"$addFields": {"engagement": {"$add": [{"$size": "$r"}, {"$size": "$c"}, {"$sum": "$c.likes"}]}}},
        {"$sort": {"engagement": -1}},
        {"$limit": limit},
        {"$project": {"categoria": 1, "tipo": 1, "hashtags": 1, "engagement": 1,
                      "n_reacciones": {"$size": "$r"}, "n_comentarios": {"$size": "$c"}}},
    ]))


@router.get("/campanas/{campana_id}")
def exito_campana(campana_id: str):
    """Interacciones reales dentro de la vigencia de la campana vs metricas_objetivo."""
    c = obtener("campanas", campana_id)
    d = get_db()
    rango = {"$gte": c["fecha_inicio"], "$lte": c["fecha_fin"]}
    pubs = c["publicaciones_asociadas"]
    reacciones = d.reacciones.count_documents({"publicacion_id": {"$in": pubs}, "fecha": rango})
    coms = list(d.comentarios.find({"publicacion_id": {"$in": pubs}, "fecha": rango}, {"likes": 1}))
    likes = reacciones + sum(x.get("likes", 0) for x in coms)
    meta = c["metricas_objetivo"]
    return {"campana": campana_id, "nombre": c["nombre"], "objetivo": c["objetivo"],
            "vigencia": {"inicio": c["fecha_inicio"], "fin": c["fecha_fin"]},
            "publicaciones": len(pubs),
            "real": {"likes": likes, "comentarios": len(coms)},
            "meta": meta,
            "cumplimiento_pct": {"likes": round(100 * likes / meta["likes"], 1),
                                 "comentarios": round(100 * len(coms) / meta["comentarios"], 1)},
            "nota": "compartidos no se registra en el dataset"}
