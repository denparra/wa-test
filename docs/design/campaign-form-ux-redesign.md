# UX/UI Redesign: Formulario de Campaña (`/admin/campaigns/new`)

## Diagnóstico Actual

### Lo que funciona bien
- El modo test con selección de contactos existe (pero está escondido)
- El preview de mensajes con datos reales existe
- Los segmentos guardados existen
- El scheduling con cron ya funciona

### Problemas raíz del formulario actual

| Problema | Impacto | Evidencia en código |
|----------|---------|-------------------|
| 3 conceptos mezclados sin jerarquía visual | El usuario no sabe qué hace cada sección | Preview + Test Mode + Recipients al mismo nivel |
| Modo test escondido detrás de un checkbox | Funcionalidad clave no descubrible | `testModeToggle` con `class="hidden"` |
| "Guarda primero" aparece DESPUÉS de hacer click | Fricción innecesaria | `sendBtn.disabled = true` con alert en `sendTestSelection()` |
| Filtros duplicados: Preview y Destinatarios son casi idénticos | Doble trabajo | `previewMake/previewModel` vs `filterMake/filterModel` |
| No existe el concepto de "Campaña de Prueba" formal | Para verificar el pipeline completo (cron → send → status) hay que improvisar | Ausente |
| Formulario es un scroll largo sin estructura | Sobrecarga cognitiva | ~700 líneas en una sola función |
| `Tipo` dropdown solo tiene "Twilio Template" | Sin utilidad real | `<select name="type">` con un solo `<option>` |
| Warning "⚠️ asigna destinatarios AHORA" es alarmante | Genera ansiedad | Texto en rojo al final del form |

---

## Tres conceptos a separar visualmente

El formulario actual mezcla tres cosas que tienen propósitos distintos:

| Concepto | Propósito | Pipeline que activa |
|----------|-----------|-------------------|
| **Preview** | Ver cómo queda el mensaje con datos reales | Ninguno — solo lectura |
| **Envío de prueba rápida** | Enviar a 1-3 números ahora mismo sin crear campaña | Twilio directo, sin DB |
| **Campaña de Prueba** | Verificar el pipeline completo: cron → trigger → send → delivery status | Exactamente igual que producción, pero con destinatarios manuales |

El tercer caso es el más importante y el más ausente. Es la forma de confirmar que todo funciona antes de lanzar una campaña masiva.

---

## Concepto nuevo: Campaña de Prueba 🧪

Una **Campaña de Prueba** es una campaña REAL (existe en la DB, usa el mismo cron de scheduling, genera tracking de entrega) pero tiene dos diferencias:

1. Los destinatarios se eligen manualmente desde la lista de contactos (sólo activos, sin opt-out)
2. Se muestra con un badge ámbar "TEST" en la lista de campañas para distinguirla

### Campo en la DB: `is_test`

```sql
-- Migración a agregar en db/index.js startup
ALTER TABLE campaigns ADD COLUMN is_test INTEGER DEFAULT 0;
```

Con este flag, la lógica de listing puede mostrar el badge sin cambiar nada más en el pipeline de envío.

### Visual en lista de campañas

```
┌─────────────────────────────────────────────────────────────────┐
│  Nombre                  │ Estado  │ Recip. │ Enviados │ Fecha  │
├──────────────────────────┼─────────┼────────┼──────────┼────────┤
│  🧪 TEST - Toyota Apr    │ ✓ done  │   3    │    3     │ 25 abr │
│  Toyota Corolla 2026     │ sending │  847   │   312    │ 25 abr │
│  🧪 TEST - Ford verify   │ ✓ done  │   2    │    2     │ 24 abr │
└─────────────────────────────────────────────────────────────────┘
```

Las campañas de prueba muestran el ícono 🧪 y el prefijo "TEST" en el nombre, y la fila tiene un fondo ámbar suave (`background: #fffbeb`). Se mantienen en el historial igual que las campañas reales.

---

## Propuesta de Rediseño: Wizard de 3 pasos

