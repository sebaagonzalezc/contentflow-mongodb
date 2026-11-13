// 04_inconsistencias.js - Deteccion, documentacion y tratamiento (IE8)
// Uso: mongosh "$env:MONGODB_URI" --file scripts/04_inconsistencias.js
// Requisito: haber ejecutado 03_transformar_fechas.js
//
// Criterio general: NO se elimina ningun registro sin evidencia.
//   - Cada hallazgo queda registrado en la coleccion `auditoria_calidad`
//     (regla, cantidad, ids afectados, accion, fecha).
//   - Las inconsistencias temporales se MARCAN con `calidad.flags` y no se
//     corrigen: cambiar una fecha seria inventar un dato.
//   - El unico duplicado logico se MUEVE a `reacciones_descartadas` con el
//     motivo, y luego se impone la regla con un indice unico (05_indices.js).
// El script es idempotente: usa $addToSet y solo descarta si hay duplicados.
db = db.getSiblingDB("contentflow");
const ahora = new Date();

function registrar(regla, coleccion, ids, accion) {
  db.auditoria_calidad.updateOne(
    { regla },
    { $set: { regla, coleccion, cantidad: ids.length, ids_muestra: ids.slice(0, 20),
              accion, fecha_revision: ahora } },
    { upsert: true }
  );
  print(`[${ids.length.toString().padStart(4)}] ${regla} -> ${accion}`);
}
function marcar(coleccion, ids, flag) {
  if (ids.length) db.getCollection(coleccion).updateMany(
    { _id: { $in: ids } }, { $addToSet: { "calidad.flags": flag } });
}
const ids = (cur) => cur.toArray().map((d) => d._id);

print("\n===== 1. Duplicados de _id y de correo =====");
for (const col of ["usuarios", "publicaciones", "reacciones", "comentarios", "campanas"]) {
  const dup = ids(db.getCollection(col).aggregate([
    { $group: { _id: "$_id", n: { $sum: 1 } } }, { $match: { n: { $gt: 1 } } }]));
  registrar(`${col}: _id duplicado`, col, dup, "ninguna (no hay casos)");
}
const dupCorreo = ids(db.usuarios.aggregate([
  { $group: { _id: { $toLower: "$correo" }, n: { $sum: 1 } } }, { $match: { n: { $gt: 1 } } }]));
registrar("usuarios: correo duplicado", "usuarios", dupCorreo, "ninguna; se crea indice unico");
const homonimos = db.usuarios.aggregate([
  { $group: { _id: "$nombre", ids: { $push: "$_id" }, n: { $sum: 1 } } },
  { $match: { n: { $gt: 1 } } }]).toArray();
registrar("usuarios: nombre repetido (homonimos)", "usuarios", homonimos.flatMap((h) => h.ids),
  "se conservan: correo distinto => personas distintas");

print("\n===== 2. Referencias invalidas =====");
for (const col of ["publicaciones", "reacciones", "comentarios"]) {
  const r = ids(db.getCollection(col).aggregate([
    { $lookup: { from: "usuarios", localField: "usuario_id", foreignField: "_id", as: "u" } },
    { $match: { u: { $size: 0 } } }]));
  registrar(`${col}: usuario_id inexistente`, col, r, r.length ? "marcar" : "ninguna (no hay casos)");
  marcar(col, r, "usuario_inexistente");
}
for (const col of ["reacciones", "comentarios"]) {
  const r = ids(db.getCollection(col).aggregate([
    { $lookup: { from: "publicaciones", localField: "publicacion_id", foreignField: "_id", as: "p" } },
    { $match: { p: { $size: 0 } } }]));
  registrar(`${col}: publicacion_id inexistente`, col, r, r.length ? "marcar" : "ninguna (no hay casos)");
  marcar(col, r, "publicacion_inexistente");
}
const campRef = ids(db.campanas.aggregate([
  { $unwind: "$publicaciones_asociadas" },
  { $lookup: { from: "publicaciones", localField: "publicaciones_asociadas", foreignField: "_id", as: "p" } },
  { $match: { p: { $size: 0 } } }, { $group: { _id: "$_id" } }]));
registrar("campanas: publicacion asociada inexistente", "campanas", campRef,
  campRef.length ? "marcar" : "ninguna (no hay casos)");

print("\n===== 3. Inconsistencias temporales (se marcan, no se corrigen) =====");
const pubAntesRegistro = ids(db.publicaciones.aggregate([
  { $lookup: { from: "usuarios", localField: "usuario_id", foreignField: "_id", as: "u" } },
  { $unwind: "$u" },
  { $match: { $expr: { $lt: ["$fecha_publicacion", "$u.fecha_registro"] } } }]));
marcar("publicaciones", pubAntesRegistro, "publicacion_antes_registro_autor");
registrar("publicaciones: fecha anterior al registro del autor", "publicaciones", pubAntesRegistro,
  "marcar calidad.flags; excluir de analisis temporales");

