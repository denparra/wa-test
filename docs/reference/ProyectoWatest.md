# Proyecto WhatsApp Test (Queirolo Autos)

Este proyecto implementa un servicio backend en Node.js y Express para gestionar la comunicación vía WhatsApp utilizando la API de Twilio. Está diseñado para recibir mensajes entrantes (Inbound), procesar respuestas automáticas mediante lógica condicional y TwiML, y permitir el envío de mensajes salientes (Outbound).

**Novedades (v2):** Se ha integrado un Dashboard de Administración y una base de datos SQLite para persistencia de contactos, historial de mensajes y gestión de campañas.

El servicio está desplegado actualmente en un VPS Hostinger gestionado con Easypanel.

## 1. Visión General

El sistema actúa como un intermediario entre WhatsApp (usuario final) y la lógica de negocio de Queirolo Autos.
- **Inbound (Entrante):** Recibe webhooks de Twilio. Guarda el contacto automáticamente en SQLite y responde con lógica de menú.
- **Outbound (Saliente):** Scripts y campañas para envío masivo. Verifica "Opt-outs" antes de enviar.
- **Dashboard Admin:** Interfaz web para visualizar contactos, mensajes y crear campañas.
- **Infraestructura:** Contenedor Docker gestionado por Easypanel en un VPS. **Requiere persistencia de datos (Volumen).**

## 2. Estructura del Proyecto

```
/
├── admin/              # [NUEVO] Lógica de renderizado del Dashboard (HTML/CSS in-js).
│   ├── pages.js        # Componentes de páginas.
│   └── render.js       # Utilidades de renderizado.
├── db/                 # [NUEVO] Capa de datos.
│   ├── index.js        # Métodos de acceso a datos (DAO).
│   └── schema.sql      # Esquema de la base de datos (tablas: contacts, campaigns, etc).
├── server.js           # Servidor Express. Rutas /twilio/inbound, /admin/* y autenticación.
├── send-test.js        # Script Outbound (actualizado para usar DB opcionalmente).
├── package.json        # Dependencias (better-sqlite3, express, twilio).
├── Dockerfile          # Imagen Node 20 Alpine.
├── .env                # Variables de entorno.
└── .gitignore          # Ignora BD y dependencias.
```

## 3. Instalación y Configuración Local

### Prerrequisitos
- Node.js (v18+)
- npm

### Pasos
1.  **Clonar e Instalar:**
    ```bash
    git clone <repo>
    cd wa-test
    npm install
    ```

2.  **Configurar `.env`:**
    Crea un archivo `.env` basado en:
    ```env
    # Twilio
    TWILIO_ACCOUNT_SID=AC...
    TWILIO_AUTH_TOKEN=...
    MESSAGING_SERVICE_SID=MG...
    
    # Base de Datos
    DB_PATH=./data/watest.db
    
    # Dashboard Admin
    ADMIN_USER=admin
    ADMIN_PASS=secreto_seguro
    
    # Server
    PORT=3000
    ```

3.  **Base de Datos:**
    - Se crea automáticamente en `./data/watest.db` al iniciar `npm start` si no existe.
    - El esquema se define en `db/schema.sql`.

## 4. Uso

### Ejecutar Servidor
```bash
npm start
```
- **Webhook:** `POST http://localhost:3000/twilio/inbound`
- **Dashboard:** `GET http://localhost:3000/admin` (Requiere Auth Basic: admin/secreto_seguro)
- **Health:** `GET http://localhost:3000/health`

### Dashboard Administrador
Accede a `/admin` para ver:
- **Resumen:** Métricas clave (total contactos, mensajes, etc).
- **Contactos:** Lista de números capturados, estatus y fecha.
- **Mensajes:** Log de Inbound/Outbound.
- **Campañas:** Crear y monitorear envíos masivos.

### Enviar Mensajes (Outbound)
```bash
# Prueba simple
node send-test.js

# Crear Campaña (ejemplo conceptual via script)
# (Actualmente se gestiona mejor desde el Dashboard o scripts dedicados si existen)
```

## 5. Consideraciones Críticas para VPS (Docker)

> [!IMPORTANT]
> **Persistencia de Datos:** SQLite guarda los datos en un archivo local (`./data/watest.db`).
> Si usas Docker (Easypanel), **DEBES configurar un VOLUMEN** montado en `/app/data`.
> Sin el volumen, **perderás toda la base de datos** cada vez que se actualice o reinicie el contenedor.

