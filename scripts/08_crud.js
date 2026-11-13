// =============================================================================
// 08_crud.js - Operaciones CRUD que simulan casos de negocio de ContentFlow (IE7)
// Uso: mongosh "$env:MONGODB_URI" --file scripts/08_crud.js
// Cada paso muestra el estado ANTES y DESPUES. Al final limpia los documentos
// de prueba (todos tienen prefijo "test_"), asi el script se puede repetir.
// =============================================================================
db = db.getSiblingDB("contentflow");
const estado = (etq, col, filtro, proy) => {
  print(`  ${etq}:`); const r = db.getCollection(col).find(filtro, proy || {}).toArray();
  r.length ? r.forEach((d) => printjson(d)) : print("    (sin documentos)");
};
function paso(t) { print(`\n---------- ${t} ----------`); }

// limpieza preventiva por si quedo una ejecucion a medias
["usuarios", "publicaciones", "reacciones", "comentarios"].forEach((c) =>
  db.getCollection(c).deleteMany({ _id: /^test_/ }));
db.campanas.updateMany({}, { $pull: { publicaciones_asociadas: /^test_/ } });

// ================================================================ CREATE ===
paso("C1 insertOne: se registra una nueva usuaria");
estado("ANTES", "usuarios", { _id: "test_user_1" });
db.usuarios.insertOne({ _id: "test_user_1", nombre: "Camila Rojas", correo: "camila.rojas@example.cl",
  pais: "Chile", genero: "Femenino", fecha_registro: new Date(), dispositivo: "Móvil" });
estado("DESPUES", "usuarios", { _id: "test_user_1" });

paso("C2 insertOne con referencia validada: la usuaria publica (se verifica que exista)");
if (!db.usuarios.findOne({ _id: "test_user_1" })) throw new Error("usuario_id inexistente");
db.publicaciones.insertOne({ _id: "test_pub_1", usuario_id: "test_user_1",
  contenido: "Tutorial: primeros pasos con MongoDB Atlas", fecha_publicacion: new Date(),
  categoria: "Tecnología", hashtags: ["#aprendizaje"], tipo: "Video" });
estado("DESPUES", "publicaciones", { _id: "test_pub_1" });

paso("C3 insertMany: llegan dos comentarios y una reaccion a la publicacion");
estado("ANTES comentarios de test_pub_1", "comentarios", { publicacion_id: "test_pub_1" });
db.comentarios.insertMany([
  { _id: "test_comm_1", usuario_id: "user_10", publicacion_id: "test_pub_1",
    comentario: "Muy claro, gracias", fecha: new Date(), likes: 0 },
  { _id: "test_comm_2", usuario_id: "user_20", publicacion_id: "test_pub_1",
    comentario: "Falta la parte de indices", fecha: new Date(), likes: 0 }]);
db.reacciones.insertOne({ _id: "test_react_1", usuario_id: "user_10", publicacion_id: "test_pub_1",
  tipo_reaccion: "Me encanta", fecha: new Date() });
estado("DESPUES comentarios de test_pub_1", "comentarios", { publicacion_id: "test_pub_1" }, { comentario: 1, likes: 1 });

// ================================================================== READ ===
paso("R1 find + $lookup: publicacion con sus comentarios y reacciones");
printjson(db.publicaciones.aggregate([{ $match: { _id: "test_pub_1" } },
  { $lookup: { from: "comentarios", localField: "_id", foreignField: "publicacion_id", as: "comentarios" } },
  { $lookup: { from: "reacciones", localField: "_id", foreignField: "publicacion_id", as: "reacciones" } },
  { $project: { contenido: 1, n_comentarios: { $size: "$comentarios" }, n_reacciones: { $size: "$reacciones" } } }]).toArray());

// ================================================================ UPDATE ===
paso("U1 $set: la autora corrige el contenido y la categoria");
estado("ANTES", "publicaciones", { _id: "test_pub_1" }, { contenido: 1, categoria: 1 });
db.publicaciones.updateOne({ _id: "test_pub_1" },
  { $set: { contenido: "Tutorial: MongoDB Atlas + indices", categoria: "Educación", editado: new Date() } });
estado("DESPUES", "publicaciones", { _id: "test_pub_1" }, { contenido: 1, categoria: 1, editado: 1 });

paso("U2 $inc: un comentario recibe 3 likes");
estado("ANTES", "comentarios", { _id: "test_comm_1" }, { likes: 1 });
db.comentarios.updateOne({ _id: "test_comm_1" }, { $inc: { likes: 3 } });
estado("DESPUES", "comentarios", { _id: "test_comm_1" }, { likes: 1 });

