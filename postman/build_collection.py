"""Genera ContentFlow.postman_collection.json (Postman v2.1).
Se deja el generador para poder regenerar la coleccion si cambian endpoints."""
import json
from pathlib import Path


def req(nombre, metodo, ruta, body=None, status=200, extra_tests=""):
    url_raw = "{{baseUrl}}" + ruta
    path_part, _, query = ruta.partition("?")
    url = {"raw": url_raw, "host": ["{{baseUrl}}"], "path": [p for p in path_part.split("/") if p]}
    if query:
        url["query"] = [dict(zip(("key", "value"), q.split("=", 1))) for q in query.split("&")]
    r = {"method": metodo, "header": [{"key": "Content-Type", "value": "application/json"}], "url": url}
    if body is not None:
        r["body"] = {"mode": "raw", "raw": json.dumps(body, ensure_ascii=False, indent=2)}
    test = [f'pm.test("status {status}", () => pm.response.to.have.status({status}));']
    test += [t for t in extra_tests.split("\n") if t]
    return {"name": nombre, "request": r,
            "event": [{"listen": "test", "script": {"type": "text/javascript", "exec": test}}]}


items = [
    {"name": "0. Salud", "item": [
        req("Health (ping a Atlas)", "GET", "/health",
            extra_tests='pm.test("db ok", () => pm.expect(pm.response.json().status).to.eql("ok"));'),
    ]},
    {"name": "1. Usuarios", "item": [
        req("Listar usuarios moviles", "GET", "/usuarios?dispositivo=Móvil&limit=5"),
        req("Obtener user_1", "GET", "/usuarios/user_1"),
        req("ERROR 404 usuario inexistente", "GET", "/usuarios/user_99999", status=404),
        req("Crear usuario", "POST", "/usuarios",
            {"nombre": "Camila Rojas", "correo": "camila{{$timestamp}}@example.cl",
             "pais": "Chile", "genero": "Femenino", "dispositivo": "Móvil"}, status=201,
            extra_tests='pm.collectionVariables.set("usuarioId", pm.response.json()._id);\n'
                        'pm.collectionVariables.set("correo", pm.response.json().correo);'),
        req("ERROR 409 correo duplicado", "POST", "/usuarios",
            {"nombre": "Otra Persona", "correo": "{{correo}}", "pais": "Chile",
             "genero": "Otro", "dispositivo": "Desktop"}, status=409),
        req("ERROR 422 validacion (correo, genero, falta pais)", "POST", "/usuarios",
            {"nombre": "X", "correo": "no-es-correo", "genero": "Robot", "dispositivo": "Desktop"},
            status=422),
    ]},
    {"name": "2. Publicaciones", "item": [
        req("Buscar Tecnologia con #innovacion", "GET", "/publicaciones?categoria=Tecnología&hashtag=innovacion&limit=5"),
        req("Crear publicacion", "POST", "/publicaciones",
            {"usuario_id": "{{usuarioId}}", "contenido": "Tutorial: primeros pasos con MongoDB Atlas",
             "categoria": "Tecnología", "hashtags": ["#aprendizaje"], "tipo": "Video"}, status=201,
            extra_tests='pm.collectionVariables.set("pubId", pm.response.json()._id);'),
        req("ERROR 422 referencia invalida (usuario inexistente)", "POST", "/publicaciones",
            {"usuario_id": "user_99999", "contenido": "x", "categoria": "Cultura",
             "hashtags": [], "tipo": "Texto"}, status=422,
            extra_tests='pm.test("tipo de error", () => pm.expect(pm.response.json().error).to.eql("referencia_invalida"));'),
        req("Actualizar publicacion ($set + $addToSet)", "PATCH", "/publicaciones/{{pubId}}",
            {"contenido": "Tutorial: MongoDB Atlas + indices", "agregar_hashtags": ["#innovacion"]}),
    ]},
    {"name": "3. Interacciones", "item": [
        req("Crear comentario", "POST", "/comentarios",
            {"usuario_id": "user_10", "publicacion_id": "{{pubId}}", "comentario": "Muy claro, gracias"},
            status=201, extra_tests='pm.collectionVariables.set("comId", pm.response.json()._id);'),
        req("ERROR 422 comentario a publicacion inexistente", "POST", "/comentarios",
            {"usuario_id": "user_10", "publicacion_id": "pub_99999", "comentario": "hola"}, status=422),
        req("Like a comentario ($inc)", "POST", "/comentarios/{{comId}}/like",
            extra_tests='pm.test("likes = 1", () => pm.expect(pm.response.json().likes).to.eql(1));'),
        req("Comentarios de la publicacion", "GET", "/publicaciones/{{pubId}}/comentarios"),
        req("Crear reaccion", "POST", "/reacciones",
            {"usuario_id": "user_10", "publicacion_id": "{{pubId}}", "tipo_reaccion": "Me encanta"},
            status=201, extra_tests='pm.collectionVariables.set("reactId", pm.response.json()._id);'),
        req("ERROR 409 reaccion duplicada (indice unico)", "POST", "/reacciones",
            {"usuario_id": "user_10", "publicacion_id": "{{pubId}}", "tipo_reaccion": "Me gusta"}, status=409),
        req("Publicacion con conteos", "GET", "/publicaciones/{{pubId}}",
            extra_tests='pm.test("1 comentario", () => pm.expect(pm.response.json().n_comentarios).to.eql(1));'),
    ]},
    {"name": "4. Reportes", "item": [
        req("Usuarios mas activos", "GET", "/reportes/usuarios-activos?limit=5"),
        req("Publicaciones populares", "GET", "/reportes/publicaciones-populares?limit=5"),
        req("Exito de campana camp_239", "GET", "/reportes/campanas/camp_239"),
    ]},
    {"name": "5. Eliminacion", "item": [
        req("Eliminar reaccion", "DELETE", "/reacciones/{{reactId}}"),
        req("Eliminar publicacion (cascada)", "DELETE", "/publicaciones/{{pubId}}",
            extra_tests='pm.test("borro 1 comentario", () => pm.expect(pm.response.json().comentarios_eliminados).to.eql(1));'),
        req("ERROR 404 publicacion ya eliminada", "GET", "/publicaciones/{{pubId}}", status=404),
    ]},
]

coleccion = {
    "info": {"name": "ContentFlow API (MongoDB Atlas)",
             "description": "Pruebas de lectura, escritura y control de errores. Ejecutar en orden (Run collection).",
             "schema": "https://schema.getpostman.com/json/collection/v2.1.0/collection.json"},
    "item": items,
    "variable": [{"key": "baseUrl", "value": "http://127.0.0.1:8000"},
                 {"key": "usuarioId", "value": ""}, {"key": "correo", "value": ""},
                 {"key": "pubId", "value": ""}, {"key": "comId", "value": ""},
                 {"key": "reactId", "value": ""}],
}
out = Path(__file__).with_name("ContentFlow.postman_collection.json")
out.write_text(json.dumps(coleccion, ensure_ascii=False, indent=2), encoding="utf-8")
print("OK", out)