> [!WARNING]
> **Seguridad:** Asegúrate de definir `ADMIN_USER` y `ADMIN_PASS` en las variables de entorno del VPS.
> Si no se definen, la autenticación podría saltarse o fallar (según implementación), dejando el admin vulnerable.

## 6. Rutas API

### `POST /twilio/inbound`
- Recibe hooks de Twilio.
- **Acciones:**
  - Crea/Actualiza contacto en DB.
  - Registra el mensaje en tabla `messages`.
  - Verifica palabras clave ("BAJA", "1", "2") para responder y etiquetar.
- **Respuesta:** TwiML.

### `GET /admin/*`
- Rutas protegidas por Basic Auth para la interfaz de gestión.

---

# Bitácora de Despliegue y Estado del Proyecto (Contexto Histórico)

> *Esta sección contiene la documentación original del proceso de configuración, despliegue y resolución de problemas. Se mantiene como referencia histórica y técnica.*

## Guía base (hasta aquí): Twilio + WhatsApp (Meta) + Webhook en VPS (Easypanel)

> Objetivo logrado hasta este punto: **recibir mensajes entrantes (inbound) de WhatsApp vía Twilio** en un endpoint público del VPS, y **responder automáticamente** con un menú y opciones (incluye “BAJA”), usando un servicio Node.js desplegado en **Hostinger VPS + Easypanel**.

---

### 0) Panorama rápido (qué construimos)

#### Componentes
- **WhatsApp Business (Meta)**: tu número de WhatsApp Business está aprobado y activo.
- **Twilio WhatsApp Sender**: Twilio está “conectado” a tu WhatsApp (sender online) y tu **Messaging Service (MG...)** está listo.
- **App Node.js (Express)**: un servidor HTTP con endpoints:
  - `GET /health` → para confirmar que el servicio está vivo.
  - `POST /twilio/inbound` → webhook para **mensajes entrantes** desde Twilio.
- **Despliegue** en VPS con **Easypanel** (build con Dockerfile y dominio HTTPS automático de Easypanel).

#### Flujo de mensajes (lo que ya funciona)
1) Un usuario escribe por WhatsApp a tu número.
2) WhatsApp → Twilio → Twilio llama a tu webhook `POST /twilio/inbound`.
3) Tu servidor **loggea** el inbound y devuelve **TwiML**.
4) Twilio entrega ese TwiML al usuario como respuesta en WhatsApp.

---

### 1) Por qué Twilio “al medio” y si se puede quitar

#### ¿Se puede enviar directo con Meta (sin Twilio)?
Sí: puedes usar **WhatsApp Cloud API** directamente con Meta (Graph API).  
Pero **no es “más simple”** si ya estás operativo en Twilio, porque:
- Con Meta directo debes manejar: tokens, WABA, phone_number_id, webhooks, templates, rate limits, etc.
- Con Twilio: ya tienes **sender + routing + consola + logs + servicios**.

**Decisión temporal que tomamos:** seguir con **Twilio + Meta** para avanzar rápido, probar inbound/outbound y luego decidir si conviene migrar.

---

### 2) Lo que ya tenías (credenciales Twilio)

En Twilio existen identificadores típicos:
- `TWILIO_ACCOUNT_SID` = `AC...`
- `TWILIO_AUTH_TOKEN` = token secreto
- `MESSAGING_SERVICE_SID` = `MG...` (tu Messaging Service)
- `CONTENT_SID` = `HX...` (Twilio Content / plantilla en Twilio)

**Nota:** para este hito (inbound + reply), no dependimos de `MG` ni `HX`.  
Los usaremos después para **envío masivo** y plantillas.

---

### 3) App Node.js: qué se hizo y por qué

#### 3.1 package.json
Tu `package.json` quedó así (resumen):
- `type: "module"` (ESM)
- `scripts.start = node server.js`
- deps: `express`, `twilio`, `dotenv`

Ejemplo real:
```json
{
  "name": "wa-test",
  "version": "1.0.0",
  "type": "module",
  "scripts": { "start": "node server.js" },
  "dependencies": {
    "dotenv": "^17.2.3",
    "express": "^5.2.1",
    "twilio": "^5.11.2"
  }
}
```

**Por qué esto importa:**
- Easypanel (o Docker) ejecuta `npm start` para levantar el servidor.
- `type: "module"` permite usar `import` en Node moderno.

---

### 4) Webhook inbound (lo esencial)

#### 4.1 Endpoint `/twilio/inbound`
Este endpoint recibe el payload “form-urlencoded” que envía Twilio en inbound.

