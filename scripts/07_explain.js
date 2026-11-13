// 07_explain.js - Eficiencia con explain("executionStats"), antes y despues (IE6)
// Uso: mongosh "$env:MONGODB_URI" --file scripts/07_explain.js
// Para cada consulta: borra su indice (si existe), mide, crea el indice, mide.
// Con 500 documentos el tiempo suele ser 0-2 ms en ambos casos; la metrica
// relevante es la razon documentos examinados / devueltos y el tipo de plan
// (COLLSCAN = recorre toda la coleccion; IXSCAN = usa indice).
db = db.getSiblingDB("contentflow");

function resumen(exp) {
  const s = exp.executionStats;
  const etapas = [];
  (function walk(st) { if (!st) return; etapas.push(st.stage); walk(st.inputStage);
    (st.inputStages || []).forEach(walk); })(exp.queryPlanner.winningPlan.queryPlan || exp.queryPlanner.winningPlan);
  return { plan: etapas.join(" <- "), ms: s.executionTimeMillis, docsExaminados: s.totalDocsExamined,
           clavesExaminadas: s.totalKeysExamined, devueltos: s.nReturned,
           razon: s.nReturned ? +(s.totalDocsExamined / s.nReturned).toFixed(1) : s.totalDocsExamined };
}

function medir(nombre, col, idxKeys, idxOpts, consulta) {
  print(`\n========== ${nombre} ==========`);
  const c = db.getCollection(col);
  try { c.dropIndex(idxOpts.name); } catch (e) { /* no existia */ }
  const antes = resumen(consulta(c).explain("executionStats"));
  c.createIndex(idxKeys, idxOpts);
  const despues = resumen(consulta(c).explain("executionStats"));
  print("ANTES  (sin indice):"); printjson(antes);
  print(`DESPUES (indice ${idxOpts.name} ${JSON.stringify(idxKeys)}):`); printjson(despues);
  return { consulta: nombre, antes, despues };
}

const resultados = [];

// E1: comentarios de una publicacion, mas recientes primero (endpoint GET /publicaciones/{id}/comentarios)
resultados.push(medir("E1 comentarios de pub_381 ordenados por fecha", "comentarios",
  { publicacion_id: 1, fecha: -1 }, { name: "ix_pub_fecha" },
  (c) => c.find({ publicacion_id: "pub_381" }).sort({ fecha: -1 })));

// E2: publicaciones de Tecnologia desde marzo 2025, ordenadas por fecha
resultados.push(medir("E2 Tecnologia desde 2025-03-01 ordenado por fecha", "publicaciones",
  { categoria: 1, fecha_publicacion: -1 }, { name: "ix_categoria_fecha" },
  (c) => c.find({ categoria: "Tecnología", fecha_publicacion: { $gte: ISODate("2025-03-01") } })
          .sort({ fecha_publicacion: -1 })));

// E3: busqueda de usuario por correo (login / registro)
const correo = db.usuarios.findOne({ _id: "user_250" }).correo;
resultados.push(medir(`E3 usuario por correo (${correo})`, "usuarios",
  { correo: 1 }, { name: "ux_correo", unique: true },
  (c) => c.find({ correo })));

print("\n========== Tabla comparativa ==========");
print("consulta | plan antes | docs exam. antes | plan despues | docs exam. despues | devueltos | ms antes/despues");
resultados.forEach((r) => print(`${r.consulta} | ${r.antes.plan} | ${r.antes.docsExaminados} | ` +
  `${r.despues.plan} | ${r.despues.docsExaminados} | ${r.despues.devueltos} | ${r.antes.ms}/${r.despues.ms}`));