```
[1. Mensaje] → [2. Preview] → [3. Destinatarios + Envío]
```

Cada paso tiene una sola responsabilidad. El paso 3 tiene dos modos: **Campaña de Prueba** y **Campaña de Producción**.

---

## Paso 1 — Mensaje

**Objetivo**: Definir el nombre y el contenido.

### Layout

```
┌─────────────────────────────────────────────────────┐
│  Nueva Campaña                   Paso 1 de 3 ●○○   │
├─────────────────────────────────────────────────────┤
│  Nombre *                                           │
│  [_______________________________________________]  │
│                                                     │
│  Tipo de mensaje:                                   │
│  [● Mensaje libre]  [○ Plantilla Twilio (SID)]      │
│                                                     │
│  ┌─────────────────────────────────────────────┐   │
│  │ Hola {{nombre}}, te contactamos sobre tu    │   │
│  │ {{marca}} {{modelo}}...                     │   │
│  └─────────────────────────────────────────────┘   │
│  [+ {{nombre}}] [+ {{marca}}] [+ {{modelo}}]        │
│  256 caracteres restantes                           │
│                                                     │
│                                    [Siguiente →]    │
└─────────────────────────────────────────────────────┘
```

### Cambios vs. actual

1. **Tabs para tipo de mensaje**: "Mensaje libre" / "Plantilla Twilio" — en vez del dropdown actual con una sola opción
2. **Botones de inserción de variables**: click inserta `{{nombre}}` en la posición del cursor en el textarea
3. **Contador de caracteres** en tiempo real
4. **Sin distractores**: el botón único es "Siguiente"

---

## Paso 2 — Preview

**Objetivo**: Ver cómo queda el mensaje renderizado con datos reales antes de continuar.

### Layout

```
┌─────────────────────────────────────────────────────┐
│  Nueva Campaña                   Paso 2 de 3 ●●○   │
├─────────────────────────────────────────────────────┤
│  Vista previa del mensaje                           │
│                                                     │
│  Filtrar muestra por marca:                         │
│  [Todos] [Toyota] [Ford] [Chevrolet]  ← chips       │
│  Modelo (opcional): [_______]                       │
│                                                     │
│  ┌──────────────────────────────────────────────┐  │
│  │ +569****1234  "Hola Juan, te contactamos     │  │
│  │                sobre tu Toyota Corolla 2020" │  │
│  │ +569****5678  "Hola María, te contactamos    │  │
│  │                sobre tu Ford Explorer 2022"  │  │
│  │ +569****9012  "Hola , te contactamos sobre   │  │
│  │                tu Chevrolet Spark 2019"      │  │
│  └──────────────────────────────────────────────┘  │
│  (3 muestras aleatorias — solo visual)             │
│                                                     │
│  [← Anterior]                      [Siguiente →]   │
└─────────────────────────────────────────────────────┘
```

### Cambios vs. actual

1. **Solo preview** — no hay envío aquí, ese concepto va al paso 3
2. **Chips de marca** usando `listVehicleMakes()` ya implementado
3. **3 muestras aleatorias** renderizadas con variables reales
4. **No hay filtros duplicados** — este paso es solo para ver, no para seleccionar audiencia

---

## Paso 3 — Destinatarios y Envío

**Objetivo**: Elegir quién recibe la campaña y cuándo. Aquí se bifurca entre Campaña de Prueba y Campaña de Producción.

### Layout — selección de modo

```
┌─────────────────────────────────────────────────────┐
│  Nueva Campaña                   Paso 3 de 3 ●●●   │
├─────────────────────────────────────────────────────┤
│  Tipo de campaña:                                   │
│                                                     │
│  ┌─────────────────────┐  ┌─────────────────────┐  │
│  │  🧪 Prueba          │  │  🚀 Producción       │  │
│  │                     │  │                     │  │
│  │  Destinatarios      │  │  Destinatarios por  │  │
│  │  seleccionados      │  │  filtro masivo       │  │
│  │  manualmente        │  │                     │  │
│  │  (verificar         │  │  (campaña real       │  │
│  │  pipeline)          │  │  para tu audiencia) │  │
│  └─────────────────────┘  └─────────────────────┘  │
└─────────────────────────────────────────────────────┘
```

