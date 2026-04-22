# Spec: Importación de Contactos y Vehículos por Marca

## Objetivo

Sistema de importación de contactos desde CSVs organizados por marca, con soporte para:
- Múltiples vehículos por contacto
- Actualización de vehículos existentes  
- Trazabilidad de origen y timestamps
- Visualización por marca en UI

---

## Estado Actual del Proyecto (Análisis)

### Lo que YA FUNCIONA:

| Item | Estado | Ubicación |
|------|--------|-----------|
| Importar CSV | ✅ Funciona | `server.js:766` (`/admin/import/upload`) |
| Múltiples vehículos por contacto | ✅ Funciona | `db/index.js:353` (`createContactWithVehicle`) |
| Normalización E.164 | ✅ Funciona | `server.js:linea normalizePhone` |
| Tabla contacts | ✅ Existe | `db/schema.sql:6` |
| Tabla vehicles | ✅ Existe | `db/schema.sql:22` |
| Trigger updated_at | ✅ Existe | `db/schema.sql:136` |

### Lo que FALTA (por implementar):

| Item | Estado | Prioridad |
|------|--------|----------|
| Columnas origin, external_id en vehicles | ❌ Alta |
| Lógica UPDATE por make+model+year | ❌ Alta |
| Filtro por marca en UI contactos | ❌ Alta |
| Ver vehículos del contacto | ❌ Media |

---

## Formato del CSV de Entrada

Archivo por cada marca (ej: `ford.csv`, `toyota.csv`):

```csv
Telefono,Nombre,Marca,Modelo,Año,Precio,Link,Origen,ID_Origen
+56944114154,,Ford,Explorer,2022,29000000,https://www.chileautos.cl/...,barb,barbara:8339
+56912345678,Juan Perez,Toyota,Corolla,2020,15000000,https://www.chileautos.cl/...,juan,juan:1234
```

| Campo | Tipo | Requerido | Descripción |
|-------|------|----------|-------------|
| Telefono | string | ✅ | E.164: +569XXXXXXXX |
| Nombre | string | ❌ | Nombre del contacto |
| Marca | string | ✅ | Make: Ford, Toyota, etc. |
| Modelo | string | ✅ | Model: Explorer, Corolla, etc. |
| Año | integer | ✅ | Año del vehículo |
| Precio | float | ❌ | Precio en CLP |
| Link | string | ❌ | URL de publicación |
| Origen | string | ❌ | Origen (ej: "barb") |
| ID_Origen | string | ❌ | ID externo (ej: "barbara:8339") |

---

## Implementación por Fase

### Fase 1: Schema (Mínimo)

**Archivo:** `db/schema.sql`

```sql
-- Agregar columnas a vehicles (ejecutar una sola vez)
ALTER TABLE vehicles ADD COLUMN origin TEXT;
ALTER TABLE vehicles ADD COLUMN external_id TEXT;
```

**Verificar existencia de columnas:**
```sql
PRAGMA table_info(vehicles);
-- Debe mostrar: origin, external_id
```

---

### Fase 2: Lógica de Importación

**Ubicación actual:** `db/index.js:778` (`bulkImportContactsAndVehicles`)

**Cambios requeridos:**