- `req.body.From`: identificador del remitente (ej: `whatsapp:+569...`)
- `req.body.Body`: texto del mensaje

Se loggea para verificar:
- que llega el mensaje,
- y con qué contenido.

---

### 5) Reply automático: por qué TwiML

#### 5.1 “OK” vs TwiML
Al inicio respondías algo como `"OK"`: eso **confirma recepción**, pero no envía un reply.

Para responder en WhatsApp con Twilio, se devuelve **TwiML**:
```xml
<Response>
  <Message>...</Message>
</Response>
```

Por eso, al cambiar a TwiML, el usuario comenzó a recibir respuesta automática.

---

### 6) Lógica del menú (lo que viste como “errores”, pero no lo son)

Ejemplo de lógica condicional:
```js
if (body === 'BAJA' || body === '3') {
  reply = 'Listo. Te daremos de baja y no volveremos a contactarte por este canal.';
} else if (body === '1' || body.includes('CONSIGN')) {
  reply = 'Perfecto. Para avanzar, dime: Marca, Modelo, Ano y Comuna.';
} else if (body === '2' || body.includes('INFO')) {
  reply = 'Genial. Te cuento: consignamos, publicamos y gestionamos todo. Quieres que te llame un ejecutivo? (SI/NO)';
}
```

**Qué significa:**
- `if (...)` = si el texto calza con la condición, responde eso.
- `||` = “o”
- `===` = igualdad exacta
- `.includes("X")` = contiene la palabra `X`.

**Importante:** antes convertimos el texto a mayúsculas con `toUpperCase()` para que:
- “baja”, “BAJA”, “Baja” → se traten igual.

---

### 7) VPS + Easypanel: despliegue y problemas reales que resolvimos

#### 7.1 Primer intento: Buildpacks (falló por Docker viejo)
Easypanel intentó usar Buildpacks con `heroku/builder:24` y falló con:
> `client version 1.38 is too old. Minimum supported API version is 1.44`

**Qué significa:**
- El **Docker Engine / API** del VPS estaba desactualizado para ese builder/buildpack.
- No era problema del código.

#### 7.2 Solución aplicada: construir con Dockerfile (no Buildpacks)
Cambiamos el build a **Dockerfile**, porque:
- evita depender de `pack build` / buildpacks modernos,
- funciona bien con Docker más antiguo.

##### Dockerfile usado
```dockerfile
FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install --omit=dev

COPY . .

ENV NODE_ENV=production
EXPOSE 3000

CMD ["npm", "start"]
```

#### 7.3 Error “package.json missing” (contexto de build)
Apareció:
> `Could not read package.json: ENOENT /app/package.json`

**Causa típica:**
- Easypanel estaba construyendo sin el contexto correcto (no estaba trayendo el repo/código como fuente).

**Solución:**
- Asegurar que el **Source** sea GitHub (repo correcto)
- y que el build use ese código como contexto.

---

### 8) Dominio público HTTPS (Easypanel)

Easypanel te asignó un dominio HTTPS automático:

- `https://twilio-inbound-twilio-inbound.wqzejs.easypanel.host/`

Esto nos permitió:
- usar webhook sin configurar aún un subdominio propio,
- ya que Twilio necesita un endpoint accesible públicamente (idealmente HTTPS).

---

### 9) Puertos: por qué salió “Listening on 80”

En logs viste:
- `Listening on 80`

Eso significa:
- Easypanel (o su proxy interno) está asignando `PORT=80` al contenedor,
- y tu app se está adaptando a `process.env.PORT`.

**Conclusión:** esto es correcto. No necesitas forzar 3000 si el proxy gestiona el puerto.

---

### 10) Configuración Twilio (Messaging Service → Integration)

En Twilio, dentro de tu **Messaging Service (MG...)**:

1) Fuiste a **Integration**
2) En **Incoming Messages** seleccionaste:
   - ✅ **Send a webhook**
3) Configuraste:
   - **Request URL**:
     - `https://twilio-inbound-twilio-inbound.wqzejs.easypanel.host/twilio/inbound`
   - Método:
     - `HTTP POST`
4) Guardaste.

**Resultado:** Twilio empezó a llamar tu webhook ante cada mensaje entrante.

---

### 11) Confirmación de funcionamiento

#### Evidencias que vimos
- En Easypanel logs:
  - `Listening on 80`
  - `INBOUND: { from: 'whatsapp:+56....', body: 'Hola' }`
  - `INBOUND: { from: 'whatsapp:+56....', body: '3' }`