---

### Modo Prueba 🧪

```
┌─────────────────────────────────────────────────────┐
│  🧪 Campaña de Prueba                               │
├─────────────────────────────────────────────────────┤
│  Buscar contactos (activos, sin opt-out):           │
│  [Nombre o teléfono_______________] [Buscar]        │
│                                                     │
│  ☑ Juan Pérez       +569****1234   Toyota Corolla   │
│  ☐ María García     +569****5678   Ford Explorer    │
│  ☑ Carlos Ruiz      +569****9012   Chevrolet Spark  │
│  ☐ Ana López        +569****3456   Toyota Hilux     │
│                                                     │
│  Seleccionados: 2 contactos                         │
│                                                     │
│  ─────────────────────────────────────────────────  │
│  Programar envío:                                   │
│  ○ Borrador (enviar manualmente después)            │
│  ○ Enviar ahora                                     │
│  ● Programar para: [2026-04-25 ▼]  [10:30 ▼]       │
│                                                     │
│  [← Anterior]              [Crear Campaña de Prueba]│
└─────────────────────────────────────────────────────┘
```

**Comportamiento del selector de contactos:**
- Búsqueda en tiempo real contra `listContacts()` con `status = 'active'`
- Excluye automáticamente opt-outs (igual que el pipeline de producción)
- Muestra: nombre, teléfono enmascarado, vehículo principal
- Checkbox de selección múltiple
- "Seleccionar todos los resultados" para búsquedas pequeñas
- Sin límite explícito, pero la UI disuade selecciones grandes (es para pruebas)

**Al crear:**
- `campaigns.is_test = 1`
- Los contactos seleccionados se asignan como `campaign_recipients` directamente
- El scheduling usa el mismo mecanismo de cron exactamente
- Badge 🧪 TEST aparece en la lista de campañas

---

### Modo Producción 🚀

```
┌─────────────────────────────────────────────────────┐
│  🚀 Campaña de Producción                           │
├─────────────────────────────────────────────────────┤
│  Segmento guardado: [-- Cargar --▼] [Guardar filtro]│
│                                                     │
│  Marca:  [Toyota ×] [Ford] [Chevrolet]              │
│  Modelo: [_________]  Año: [2018] - [2024]          │
│                                                     │
│  ┌──────────────────────────────────────────────┐  │
│  │  📊 847 destinatarios activos                │  │
│  │  (excluye los 12 con opt-out)               │  │
│  │                                              │  │
│  │  +569****1234  Juan Pérez    Toyota Corolla  │  │
│  │  +569****5678  María García  Ford Explorer   │  │
│  │  ... y 845 más                               │  │
│  └──────────────────────────────────────────────┘  │
│                                                     │
│  Programar envío:                                   │
│  ○ Borrador (enviar manualmente después)            │
│  ○ Enviar ahora                                     │
│  ● Programar para: [2026-04-25 ▼]  [10:30 ▼]       │
│                                                     │
│  [← Anterior]                    [Crear Campaña ✓] │
└─────────────────────────────────────────────────────┘
```

**Cambios vs. actual:**
- **Conteo en tiempo real** al cambiar filtros (sin hacer click en "Cargar")
- **Radio buttons** para tipo de envío — en vez del datetime vacío confuso
- **Sin el warning alarmante** — el flujo guía naturalmente

---

## Flujo completo del usuario para verificar el pipeline

```
1. Ir a /admin/campaigns/new
2. Paso 1: Escribir nombre "TEST Toyota Abr" + mensaje libre
3. Paso 2: Ver preview con 3 contactos reales → confirmar que variables se renderizan bien
4. Paso 3: Elegir modo 🧪 Prueba
         → Buscar "Juan" → seleccionar 2 contactos
         → Programar para en 3 minutos
         → Click "Crear Campaña de Prueba"
5. Ir a /admin/campaigns → ver badge 🧪 TEST en la lista
6. Esperar 3 minutos → la campaña pasa a "sending" → mensajes enviados
7. Revisar el tracking: delivery status, replies
8. ✅ Pipeline verificado → crear la campaña de producción con confianza
```

