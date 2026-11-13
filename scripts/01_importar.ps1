# Importar los JSON del anexo a Atlas
# antes: $env:MONGODB_URI = "mongodb+srv://cf_app:<password>@<cluster>.mongodb.net/"

mongoimport --uri $env:MONGODB_URI --db contentflow --collection usuarios --file data\usuarios.json --jsonArray --drop
mongoimport --uri $env:MONGODB_URI --db contentflow --collection publicaciones --file data\publicaciones.json --jsonArray --drop
mongoimport --uri $env:MONGODB_URI --db contentflow --collection reacciones --file data\reacciones.json --jsonArray --drop
mongoimport --uri $env:MONGODB_URI --db contentflow --collection comentarios --file data\comentarios.json --jsonArray --drop
# el archivo original traia la ene en el nombre, lo renombre a campanas.json
mongoimport --uri $env:MONGODB_URI --db contentflow --collection campanas --file data\campanas.json --jsonArray --drop
