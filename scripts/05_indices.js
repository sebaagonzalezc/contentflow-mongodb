// 05_indices.js - Indices y su justificacion (IE2)
// Uso: mongosh "$env:MONGODB_URI" --file scripts/05_indices.js
// En el tier M0 no hay sharding: los indices son el mecanismo de optimizacion.
// Cada indice responde a una consulta concreta de 06_consultas.js o de la API.
db = db.getSiblingDB("contentflow");

const indices = [
  // usuarios
  ["usuarios", { correo: 1 }, { unique: true, name: "ux_correo" },
   "Un correo identifica a una persona; evita duplicados al registrar via API (409)."],
  ["usuarios", { pais: 1, dispositivo: 1 }, { name: "ix_pais_dispositivo" },
   "Perfil de audiencia: filtros por pais y dispositivo."],
  // publicaciones
  ["publicaciones", { usuario_id: 1, fecha_publicacion: -1 }, { name: "ix_usuario_fecha" },
   "Publicaciones de un usuario ordenadas por fecha (GET /usuarios/{id}/publicaciones)."],
  ["publicaciones", { categoria: 1, fecha_publicacion: -1 }, { name: "ix_categoria_fecha" },
   "Filtro por categoria + rango de fechas + orden por fecha (regla ESR: igualdad, orden, rango)."],
  ["publicaciones", { hashtags: 1 }, { name: "ix_hashtags" },
   "Indice multikey sobre el arreglo de hashtags (busqueda por hashtag)."],
  // reacciones
  ["reacciones", { publicacion_id: 1, tipo_reaccion: 1 }, { name: "ix_pub_tipo" },
   "$lookup publicaciones->reacciones y conteo por tipo de reaccion."],
  ["reacciones", { usuario_id: 1, publicacion_id: 1 }, { unique: true, name: "ux_usuario_publicacion" },
   "Regla de negocio: una reaccion por usuario y publicacion (se aplica despues de limpiar el duplicado)."],
  // comentarios
  ["comentarios", { publicacion_id: 1, fecha: -1 }, { name: "ix_pub_fecha" },
   "Comentarios de una publicacion, mas recientes primero; $lookup desde publicaciones."],
  ["comentarios", { usuario_id: 1 }, { name: "ix_usuario" },
   "Actividad por usuario (usuarios mas activos)."],
  ["comentarios", { likes: -1 }, { name: "ix_likes" },
   "Ranking de comentarios con mas likes."],
  // campanas
  ["campanas", { fecha_inicio: 1, fecha_fin: 1 }, { name: "ix_vigencia" },
   "Campanas vigentes en una fecha (fecha_inicio <= f <= fecha_fin)."],
  ["campanas", { publicaciones_asociadas: 1 }, { name: "ix_pubs_asociadas" },
   "Multikey: en que campanas participa una publicacion."],
];

for (const [col, keys, opts, porque] of indices) {
  try {
    const nombre = db.getCollection(col).createIndex(keys, opts);
    print(`OK   ${col}.${nombre}  ${JSON.stringify(keys)}  -> ${porque}`);
  } catch (e) {
    print(`ERR  ${col} ${JSON.stringify(keys)}: ${e.codeName || ""} ${e.message}`);
  }
}

print("\n=== Indices existentes ===");
for (const col of ["usuarios", "publicaciones", "reacciones", "comentarios", "campanas"]) {
  print(`${col}: ${db.getCollection(col).getIndexes().map((i) => i.name).join(", ")}`);
}
