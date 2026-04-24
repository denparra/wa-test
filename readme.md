# WA-Test: WhatsApp Campaign System (Queirolo Autos)

Sistema de mensajería WhatsApp para Queirolo Autos utilizando Twilio API. Incluye webhook inbound, dashboard administrativo y gestión de campañas outbound con SQLite como base de datos persistente.

## 📋 Tabla de Contenidos

- [Visión General](#visión-general)
- [Tecnologías](#tecnologías)
- [Estructura del Proyecto](#estructura-del-proyecto)
- [Instalación](#instalación)
- [Configuración](#configuración)
- [Uso](#uso)
- [Base de Datos](#base-de-datos)
- [Endpoints](#endpoints)
- [Despliegue](#despliegue)
- [Documentación Adicional](#documentación-adicional)

## 🎯 Visión General

El sistema actúa como un intermediario entre WhatsApp (usuario final) y la lógica de negocio de Queirolo Autos con tres componentes principales:

### 1. **Inbound (Webhook)**
- Recibe mensajes entrantes de WhatsApp vía Twilio
- Procesa respuestas automáticas con TwiML
- Gestiona opt-outs (BAJA) con persistencia en SQLite
- Registra todos los mensajes para análisis

### 2. **Dashboard Administrativo**
- Interfaz web para visualizar contactos, mensajes, campañas y opt-outs
- Búsqueda y ordenamiento client-side en todas las tablas
- Acciones rápidas (copiar teléfono, ver detalles)
- Estados visuales con badges (active/opted_out, sent/delivered/failed)

### 3. **Outbound (Campañas)**
- Envío masivo mediante script (`send-test.js`)
- Soporte para templates de Twilio o mensajes directos
- Tracking de estado por destinatario
- Filtrado automático de opt-outs

## 🚀 Tecnologías

- **Backend:** Node.js v20+ (ES Modules)
- **Framework:** Express 5.x
- **Base de Datos:** SQLite 3.x (con volumen persistente `/app/data` en VPS)
- **Mensajería:** Twilio API (WhatsApp)
- **Deployment:** Docker + Easypanel (Hostinger VPS)
- **Frontend:** HTML/CSS/JS vanilla (sin frameworks pesados)

## 📁 Estructura del Proyecto

```
wa-test/
├── server.js              # Servidor Express con rutas admin + webhook
├── send-test.js           # Script de envío de campañas outbound
├── package.json           # Dependencias y scripts
├── Dockerfile             # Imagen Docker para deployment
├── .env                   # Variables de entorno (NO subir a repo)
├── .gitignore             # Archivos ignorados por Git
├── admin/
│   ├── pages.js           # Renderizado de vistas admin (Dashboard, Contactos, Mensajes, Campañas, Opt-outs)
│   └── render.js          # Utilidades de renderizado (layout, tablas, badges, helpers)
├── db/
│   ├── index.js           # Funciones de acceso a SQLite (queries, inserts, updates)
│   └── schema.sql         # Esquema completo de base de datos
└── docs/
    ├── ProyectoWatest.md  # Documentación histórica del proyecto
    └── db.md  # Documentación del esquema DB
```

## 💻 Instalación

### Prerrequisitos
- Node.js v20+ recomendado
- npm o yarn
- SQLite 3.x (incluido en Node.js)

### Pasos para Setup Local

```bash
# 1. Clonar el repositorio
git clone <url-del-repo>
cd wa-test

# 2. Instalar dependencias
npm install

# 3. Crear archivo .env (ver sección Configuración)
cp .env.example .env  # Si existe, sino crear manualmente

# 4. Inicializar base de datos (automático al ejecutar server.js)
# La DB se crea en data/watest.db por defecto

# 5. Ejecutar servidor
npm start  # Puerto 3000 por defecto
```

## ⚙️ Configuración

### Variables de Entorno Requeridas

Crear archivo `.env` en la raíz del proyecto con:

```env
# Twilio Credentials (obligatorias para inbound/outbound)
TWILIO_ACCOUNT_SID=AC...
TWILIO_AUTH_TOKEN=...
MESSAGING_SERVICE_SID=MG...

# Twilio Content Template (opcional, para campañas con templates)
CONTENT_SID=HX...

# Server Configuration
PORT=3000  # Puerto local (Easypanel asigna 80 automáticamente)

# Database Path (crítico para VPS/Easypanel)
DB_PATH=./data/watest.db  # Local
# DB_PATH=/app/data/watest.db  # En VPS con volumen montado

# Admin Dashboard Authentication (opcional pero recomendado)
ADMIN_USER=admin
ADMIN_PASS=tu_password_seguro
```

### Configuración de Base de Datos

#### Local (desarrollo)
```env
DB_PATH=./data/watest.db
```
La base de datos se crea automáticamente en `data/watest.db` la primera vez que se ejecuta `server.js`.

#### VPS/Easypanel (producción)
```env
DB_PATH=/app/data/watest.db
```

**IMPORTANTE:** En Easypanel, configurar un volumen persistente:
- Nombre del volumen: `watest-data`
- Mount path: `/app/data`
- Esto garantiza que la base de datos sobreviva a reinicios y redespliegues

## 📱 Uso

### Ejecutar el Servidor (Local)
```bash
npm start
```
El servidor escuchará en el puerto configurado (default: 3000)

- Dashboard Admin: `http://localhost:3000/admin`
- Webhook Inbound: `POST http://localhost:3000/twilio/inbound`
- Health Check: `GET http://localhost:3000/health`

### Probar Webhook Localmente con ngrok

```bash
# 1. Instalar ngrok (si no lo tienes)
# https://ngrok.com/download

# 2. Exponer puerto local
ngrok http 3000

# 3. Copiar URL pública (ej: https://abc123.ngrok.io)
# 4. Configurar en Twilio Messaging Service → Integration → Incoming Messages:
#    https://abc123.ngrok.io/twilio/inbound
```

### Enviar Campañas Outbound

#### Modo 1: Con Template de Twilio (CONTENT_SID)
```bash
node send-test.js
```
Usa el template configurado en `.env` con variables definidas en el script.

#### Modo 2: Mensaje Directo (sin template)
```bash
node send-test.js --body "Tu mensaje personalizado aquí"
```
Envía un mensaje de texto simple sin usar templates.

**Configuración de destinatarios:** Editar `RECIPIENTS` en `send-test.js:14-20`

### Acceder al Dashboard Admin

```
URL: http://localhost:3000/admin
Autenticación: Basic Auth (usuario/contraseña configurados en .env)
```

**Secciones del Dashboard:**
- **Resumen**: Estadísticas generales (contactos, mensajes, campañas, opt-outs)
- **Contactos**: Listado completo con búsqueda, ordenamiento y acciones rápidas
- **Mensajes**: Registro de mensajes inbound/outbound con filtros
- **Campañas**: Gestión de campañas con detalle de destinatarios
- **Opt-outs**: Usuarios que solicitaron BAJA

### Integración n8n (gestión de workflows)

Variables requeridas en `.env`:

```env
N8N_API_URL=https://tu-instancia-n8n/api/v1
N8N_API_KEY=tu_public_api_key
```

Comandos CLI:

```bash
npm run n8n:list
npm run n8n:get -- <id>
npm run n8n:create -- n8n/workflows/mi-flujo.json
npm run n8n:update -- <id> n8n/workflows/mi-flujo.json
npm run n8n:delete -- <id>
npm run n8n:activate -- <id>
npm run n8n:deactivate -- <id>
npm run n8n:duplicate -- <id> "Mi flujo copia"
```

API administrativa protegida:

- `GET /admin/api/n8n/status`
- `GET /admin/api/n8n/workflows`
- `GET /admin/api/n8n/workflows/:id`
- `POST /admin/api/n8n/workflows`
- `PUT /admin/api/n8n/workflows/:id`
- `DELETE /admin/api/n8n/workflows/:id`
- `POST /admin/api/n8n/workflows/:id/activate`
- `POST /admin/api/n8n/workflows/:id/deactivate`
- `POST /admin/api/n8n/workflows/:id/duplicate`

## 🗄️ Base de Datos

### Esquema SQLite

El sistema usa SQLite con **6 tablas principales**:

| Tabla | Propósito | Campos Clave |
|-------|-----------|--------------|
| **contacts** | Contactos master | phone (único), name, status (active/opted_out/invalid) |
| **vehicles** | Vehículos asociados a contactos | make, model, year, price, link |
| **opt_outs** | Registro de BAJA | phone (único), reason (user_request/manual) |
| **campaigns** | Campañas outbound | name, status (draft/active/completed/cancelled), message_template |
| **campaign_recipients** | Tracking por destinatario | status (pending/sent/delivered/failed/skipped), message_sid, error_message |
| **messages** | Log unificado inbound/outbound | direction (inbound/outbound), contact_id, campaign_id, body, message_sid, status |

**Ver esquema completo:** `db/schema.sql`

**Documentación detallada:** `docs/db.md`

### Estados de Contactos

- **active**: Contacto normal, puede recibir campañas
- **opted_out**: Usuario pidió BAJA, excluido de futuras campañas
- **invalid**: Teléfono inválido o delivery failures

### Flujo de Opt-out (BAJA)

1. Usuario responde "BAJA" o "3" al webhook inbound
2. Sistema inserta en `opt_outs` (phone, reason='user_request')
3. Actualiza `contacts.status = 'opted_out'`
4. Futuras campañas filtran automáticamente con `WHERE status='active'`

## 🔌 Endpoints

### Webhook Inbound

```
POST /twilio/inbound
Content-Type: application/x-www-form-urlencoded
```

**Parámetros (Twilio envía):**
- `From`: Número del remitente (ej: `whatsapp:+56975400946`)
- `Body`: Contenido del mensaje
- `MessageSid`: ID único del mensaje de Twilio

**Respuesta:** TwiML XML
```xml
<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Message>Texto de respuesta automática</Message>
</Response>
```

**Lógica condicional actual:**
- "BAJA" o "3" → Procesa opt-out y confirma
- "1" o "CONSIGN" → Flujo de consignación
- "2" o "INFO" → Flujo de información
- Default → Menú principal

### Dashboard Admin

```
GET /admin                   # Resumen (estadísticas)
GET /admin/contacts          # Lista de contactos (paginada, búsqueda)
GET /admin/messages          # Mensajes (filtro inbound/outbound)
GET /admin/campaigns         # Campañas (paginada)
GET /admin/campaigns/:id     # Detalle de campaña + recipients
GET /admin/opt-outs          # Lista de opt-outs (paginada)
```

**Autenticación:** HTTP Basic Auth (opcional, configurar `ADMIN_USER` y `ADMIN_PASS`)

### Health Check

```
GET /health
Response: "ok" (200 OK)
```
Útil para monitoring y healthchecks de Easypanel/Docker.

## 🚢 Despliegue

### Despliegue en Easypanel (Hostinger VPS)

#### 1. Configuración Inicial en Easypanel

**Crear nueva aplicación:**
- Nombre: `wa-test` (o el nombre que prefieras)
- Source: GitHub repository (este repo)
- Build method: **Dockerfile** (NO buildpacks)

**Configurar Variables de Entorno:**
```env
TWILIO_ACCOUNT_SID=AC...
TWILIO_AUTH_TOKEN=...
MESSAGING_SERVICE_SID=MG...
CONTENT_SID=HX...  # Opcional
DB_PATH=/app/data/watest.db  # IMPORTANTE: usar path con volumen
ADMIN_USER=admin
ADMIN_PASS=tu_password_seguro
```

**Configurar Volumen Persistente (CRÍTICO):**
- Nombre: `watest-data`
- Mount path: `/app/data`
- Esto garantiza que SQLite persista entre redespliegues

#### 2. Configuración de Dominio

Easypanel asigna automáticamente un dominio HTTPS:
```
https://wa-test-wa-test.abc123.easypanel.host
```

O configurar dominio custom en Easypanel → Domains.

#### 3. Configurar Webhook en Twilio

En Twilio Console → Messaging Services → [Tu Servicio]:
- **Integration → Incoming Messages**
- Seleccionar: "Send a webhook"
- **Request URL**: `https://tu-dominio.easypanel.host/twilio/inbound`
- **Method**: HTTP POST
- **Format**: application/x-www-form-urlencoded

#### 4. Verificar Deployment

```bash
# 1. Health check
curl https://tu-dominio.easypanel.host/health
# Debe responder: ok

# 2. Verificar dashboard
# Abrir en navegador: https://tu-dominio.easypanel.host/admin

# 3. Verificar logs en Easypanel
# Buscar: "Listening on 80" (o el puerto asignado)
```

### Docker Build Local (Opcional)

```bash
# Build imagen
docker build -t wa-test .

# Run con .env
docker run -p 3000:3000 --env-file .env wa-test

# Run con volumen para DB persistente
docker run -p 3000:3000 --env-file .env \
  -v $(pwd)/data:/app/data \
  wa-test
```

### Troubleshooting Deployment

**Problema:** "package.json missing" durante build
- **Causa:** Build context incorrecto
- **Solución:** Verificar que el Source en Easypanel apunta al repositorio correcto

**Problema:** Base de datos se borra al redesplegar
- **Causa:** Volumen no configurado
- **Solución:** Crear volumen `watest-data` montado en `/app/data` y configurar `DB_PATH=/app/data/watest.db`

**Problema:** Webhook no recibe mensajes
- **Checklist:**
  1. URL webhook configurada correctamente en Twilio
  2. HTTPS habilitado (requerido por Twilio)
  3. Servidor accesible públicamente
  4. Health check responde correctamente

**Problema:** Error "Docker API version 1.44 required"
- **Causa:** Docker Engine del VPS desactualizado, buildpacks incompatibles
- **Solución:** Usar **Dockerfile** en lugar de buildpacks (ya configurado)

## 📚 Documentación Adicional

- **[docs/ProyectoWatest.md](docs/ProyectoWatest.md)**: Documentación histórica completa del proyecto, setup y resolución de problemas
- **[docs/db.md](docs/db.md)**: Documentación detallada del esquema de base de datos, queries útiles y ejemplos
- **[docs/quick-wins-and-roadmap.md](docs/quick-wins-and-roadmap.md)**: Quick wins, roadmap por etapas y checklist de seguridad (próximo)

## 🔐 Seguridad y Buenas Prácticas

### Protección de Credenciales
- **NUNCA** subir `.env` al repositorio
- Usar `.gitignore` para excluir archivos sensibles
- Rotar credenciales periódicamente

### Backup de Base de Datos

```bash
# Backup manual (local)
cp data/watest.db data/backups/watest-$(date +%Y%m%d).db

# Backup en VPS (conectar por SSH)
docker exec -it wa-test-container cp /app/data/watest.db /app/data/backups/watest-$(date +%Y%m%d).db
```

**Recomendación:** Configurar backups automáticos diarios del volumen `/app/data`

### Rate Limiting (Pendiente)
Actualmente NO implementado. Considerar agregar rate limiting para:
- Webhook inbound (evitar spam)
- Dashboard admin (evitar ataques de fuerza bruta)

### Validación de Webhooks de Twilio (Pendiente)
Validar que los requests a `/twilio/inbound` realmente vienen de Twilio usando Request Validation (X-Twilio-Signature).

## 🤝 Contribuir

1. Fork del repositorio
2. Crear branch para feature (`git checkout -b feature/nueva-funcionalidad`)
3. Commit cambios (`git commit -m 'feat: añadir nueva funcionalidad'`)
4. Push al branch (`git push origin feature/nueva-funcionalidad`)
5. Crear Pull Request

## 📄 Licencia

[Especificar licencia del proyecto]

---

# Bitácora Histórica y Contexto Técnico

> *Sección de referencia histórica sobre el proceso de desarrollo y resolución de problemas. Ver [docs/ProyectoWatest.md](docs/ProyectoWatest.md) para contexto completo.*

## Guía base (hasta aquí): Twilio + WhatsApp (Meta) + Webhook en VPS (Easypanel)

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

