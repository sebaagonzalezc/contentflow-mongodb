# 00_atlas_setup.ps1 - Configuracion de MongoDB Atlas con Atlas CLI (IE1)
# Registro reproducible de los comandos usados. NO contiene contrasenas:
# la contrasena del usuario la genera/solicita la CLI y se guarda en un gestor.

# 1. Instalar Atlas CLI y autenticarse (abre el navegador)
winget install MongoDB.MongoDBAtlasCLI
atlas auth login                       # tipo: UserAccount

# 2. Proyecto dedicado (solo se permite 1 cluster Free por proyecto)
atlas projects create ContentFlow
atlas config set project_id <ID_DEL_PROYECTO>

# 3. Cluster Free (M0) en AWS Sao Paulo + usuario de base de datos
atlas setup --clusterName ContentFlowCluster --tier M0 --provider AWS --region SA_EAST_1 `
            --username cf_app --currentIp --skipSampleData --connectWith skip

# 4. Network Access: solo la IP publica del equipo de desarrollo (no 0.0.0.0/0)
$ip = Invoke-RestMethod https://api.ipify.org
atlas accesslist create $ip --type ipAddress --comment "PC desarrollo"
atlas accesslist list

# 5. Minimo privilegio: readWrite solo sobre la base del proyecto
atlas dbusers update cf_app --role readWrite@contentflow
atlas dbusers describe cf_app

# 6. Datos del cluster y string de conexion (sin credenciales)
atlas clusters describe ContentFlowCluster
atlas clusters connectionStrings describe ContentFlowCluster