1. Agregar columnas al INSERT:
```javascript
const insertVehicleStmt = db.prepare(`
    INSERT INTO vehicles (contact_id, make, model, year, price, link, origin, external_id, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now', 'localtime'), datetime('now', 'localtime'))
`);
```

2. Agregar búsqueda de vehículo existente:
```javascript
const getVehicleStmt = db.prepare(`
    SELECT id FROM vehicles 
    WHERE contact_id = ? AND make = ? AND model = ? AND year = ?
`);
```

3. Lógica UPDATE si existe:
```javascript
const updateVehicleStmt = db.prepare(`
    UPDATE vehicles 
    SET price = ?, link = ?, origin = ?, external_id = ?, updated_at = datetime('now', 'localtime')
    WHERE contact_id = ? AND make = ? AND model = ? AND year = ?
`);
```

**Reglas de negocio:**

| Escenario | Acción |
|-----------|--------|
| Teléfono nuevo | Crear contactos + vehículo |
| Teléfono existente | Actualizar nombre si viene vacío → agregar vehículo |
| Vehículo existe (mismo make+model+year) | **UPDATE**: price, link, origin, external_id |
| Mismo teléfono, diferente vehículo | INSERT nuevo vehículo |

---

### Phase 3: UI - Filtro por Marca en Contactos

**Ubicación:** `admin/pages.js:109` (`renderContactsPage`)

**Cambios requeridos:**

1. Obtener lista de marcas con conteo:
```javascript
// nuevas funciones en db/index.js
export function listVehicleMakes() {
    return db.prepare(`
        SELECT make, 
               COUNT(DISTINCT contact_id) as contacts,
               COUNT(*) as vehicles
        FROM vehicles 
        GROUP BY make
        ORDER BY make
    `).all();
}

export function listContactsByMake(make) {
    return db.prepare(`
        SELECT c.*, GROUP_CONCAT(v.make) as makes
        FROM contacts c
        JOIN vehicles v ON v.contact_id = c.id
        WHERE v.make = ?
        GROUP BY c.id
        ORDER BY c.updated_at DESC
        LIMIT ? OFFSET ?
    `).all(make, limit, offset);
}
```

2. Modificar endpoint `server.js:178`:
```javascript
app.get('/admin/contacts', (req, res) => {
    const { limit, offset } = getPaging(req);
    const query = String(req.query.q || '').trim();
    const make = String(req.query.make || '').trim();
    
    // obtener marcas
    const makes = listVehicleMakes();
    
    // filtrar por marca o query
    const contacts = make 
        ? listContactsByMake(make)
        : listContacts({ limit, offset, query });
    
    res.status(200).type('text/html').send(renderContactsPage({
        contacts,
        makes,
        make,
        query,
        offset,
        limit
    }));
});
```

3. Render chips en `renderContactsPage`:
```javascript
// Agregar al inicio de la página
const chipBase = '/admin/contacts';
const chips = makes.map(m => 
    `<a class="chip ${make === m.make ? 'active' : ''}" href="${chipBase}?make=${encodeURIComponent(m.make)}">${m.make} <span class="muted">${m.contacts}</span></a>`
).join('');

const content = `<section class="panel">
    <div class="panel-header">
        <div>
            <h1>Contactos</h1>
            <div class="chip-group">${chips}</div>
        </div>
        ...
`;
```

---

### Fase 4: UI - Ver Vehículos del Contacto

**Ubicación:** `admin/pages.js:189` (`renderContactEditPage`)

**Cambios requeridos:**

1. Nueva función en `db/index.js`:
```javascript
export function getVehiclesByContactId(contactId) {
    return db.prepare(`
        SELECT * FROM vehicles 
        WHERE contact_id = ?
        ORDER BY updated_at DESC
    `).all(contactId);
}
```

2. Modificar `renderContactEditPage` para mostrar vehículos:
```javascript
const vehicles = contact ? getVehiclesByContactId(contact.id) : [];

const vehiclesHtml = vehicles.length > 0 
    ? vehicles.map(v => `
        <div class="vehicle-card">
            <strong>${v.make} ${v.model} ${v.year}</strong>
            <div>$${v.price?.toLocaleString('es-CL')}</div>
            <a href="${v.link}" target="_blank">Ver publicación</a>
            ${v.origin ? `<span class="badge">${v.origin}</span>` : ''}
        </div>
    `).join('')
    : '<p class="muted">Sin vehículos registrados</p>';
```

---

## Archivos a Modificar

| Archivo | Cambios |
|--------|--------|
| `db/schema.sql` | Agregar columnas origin, external_id |
| `db/index.js` | listVehicleMakes, listContactsByMake, getVehiclesByContactId, bulkImportContactsAndVehicles (update) |
| `server.js` | Endpoint /admin/contacts (aceptar make query param) |
| `admin/pages.js` | renderContactsPage (chips), renderContactEditPage (vehículos) |
| `admin/render.js` | Agregar renderChipGroup si es necesario |

---

## Checklist de Implementación

- [ ] **Fase 1:** Agregar columnas origin, external_id a vehicles
- [ ] **Fase 2:** Actualizar bulkImportContactsAndVehicles con lógica UPDATE
- [ ] **Fase 3:** Agregar filtro por marca en /admin/contacts
- [ ] **Fase 4:** Mostrar vehículos en edición de contacto

---

## Endpoint Existentes (Referencia)

```
GET  /admin                  → Dashboard (stats)
GET  /admin/contacts        → Lista contactos (aceptar ?make=Toyota)
GET  /admin/contacts/:id    → Editar contacto
POST /admin/contacts       → Crear contacto
POST /admin/contacts/:id  → Actualizar contacto
GET  /admin/import        → Página de importación
POST /admin/import/upload → Subir CSV
POST /admin/import/confirm → Confirmar importación
```

---

## Notas

- El trigger `trg_veh_updated_at` ya existe y actualiza `updated_at` automáticamente
- La importación actual YA funciona con make+model+year+precio+link (sin origin/external_id)
- El formato E.164 es validado por `normalizePhone()` antes de insertar