---

## Resumen de cambios técnicos

### Archivos a modificar

| Archivo | Cambio |
|---------|--------|
| `db/schema.sql` | Agregar `is_test INTEGER DEFAULT 0` a campaigns |
| `db/index.js` | Migración `is_test`; actualizar `createCampaign`, `listCampaigns`, `getCampaignById` |
| `server.js` | Endpoint de creación acepta `isTest`; lógica de asignación manual de recipients |
| `admin/pages.js` | Wizard 3 pasos + badge en `renderCampaignsPage` + selector de contactos |

### Migración DB

```javascript
// En db/index.js startup (mismo patrón que campaigns.type, campaigns.scheduled_at)
if (campaignsTableExists) {
    const hasIsTest = campaignsInfo.some(col => col.name === 'is_test');
    if (!hasIsTest) {
        db.exec(`ALTER TABLE campaigns ADD COLUMN is_test INTEGER DEFAULT 0`);
    }
}
```

### Lógica de creación de campaña de prueba

```javascript
// POST /admin/api/campaigns — body incluye isTest + contactIds
// Si isTest === true:
//   1. Crear campaña con is_test = 1
//   2. Ignorar filtros de vehículos
//   3. Asignar contactIds directamente como recipients (usando assignRecipientsToCampaign)
//   4. Si scheduledAt → status = 'scheduled', si no → status = 'draft'
```

### Badge en lista de campañas

```javascript
// En renderCampaignsPage, la columna "Nombre" renderiza:
{ key: 'name', label: 'Nombre', render: (row) =>
    row.is_test
      ? `<span style="background:#fffbeb;border:1px solid #f59e0b;color:#92400e;border-radius:4px;padding:1px 6px;font-size:11px;margin-right:6px;">🧪 TEST</span>${escapeHtml(row.name)}`
      : escapeHtml(row.name)
}
```

---

## Checklist de Implementación

```
Schema y DB
- [ ] is_test column en campaigns (migración + schema.sql)
- [ ] createCampaign acepta isTest param
- [ ] listCampaigns retorna is_test

Paso 1 — Mensaje
- [ ] Tabs "Mensaje libre" / "Plantilla Twilio"
- [ ] Botones de inserción de variables
- [ ] Contador de caracteres
- [ ] Step indicator (●○○ / ●●○ / ●●●)

Paso 2 — Preview
- [ ] Chips de marca (listVehicleMakes)
- [ ] 3 muestras aleatorias renderizadas
- [ ] Solo visual, sin envío

Paso 3 — Destinatarios
- [ ] Cards de selección Prueba / Producción
- [ ] Modo Prueba: buscador de contactos activos (sin opt-out)
- [ ] Modo Prueba: checkbox multi-selección
- [ ] Modo Producción: filtros de vehículos existentes
- [ ] Modo Producción: conteo en tiempo real
- [ ] Radio buttons para timing (borrador / ahora / programar)

Lista de campañas
- [ ] Badge 🧪 TEST en filas con is_test = 1
- [ ] Fondo ámbar suave en filas de prueba
```

---

## Notas de diseño

- La selección de contactos en Modo Prueba debe mostrar solo `status = 'active'` y excluir opt-outs — exactamente la misma lógica que filtra los recipients en producción. Esto garantiza que lo que ves en el test es lo que pasaría en producción.
- El campo `is_test` en la DB es suficiente para el badge — no necesita un campo separado de color. El frontend lee `is_test` y aplica el estilo.
- El wizard puede implementarse con JS puro (mostrar/ocultar secciones) sin rutas nuevas en el servidor. El form siempre hace POST a `/admin/api/campaigns`.
- Los filtros de marca en Paso 2 (preview) y Paso 3 Producción pueden compartir estado JS para evitar que el usuario repita el trabajo.
