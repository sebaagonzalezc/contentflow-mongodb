// 03_transformar_fechas.js - Convierte las fechas de texto ISO a tipo Date
// Uso: mongosh "$env:MONGODB_URI" --file scripts/03_transformar_fechas.js
//
// Por que: los operadores de fecha ($hour, $dayOfWeek, $month, rangos con
// ISODate) solo funcionan sobre el tipo BSON Date, no sobre texto.
//
// Como: updateMany con pipeline de agregacion + $toDate. El filtro
// { campo: { $type: "string" } } hace el script idempotente: si se ejecuta
// dos veces, la segunda no modifica nada.
//
// Supuesto documentado: las fechas vienen sin zona horaria
// ("2025-04-17T14:19:46"); $toDate las interpreta como UTC.
db = db.getSiblingDB("contentflow");

const campos = {
  usuarios: ["fecha_registro"],
  publicaciones: ["fecha_publicacion"],
  reacciones: ["fecha"],
  comentarios: ["fecha"],
  campanas: ["fecha_inicio", "fecha_fin"],
};

for (const [col, fs] of Object.entries(campos)) {
  for (const f of fs) {
    const c = db.getCollection(col);
    const antes = c.findOne({}, { [f]: 1 });
    const r = c.updateMany(
      { [f]: { $type: "string" } },
      [{ $set: { [f]: { $toDate: "$" + f } } }]
    );
    const despues = c.findOne({ _id: antes._id }, { [f]: 1 });
    print(`${col}.${f}: modificados=${r.modifiedCount}  ` +
          `antes=${JSON.stringify(antes[f])} (${typeof antes[f]})  ` +
          `despues=${despues[f].toISOString ? despues[f].toISOString() : despues[f]} (Date)`);
  }
}

print("\n=== Verificacion: documentos que aun tienen fecha como texto (debe ser 0) ===");
for (const [col, fs] of Object.entries(campos)) {
  for (const f of fs) {
    print(`${col}.${f}: ${db.getCollection(col).countDocuments({ [f]: { $type: "string" } })}`);
  }
}
