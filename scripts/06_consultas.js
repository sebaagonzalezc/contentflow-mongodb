// 06_consultas.js - Consultas de negocio para la gerencia de ContentFlow (IE4, IE5)
// Uso: mongosh "$env:MONGODB_URI" --file scripts/06_consultas.js
// Requisito: 03 (fechas Date) y 04 (calidad.flags) ejecutados.
// Cada consulta indica el requerimiento de negocio que responde.
db = db.getSiblingDB("contentflow");
function titulo(n, req) { print(`\n========== ${n} ==========\nRequerimiento: ${req}`); }
const show = (cur) => cur.forEach((d) => printjson(d));
// Filtro reutilizable: excluir interacciones con fecha inconsistente
const SIN_FLAG_TEMPORAL = { "calidad.flags": { $nin: ["fecha_antes_publicacion", "fecha_antes_registro_usuario"] } };

titulo("C1 - Filtro + proyeccion",
  "Perfil de audiencia: usuarias que acceden desde movil (para campana mobile-first).");
show(db.usuarios.find(
  { genero: "Femenino", dispositivo: "Móvil" },
  { _id: 1, nombre: 1, pais: 1, fecha_registro: 1 }   // proyeccion: solo lo necesario
).sort({ fecha_registro: -1 }).limit(5));
print("Total:", db.usuarios.countDocuments({ genero: "Femenino", dispositivo: "Móvil" }));

titulo("C2 - Operadores de comparacion ($gte, $lte) + orden",
  "Comentarios destacados: likes entre 95 y 100, del mas al menos votado.");
show(db.comentarios.find({ likes: { $gte: 95, $lte: 100 } },
  { _id: 1, publicacion_id: 1, likes: 1, comentario: 1 }).sort({ likes: -1, fecha: -1 }).limit(5));

titulo("C3 - Operadores logicos ($and, $or, $in) + busqueda compuesta",
  "Diseno de contenido: videos o imagenes de Tecnologia/Educacion que usan #innovacion.");
show(db.publicaciones.find({
  $and: [
    { categoria: { $in: ["Tecnología", "Educación"] } },
    { $or: [{ tipo: "Video" }, { tipo: "Imagen" }] },
    { hashtags: "#innovacion" },            // match sobre arreglo (multikey)
  ],
}, { contenido: 0 }).sort({ fecha_publicacion: -1 }).limit(5));

titulo("C4 - Rango de fechas ($gte/$lt con ISODate) + $nin",
  "Publicaciones de marzo 2025 que no son de texto.");
const q4 = { fecha_publicacion: { $gte: ISODate("2025-03-01"), $lt: ISODate("2025-04-01") },
             tipo: { $nin: ["Texto"] } };
print("Cantidad:", db.publicaciones.countDocuments(q4));
show(db.publicaciones.find(q4, { categoria: 1, tipo: 1, fecha_publicacion: 1 }).sort({ fecha_publicacion: 1 }).limit(3));

titulo("A1 - Usuarios mas activos ($unionWith, $group, $sort, $lookup)",
  "Identificar a los usuarios mas activos (publicaciones + reacciones + comentarios).");
show(db.publicaciones.aggregate([
  { $project: { usuario_id: 1, tipo: { $literal: "publicacion" } } },
  { $unionWith: { coll: "reacciones", pipeline: [{ $project: { usuario_id: 1, tipo: { $literal: "reaccion" } } }] } },
  { $unionWith: { coll: "comentarios", pipeline: [{ $project: { usuario_id: 1, tipo: { $literal: "comentario" } } }] } },
  { $group: { _id: "$usuario_id", total: { $sum: 1 },
      publicaciones: { $sum: { $cond: [{ $eq: ["$tipo", "publicacion"] }, 1, 0] } },
      reacciones: { $sum: { $cond: [{ $eq: ["$tipo", "reaccion"] }, 1, 0] } },
      comentarios: { $sum: { $cond: [{ $eq: ["$tipo", "comentario"] }, 1, 0] } } } },
  { $sort: { total: -1, _id: 1 } },
  { $limit: 10 },
  { $lookup: { from: "usuarios", localField: "_id", foreignField: "_id", as: "u" } },
  { $unwind: "$u" },
  { $project: { _id: 0, usuario_id: "$_id", nombre: "$u.nombre", pais: "$u.pais",
      total: 1, publicaciones: 1, reacciones: 1, comentarios: 1 } },
]));

titulo("A2 - Contenidos mas populares ($lookup x2, $size, $sum, $addFields)",
  "Ranking de publicaciones por engagement = reacciones + comentarios + likes de comentarios.");
show(db.publicaciones.aggregate([
  { $lookup: { from: "reacciones", localField: "_id", foreignField: "publicacion_id", as: "r" } },
  { $lookup: { from: "comentarios", localField: "_id", foreignField: "publicacion_id", as: "c" } },
  { $addFields: { n_reacciones: { $size: "$r" }, n_comentarios: { $size: "$c" },
                  likes_comentarios: { $sum: "$c.likes" } } },
  { $addFields: { engagement: { $add: ["$n_reacciones", "$n_comentarios", "$likes_comentarios"] } } },
  { $sort: { engagement: -1 } },
  { $limit: 10 },
  { $project: { categoria: 1, tipo: 1, hashtags: 1, n_reacciones: 1, n_comentarios: 1,
                likes_comentarios: 1, engagement: 1 } },
]));

titulo("A3 - Engagement por categoria y tipo ($lookup, $group, $avg)",
  "Diseno de contenido: que combinacion categoria/tipo genera mas interaccion promedio.");
