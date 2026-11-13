# ContentFlow · MongoDB Atlas + API REST (Forma A)

Implementación en MongoDB Atlas (cluster Free/M0) de la base de datos de ContentFlow, con
consultas de negocio, operaciones CRUD, control de calidad de datos y una API REST en
**Python + FastAPI + pymongo**.

## Estructura

```
data/                    JSON del Anexo (campañas.json renombrado a campanas.json)
scripts/
  00_atlas_setup.ps1     Configuración del cluster con Atlas CLI (sin contraseñas)
  01_importar.ps1        mongoimport --jsonArray de las 5 colecciones
  02_verificar_carga.js  Conteo de documentos y tipos de campos
  03_transformar_fechas.js  Texto ISO -> Date con $toDate (idempotente)
  04_inconsistencias.js  Detección, marcado y auditoría de inconsistencias
  05_indices.js          Índices y su justificación
  06_consultas.js        Consultas y agregaciones de negocio
  07_explain.js          explain("executionStats") antes/después de índices
  08_crud.js             CRUD con evidencia antes/después y casos de error
api/                     API REST (FastAPI)
postman/                 Colección Postman exportada (+ script que la genera)
docs/                    Informe técnico
evidencias/              Capturas
```

## Requisitos

- Cuenta en MongoDB Atlas con un cluster Free (M0) y un usuario con rol `readWrite@contentflow`.
- Tu IP agregada en **Network Access**.
- `mongosh` y MongoDB Database Tools (`mongoimport`).
- Python 3.11 o superior.
- Postman (opcional: `newman` para ejecutar la colección por consola).

## 1. Variable de entorno con la conexión

El string de conexión **nunca** se escribe en el código. En PowerShell:

```powershell
$env:MONGODB_URI = "mongodb+srv://cf_app:<password>@<cluster>.xxxxx.mongodb.net/"
```

## 2. Carga y preparación de datos (ejecutar en orden)

```powershell
.\scripts\01_importar.ps1
mongosh $env:MONGODB_URI --file scripts\02_verificar_carga.js
mongosh $env:MONGODB_URI --file scripts\03_transformar_fechas.js
mongosh $env:MONGODB_URI --file scripts\04_inconsistencias.js
mongosh $env:MONGODB_URI --file scripts\05_indices.js
mongosh $env:MONGODB_URI --file scripts\06_consultas.js
mongosh $env:MONGODB_URI --file scripts\07_explain.js
mongosh $env:MONGODB_URI --file scripts\08_crud.js
```

Si PowerShell bloquea el `.ps1`, ejecuta `Set-ExecutionPolicy -Scope Process Bypass`.

## 3. API

```powershell
cd api
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
copy .env.example .env      # y completar MONGODB_URI
uvicorn app.main:app --reload
```

- Documentación interactiva: http://127.0.0.1:8000/docs
- Prueba de conectividad: http://127.0.0.1:8000/health
- Logs de actividad: `api/logs/api.log`

### Endpoints

| Método | Ruta | Colección | Descripción |
|---|---|---|---|
| GET | `/health` | | Ping a Atlas (200 o 503) |
| GET | `/usuarios` | usuarios | Filtros `pais`, `dispositivo`, `genero`; paginado |
| GET | `/usuarios/{id}` | usuarios | Detalle (404 si no existe) |
| GET | `/usuarios/{id}/publicaciones` | publicaciones | Publicaciones del usuario |
| POST | `/usuarios` | usuarios | Alta (409 si el correo ya existe) |
| GET | `/publicaciones` | publicaciones | Filtros `categoria`, `tipo`, `hashtag`, `desde`, `hasta` |
| GET | `/publicaciones/{id}` | publicaciones | Con reacciones por tipo y nº de comentarios |
| GET | `/publicaciones/{id}/comentarios` | comentarios | Comentarios recientes |
| POST | `/publicaciones` | publicaciones | Alta (422 si `usuario_id` no existe) |
| PATCH | `/publicaciones/{id}` | publicaciones | `$set` contenido/categoría + `$addToSet` hashtags |
| DELETE | `/publicaciones/{id}` | varias | Borrado en cascada |
| POST | `/comentarios` | comentarios | Alta con validación de referencias |
| POST | `/comentarios/{id}/like` | comentarios | `$inc` likes |
| DELETE | `/comentarios/{id}` | comentarios | Baja |
| POST | `/reacciones` | reacciones | Alta (409 si el usuario ya reaccionó) |
| GET/DELETE | `/reacciones/{id}` | reacciones | Detalle / baja |
| GET | `/reportes/usuarios-activos` | varias | Ranking de actividad |
| GET | `/reportes/publicaciones-populares` | varias | Ranking de engagement |
| GET | `/reportes/campanas/{id}` | campanas | Cumplimiento real vs. metas |

### Códigos de error

| Código | Cuándo |
|---|---|
| 404 `no_encontrado` | El documento no existe |
| 409 `clave_duplicada` | Índice único violado (correo, reacción repetida) |
| 422 `validacion` | Campo faltante, tipo o valor no permitido |
| 422 `referencia_invalida` | `usuario_id` o `publicacion_id` inexistente |
| 503 `base_de_datos_no_disponible` | Sin conexión a Atlas (red, IP, credenciales) |
| 500 `error_interno` | Error no controlado (queda en el log con `request_id`) |

## 4. Pruebas con Postman

Importa `postman/ContentFlow.postman_collection.json` y ejecuta **Run collection** en orden
(24 requests, 29 aserciones). Por consola:

```powershell
npx newman run postman/ContentFlow.postman_collection.json
```