for (const col of ["reacciones", "comentarios"]) {
  const antesPub = ids(db.getCollection(col).aggregate([
    { $lookup: { from: "publicaciones", localField: "publicacion_id", foreignField: "_id", as: "p" } },
    { $unwind: "$p" },
    { $match: { $expr: { $lt: ["$fecha", "$p.fecha_publicacion"] } } }]));
  marcar(col, antesPub, "fecha_antes_publicacion");
  registrar(`${col}: fecha anterior a la publicacion`, col, antesPub,
    "marcar calidad.flags; excluir de analisis temporales y de campanas");

  const antesReg = ids(db.getCollection(col).aggregate([
    { $lookup: { from: "usuarios", localField: "usuario_id", foreignField: "_id", as: "u" } },
    { $unwind: "$u" },
    { $match: { $expr: { $lt: ["$fecha", "$u.fecha_registro"] } } }]));
  marcar(col, antesReg, "fecha_antes_registro_usuario");
  registrar(`${col}: fecha anterior al registro del usuario`, col, antesReg, "marcar calidad.flags");

  const propia = ids(db.getCollection(col).aggregate([
    { $lookup: { from: "publicaciones", localField: "publicacion_id", foreignField: "_id", as: "p" } },
    { $unwind: "$p" }, { $match: { $expr: { $eq: ["$usuario_id", "$p.usuario_id"] } } }]));
  marcar(col, propia, "autointeraccion");
  registrar(`${col}: el autor interactua con su propia publicacion`, col, propia,
    "marcar; es valido en la plataforma, se informa");
}

const campFuera = db.campanas.aggregate([
  { $lookup: { from: "publicaciones", localField: "publicaciones_asociadas", foreignField: "_id", as: "p" } },
  { $project: { fuera: { $map: {
      input: { $filter: { input: "$p", as: "x", cond: { $or: [
        { $lt: ["$$x.fecha_publicacion", "$fecha_inicio"] },
        { $gt: ["$$x.fecha_publicacion", "$fecha_fin"] }] } } },
      as: "x", in: "$$x._id" } } } },
  { $match: { "fuera.0": { $exists: true } } }]).toArray();
campFuera.forEach((c) => db.campanas.updateOne({ _id: c._id },
  { $set: { "calidad.publicaciones_fuera_de_rango": c.fuera },
    $addToSet: { "calidad.flags": "publicaciones_fuera_de_rango" } }));
registrar("campanas: publicaciones asociadas fuera del rango de fechas", "campanas",
  campFuera.map((c) => c._id),
  `marcar; ${campFuera.reduce((a, c) => a + c.fuera.length, 0)} asociaciones fuera de rango`);

const nombresCamp = db.campanas.aggregate([
  { $group: { _id: "$nombre", ids: { $push: "$_id" }, n: { $sum: 1 } } },
  { $match: { n: { $gt: 1 } } }]).toArray();
registrar("campanas: nombre repetido", "campanas", nombresCamp.flatMap((x) => x.ids),
  `${nombresCamp.length} nombres repetidos; se conservan (el _id es distinto), usar _id como clave`);

print("\n===== 4. Duplicado logico: mismo usuario reacciona 2 veces a la misma publicacion =====");
const dups = db.reacciones.aggregate([
  { $sort: { fecha: -1 } },
  { $group: { _id: { u: "$usuario_id", p: "$publicacion_id" }, docs: { $push: "$$ROOT" }, n: { $sum: 1 } } },
  { $match: { n: { $gt: 1 } } }]).toArray();
const descartados = [];
dups.forEach((g) => {
  print(`ANTES: ${JSON.stringify(g.docs.map((d) => ({ _id: d._id, tipo: d.tipo_reaccion, fecha: d.fecha })))}`);
  g.docs.slice(1).forEach((d) => {   // se conserva la mas reciente (docs[0])
    db.reacciones_descartadas.insertOne(Object.assign({}, d, {
      motivo: "reaccion duplicada usuario+publicacion; se conserva la mas reciente",
      conservada: g.docs[0]._id, fecha_descarte: ahora }));
    db.reacciones.deleteOne({ _id: d._id });
    descartados.push(d._id);
  });
  print(`DESPUES en reacciones: ${JSON.stringify(db.reacciones.find(
    { usuario_id: g._id.u, publicacion_id: g._id.p }, { _id: 1 }).toArray())}`);
});
if (dups.length) registrar("reacciones: duplicado usuario+publicacion", "reacciones", descartados,
  "mover a reacciones_descartadas (se conserva la mas reciente) + indice unico");
print(`reacciones_descartadas: ${db.reacciones_descartadas.countDocuments()} documento(s)`);

print("\n===== Resumen (coleccion auditoria_calidad) =====");
db.auditoria_calidad.find({}, { _id: 0, regla: 1, cantidad: 1, accion: 1 }).sort({ cantidad: -1 })
  .forEach((d) => print(`${String(d.cantidad).padStart(4)} | ${d.regla} | ${d.accion}`));