show(db.publicaciones.aggregate([
  { $lookup: { from: "reacciones", localField: "_id", foreignField: "publicacion_id", as: "r" } },
  { $lookup: { from: "comentarios", localField: "_id", foreignField: "publicacion_id", as: "c" } },
  { $group: { _id: { categoria: "$categoria", tipo: "$tipo" }, publicaciones: { $sum: 1 },
      prom_reacciones: { $avg: { $size: "$r" } }, prom_comentarios: { $avg: { $size: "$c" } } } },
  { $addFields: { prom_interacciones: { $round: [{ $add: ["$prom_reacciones", "$prom_comentarios"] }, 2] } } },
  { $sort: { prom_interacciones: -1 } },
  { $limit: 8 },
]));

titulo("A4 - Hashtags ($unwind, $group, $sort)",
  "Diseno de contenido: hashtags mas usados y su interaccion media.");
show(db.publicaciones.aggregate([
  { $unwind: "$hashtags" },
  { $lookup: { from: "reacciones", localField: "_id", foreignField: "publicacion_id", as: "r" } },
  { $group: { _id: "$hashtags", usos: { $sum: 1 }, prom_reacciones: { $avg: { $size: "$r" } } } },
  { $sort: { usos: -1 } },
]));

titulo("A5 - Horarios de publicacion ($hour, $dayOfWeek, $match con calidad)",
  "Horarios: en que franja horaria se concentran las reacciones validas (excluye fechas inconsistentes).");
show(db.reacciones.aggregate([
  { $match: SIN_FLAG_TEMPORAL },
  { $group: { _id: { $hour: "$fecha" }, reacciones: { $sum: 1 } } },
  { $sort: { reacciones: -1 } },
  { $limit: 6 },
  { $project: { _id: 0, hora_utc: "$_id", reacciones: 1 } },
]));
show(db.publicaciones.aggregate([
  { $group: { _id: { $dayOfWeek: "$fecha_publicacion" }, publicaciones: { $sum: 1 } } },
  { $sort: { _id: 1 } },
  { $project: { _id: 0, dia: { $arrayElemAt: [["", "Dom", "Lun", "Mar", "Mie", "Jue", "Vie", "Sab"], "$_id"] }, publicaciones: 1 } },
]));

titulo("A6 - Perfil de audiencia ($lookup usuarios, $group compuesto)",
  "Perfil de audiencia: tipo de reaccion segun dispositivo y genero de quien reacciona.");
show(db.reacciones.aggregate([
  { $lookup: { from: "usuarios", localField: "usuario_id", foreignField: "_id", as: "u" } },
  { $unwind: "$u" },
  { $group: { _id: { dispositivo: "$u.dispositivo", genero: "$u.genero" }, total: { $sum: 1 },
      positivas: { $sum: { $cond: [{ $in: ["$tipo_reaccion", ["Me gusta", "Me encanta"]] }, 1, 0] } } } },
  { $addFields: { pct_positivas: { $round: [{ $multiply: [{ $divide: ["$positivas", "$total"] }, 100] }, 1] } } },
  { $sort: { total: -1 } },
]));

titulo("A7 - Exito de campanas ($unwind, $lookup con pipeline y let, $group, metas)",
  "Exito de campanas: interacciones reales DENTRO de la vigencia vs metricas_objetivo.");
const exito = [
  { $unwind: "$publicaciones_asociadas" },
  { $lookup: { from: "reacciones", let: { p: "$publicaciones_asociadas", ini: "$fecha_inicio", fin: "$fecha_fin" },
      pipeline: [{ $match: { $expr: { $and: [
        { $eq: ["$publicacion_id", "$$p"] }, { $gte: ["$fecha", "$$ini"] }, { $lte: ["$fecha", "$$fin"] }] } } },
        { $match: SIN_FLAG_TEMPORAL }], as: "r" } },
  { $lookup: { from: "comentarios", let: { p: "$publicaciones_asociadas", ini: "$fecha_inicio", fin: "$fecha_fin" },
      pipeline: [{ $match: { $expr: { $and: [
        { $eq: ["$publicacion_id", "$$p"] }, { $gte: ["$fecha", "$$ini"] }, { $lte: ["$fecha", "$$fin"] }] } } },
        { $match: SIN_FLAG_TEMPORAL }], as: "c" } },
  { $group: { _id: "$_id", nombre: { $first: "$nombre" }, objetivo: { $first: "$objetivo" },
      meta: { $first: "$metricas_objetivo" }, publicaciones: { $sum: 1 },
      reacciones: { $sum: { $size: "$r" } }, comentarios: { $sum: { $size: "$c" } },
      likes_comentarios: { $sum: { $sum: "$c.likes" } } } },
  { $addFields: {
      pct_meta_comentarios: { $round: [{ $multiply: [{ $divide: ["$comentarios", "$meta.comentarios"] }, 100] }, 2] },
      pct_meta_likes: { $round: [{ $multiply: [{ $divide: [{ $add: ["$reacciones", "$likes_comentarios"] }, "$meta.likes"] }, 100] }, 2] } } },
];
print("-- Top 5 campanas por cumplimiento de meta de likes --");
show(db.campanas.aggregate(exito.concat([{ $sort: { pct_meta_likes: -1 } }, { $limit: 5 },
  { $project: { meta: 0 } }])));
print("-- Resumen por objetivo de campana --");
show(db.campanas.aggregate(exito.concat([
  { $group: { _id: "$objetivo", campanas: { $sum: 1 },
      prom_pct_likes: { $avg: "$pct_meta_likes" }, prom_pct_comentarios: { $avg: "$pct_meta_comentarios" },
      cumplen_meta_likes: { $sum: { $cond: [{ $gte: ["$pct_meta_likes", 100] }, 1, 0] } } } },
  { $sort: { prom_pct_likes: -1 } }])));
print("Nota: 'compartidos' no se puede medir: el dataset no registra compartidos.");