- En WhatsApp:
  - el reply automático funcionó (menú + respuestas específicas).

---

### 12) “SIGTERM” durante Deploy: no fue un crash

Cuando hiciste Deploy, apareció:
- `npm error signal SIGTERM`

**Qué significa:**
- Easypanel detuvo el proceso anterior para desplegar uno nuevo.
- Es normal si ocurre **solo durante deploy**.

---

### 13) Qué tecnologías usamos y para qué

- **Node.js**: runtime del servidor.
- **Express**: framework HTTP para rutas `/health` y `/twilio/inbound`.
- **Twilio WhatsApp**: proveedor intermediario que maneja el canal WhatsApp y dispara webhooks.
- **TwiML**: formato que Twilio entiende para responder mensajes.
- **VPS Hostinger**: servidor donde corre el servicio.
- **Easypanel**: panel para desplegar apps (build, domains, logs).
- **Dockerfile**: método de build compatible (evita buildpacks).

---

### 14) Próximos pasos sugeridos (no implementados aún)

#### 14.1 BAJA real (opt-out persistente)
Hoy el reply dice “te damos de baja”, pero falta:
- persistir el número en una lista (ej: `optout.json`, DB o Google Sheet),
- filtrar esa lista en campañas futuras.

#### 14.2 Envío masivo desde CSV (campañas)
Plan mínimo:
1) Leer `clientes.csv` (1500 aprox.)
2) Filtrar opt-out
3) Enviar **template aprobada** (Twilio Content `HX...` o Templates)
4) Registrar estado (sent/delivered/failed) con `Status Callback`.

#### 14.3 Botones
WhatsApp “botones” normalmente se implementan con:
- **plantillas interactivas** (quick replies / call-to-action) aprobadas,
- o flows.
Se debe aterrizar según lo que tienes aprobado en Meta/Twilio.

---

### 15) Checklist de referencia (para repetir en el futuro)

#### A) Servidor
- [ ] `server.js` con `process.env.PORT || 3000`
- [ ] Endpoint `POST /twilio/inbound`
- [ ] Reply en TwiML (XML)
- [ ] Endpoint `GET /health`

#### B) VPS / Easypanel
- [ ] Source configurado (repo correcto)
- [ ] Build con Dockerfile (si buildpacks falla)
- [ ] Dominio HTTPS funcionando (Easypanel o dominio propio)
- [ ] Logs muestran “Listening on …”
- [ ] Logs muestran “INBOUND …”

#### C) Twilio
- [ ] Messaging Service (MG) elegido
- [ ] Integration → Incoming Messages → **Send a webhook**
- [ ] Request URL apunta a `/twilio/inbound` (POST)

---

### 16) URLs clave (caso actual)
- Base domain:
  - `https://twilio-inbound-twilio-inbound.wqzejs.easypanel.host/`
- Webhook inbound:
  - `https://twilio-inbound-twilio-inbound.wqzejs.easypanel.host/twilio/inbound`
- Health check:
  - `https://twilio-inbound-twilio-inbound.wqzejs.easypanel.host/health`

---

### 17) Notas de seguridad
- No subas tokens (Auth Token, etc.) al repo.
- Si más adelante validas que el request es realmente de Twilio:
  - se usa la firma de Twilio (Request Validation) y un secret.
- Para campañas masivas:
  - respetar opt-out,
  - mantener calidad de envío,
  - usar plantillas aprobadas.

---

**Fin de guía (estado actual):** inbound + reply automático funcionando en producción (VPS).

---

### 18) Hito: Dashboard Admin y Persistencia SQLite (Actualización Reciente)

#### Mejoras Implementadas
1.  **Base de Datos Local (SQLite):**
    - Se eliminó la dependencia exclusiva de logs efímeros. Ahora todos los contactos, mensajes y opt-outs se guardan en `.data/watest.db`.
    - Librería: `better-sqlite3` para persistencia.

2.  **Dashboard de Administración:**
    - Se creó una interfaz web en `/admin` (protegida con usuario/clave).
    - Permite ver:
        - Listado de contactos capturados.
        - Historial de mensajes (Inbound/Outbound).
        - Estadísticas rápidas (leads totales, vehículos, etc).

3.  **Seguridad & Despliegue:**
    - Autenticación Basic Auth implementada en Express.
    - **Importante:** Se requiere montar un volumen persistente en Docker (`/app/data`) para no perder la base de datos al redesplegar.

