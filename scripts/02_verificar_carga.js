// =============================================================================
// 02_verificar_carga.js - Verifica cantidad de documentos y tipos de campos
// Uso: mongosh "$env:MONGODB_URI" --file scripts/02_verificar_carga.js
// =============================================================================
db = db.getSiblingDB("contentflow");

const esperado = { usuarios: 500, publicaciones: 500, reacciones: 500, comentarios: 500, campanas: 500 };

print("\n=== Cantidad de documentos por coleccion ===");
for (const [col, n] of Object.entries(esperado)) {
  const real = db.getCollection(col).countDocuments();
  print(`${col.padEnd(15)} esperado=${n}  real=${real}  ${real === n ? "OK" : "REVISAR"}`);
}

print("\n=== Tipo BSON de los campos de fecha y de _id ===");
const campos = {
  usuarios: ["fecha_registro"],
  publicaciones: ["fecha_publicacion"],
  reacciones: ["fecha"],
  comentarios: ["fecha"],
  campanas: ["fecha_inicio", "fecha_fin"],
};
for (const [col, fs] of Object.entries(campos)) {
  for (const f of fs.concat(["_id"])) {
    const tipos = db.getCollection(col).aggregate([
      { $group: { _id: { $type: "$" + f }, n: { $sum: 1 } } },
    ]).toArray();
    print(`${col}.${f}: ${JSON.stringify(tipos)}`);
  }
}

print("\n=== Ejemplo de documento por coleccion ===");
for (const col of Object.keys(esperado)) {
  printjson(db.getCollection(col).findOne());
}