paso("U3 $push ($each): se agregan hashtags a la publicacion");
estado("ANTES", "publicaciones", { _id: "test_pub_1" }, { hashtags: 1 });
db.publicaciones.updateOne({ _id: "test_pub_1" }, { $push: { hashtags: { $each: ["#innovacion", "#cultura"] } } });
estado("DESPUES", "publicaciones", { _id: "test_pub_1" }, { hashtags: 1 });

paso("U4 $addToSet: la publicacion se asocia a la campana camp_1 (sin duplicar)");
estado("ANTES", "campanas", { _id: "camp_1" }, { publicaciones_asociadas: 1 });
db.campanas.updateOne({ _id: "camp_1" }, { $addToSet: { publicaciones_asociadas: "test_pub_1" } });
db.campanas.updateOne({ _id: "camp_1" }, { $addToSet: { publicaciones_asociadas: "test_pub_1" } }); // 2a vez: no duplica
estado("DESPUES", "campanas", { _id: "camp_1" }, { publicaciones_asociadas: 1 });

paso("U5 updateOne por filtro compuesto: el usuario cambia su reaccion");
estado("ANTES", "reacciones", { _id: "test_react_1" }, { tipo_reaccion: 1 });
db.reacciones.updateOne({ usuario_id: "user_10", publicacion_id: "test_pub_1" },
  { $set: { tipo_reaccion: "Me gusta", fecha: new Date() } });
estado("DESPUES", "reacciones", { _id: "test_react_1" }, { tipo_reaccion: 1 });

// ============================================== ERRORES COMUNES (validacion) ===
paso("V1 Clave duplicada: el mismo usuario intenta reaccionar 2 veces (indice unico)");
try {
  db.reacciones.insertOne({ _id: "test_react_2", usuario_id: "user_10", publicacion_id: "test_pub_1",
    tipo_reaccion: "Me enoja", fecha: new Date() });
} catch (e) { print(`  RECHAZADO: code=${e.code} (${e.codeName || "DuplicateKey"})`); }

paso("V2 Correo duplicado al registrar usuario (indice unico ux_correo)");
try {
  db.usuarios.insertOne({ _id: "test_user_2", nombre: "Otra", correo: "camila.rojas@example.cl",
    pais: "Chile", genero: "Femenino", fecha_registro: new Date(), dispositivo: "Desktop" });
} catch (e) { print(`  RECHAZADO: code=${e.code}`); }

paso("V3 Referencia invalida: comentario sobre publicacion inexistente (se valida antes de insertar)");
const pubDestino = "pub_99999";
if (!db.publicaciones.findOne({ _id: pubDestino }, { _id: 1 })) {
  print(`  RECHAZADO: publicacion_id '${pubDestino}' no existe; no se inserta`);
}

// ================================================================ DELETE ===
paso("D1 deleteOne: el usuario quita su reaccion");
estado("ANTES", "reacciones", { _id: "test_react_1" }, { tipo_reaccion: 1 });
db.reacciones.deleteOne({ _id: "test_react_1" });
estado("DESPUES", "reacciones", { _id: "test_react_1" });

paso("D2 Borrado en cascada: la autora elimina su publicacion (comentarios + campanas)");
print(`  ANTES: pub=${db.publicaciones.countDocuments({ _id: "test_pub_1" })} ` +
  `comentarios=${db.comentarios.countDocuments({ publicacion_id: "test_pub_1" })} ` +
  `en camp_1=${db.campanas.countDocuments({ _id: "camp_1", publicaciones_asociadas: "test_pub_1" })}`);
db.comentarios.deleteMany({ publicacion_id: "test_pub_1" });
db.reacciones.deleteMany({ publicacion_id: "test_pub_1" });
db.campanas.updateMany({ publicaciones_asociadas: "test_pub_1" }, { $pull: { publicaciones_asociadas: "test_pub_1" } });
db.publicaciones.deleteOne({ _id: "test_pub_1" });
print(`  DESPUES: pub=${db.publicaciones.countDocuments({ _id: "test_pub_1" })} ` +
  `comentarios=${db.comentarios.countDocuments({ publicacion_id: "test_pub_1" })} ` +
  `en camp_1=${db.campanas.countDocuments({ _id: "camp_1", publicaciones_asociadas: "test_pub_1" })}`);

paso("D3 deleteMany: se da de baja la usuaria de prueba");
db.usuarios.deleteMany({ _id: /^test_/ });
estado("DESPUES", "usuarios", { _id: /^test_/ });

print("\n=== Conteos finales (deben ser los mismos que antes del script) ===");
["usuarios", "publicaciones", "reacciones", "comentarios", "campanas"].forEach((c) =>
  print(`${c}: ${db.getCollection(c).countDocuments()}`));
