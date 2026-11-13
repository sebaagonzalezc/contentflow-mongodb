# =============================================================================
# 01_importar.ps1 - Carga de los 5 JSON del Anexo (Forma A) en MongoDB Atlas
# Uso (PowerShell, desde la raiz del repo):
#   $env:MONGODB_URI = "mongodb+srv://cf_app:<password>@<cluster>.mongodb.net/"
#   .\scripts\01_importar.ps1
# La URI se lee de una variable de entorno: nunca se escribe en el script.
# =============================================================================
$ErrorActionPreference = "Stop"

if (-not $env:MONGODB_URI) {
    Write-Error "Falta la variable de entorno MONGODB_URI"
    exit 1
}

$db = "contentflow"
# campanas.json: se renombro sin ene (el original 'campañas.json' venia con la
# ene en forma Unicode NFD, generada en macOS). La coleccion se llama 'campanas'.
$colecciones = @("usuarios", "publicaciones", "reacciones", "comentarios", "campanas")

foreach ($c in $colecciones) {
    Write-Host "Importando $c ..." -ForegroundColor Cyan
    # --jsonArray: cada archivo es un arreglo JSON
    # --drop: borra la coleccion antes de importar (el script se puede repetir)
    mongoimport --uri $env:MONGODB_URI --db $db --collection $c `
        --file "data\$c.json" --jsonArray --drop
    if ($LASTEXITCODE -ne 0) { Write-Error "Fallo la importacion de $c"; exit 1 }
}

Write-Host "Importacion terminada. Verifica con: mongosh `$env:MONGODB_URI --file scripts\02_verificar_carga.js" -ForegroundColor Green
