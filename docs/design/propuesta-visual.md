# Propuesta Visual y de Interactividad — WA-Test (Queirolo Autos)

> Análisis de UI/UX actual + propuesta de rediseño orientada a profesionalismo, confianza y fluidez operativa. Fecha: 2026-04-21.
> Este documento no toca código — es la guía de decisiones para una implementación posterior.

---

## 1. Contexto y diagnóstico

### 1.1 ¿Quién usa esto?

- **Operador diario** de Queirolo Autos: no es desarrollador, usa el panel para enviar campañas, ver respuestas y gestionar opt-outs.
- **Eventualmente el dueño** revisa resúmenes: necesita ver métricas clave de un vistazo.
- **Frecuencia:** varias veces al día. Sesiones cortas (5–15 min). Ergo: velocidad, claridad, pocos clics.

### 1.2 Qué hace bien el diseño actual

| ✅ Fortaleza | Comentario |
|-------------|------------|
| Paleta cálida coherente | Terracota/crema alinea con marca artesanal local |
| Cards con hover sutil | Micro-interacción correcta en dashboard |
| Sistema de badges semántico | `badge-good/warn/bad/accent` ya está bien definido |
| Help text contextual | Cada pantalla explica para qué sirve |
| Empty states con CTA | Guía al usuario cuando no hay datos |
| Responsive básico | Breakpoint a 700px funciona para mobile |

### 1.3 Dónde sufre

| ⚠️ Problema | Impacto |
|-------------|---------|
| CSS inline de ~370 líneas dentro de `render.js` | Dificulta mantener, escalar y hacer temas |
| Estilos `style="..."` inline en `pages.js` | Inconsistencias visuales, difícil cambiar |
| `confirm()` y `alert()` nativos | Se ven "de los 90" — rompen la estética |
| Emojis como iconos (🗑️ ✏️ 🔍) | No escalan por densidad, cultura, accesibilidad |
| Sin feedback post-acción | Tras guardar/borrar, solo redirect silencioso |
| Sin loading states | El usuario no sabe si la app colgó o está cargando |
| Dashboard plano | 6 números sin contexto — ni tendencias ni comparativos |
| Campañas sin progreso en vivo | El endpoint `/progress` existe pero la UI no lo usa |
| Conversaciones como tabla | Un chat se ve mejor como chat, no como grid |
| Sin dark mode | Herramienta de trabajo diario debería tenerlo |
| Sin branding Queirolo | "WA Test Dashboard" no dice nada |
| Paginación genérica | No muestra total ("1–50 de 1 247") |

---

## 2. Principios de diseño

Antes de componentes, los 5 principios que guían todas las decisiones:

1. **Confianza primero** — Somos una operación comercial tocando datos de clientes. La UI debe sentirse sólida: nunca ambigua, nunca frívola.
2. **Densidad útil** — Tablas de 50+ filas son la norma. Priorizamos información por pixel sobre white-space decorativo.
3. **Acción visible** — Toda acción tiene feedback en ≤200ms (hover, loading, toast). El usuario nunca duda si "eso funcionó".
4. **Consistencia > novedad** — Mismos espaciados, mismos bordes, mismos colores. Un rediseño caótico pierde más de lo que gana.
5. **Progresivamente mejor** — Cada mejora funciona por sí sola. No requiere rewrite total.

---

## 3. Sistema visual

### 3.1 Paleta de colores extendida

La paleta actual es correcta pero **incompleta**. Faltan tokens para estados, superficies elevadas, y semántica extendida.

#### Modo claro (actual refinado)

```
Brand (Queirolo):
  --brand-500      #c85b34   (accent principal, actual)
  --brand-600      #a04923   (hover sobre brand)
  --brand-100      #fce9df   (superficie suave con marca)
  --brand-50       #fdf4ef   (tinte sutil)

Success (verde azulado, actual):
  --success-500    #1f7a6b
  --success-100    #e0f3ee

Warning:
  --warn-500       #b15a14
  --warn-100       #fff0dc

Danger:
  --danger-500     #b23a3a
  --danger-100     #fce8e8

Info (nueva, para tips/help):
  --info-500       #2c5f8a
  --info-100       #e1ecf6

Neutrales (extender):
  --ink-900        #1f1d1b   (texto principal, actual)
  --ink-700        #3a3836
  --ink-500        #5d5b56   (texto muted, actual)
  --ink-300        #8a8883
  --ink-100        #d9d5cc   (actual --line)

Superficies:
  --surface-0      #ffffff   (panel base, actual)
  --surface-1      #fbf8f3   (panel elevado)
  --surface-2      #f3efe7   (fondo app, actual --bg)
  --surface-3      #ece7dc   (separadores fuertes)
```

#### Modo oscuro (nuevo)

```
Brand:
  --brand-500      #e57952   (más saturado sobre fondo oscuro)
  --brand-600      #c85b34

Neutrales:
  --ink-900        #f0ece3   (texto principal invertido)
  --ink-500        #a8a49c
  --ink-100        #3a3733

Superficies:
  --surface-0      #1e1c1a   (panel)
  --surface-1      #262320   (panel elevado)
  --surface-2      #161513   (fondo app)
  --surface-3      #0e0d0c   (base profunda)
```

**Detección:** `@media (prefers-color-scheme: dark)` + toggle manual que guarde preferencia en `localStorage`.

### 3.2 Tipografía

**Recomendación:** reemplazar *Alegreya Sans* por **Inter** (primary) + **JetBrains Mono** (código/teléfonos/SID).

| Rol | Font actual | Propuesto | Razón |
|-----|-------------|-----------|-------|
| UI principal | Alegreya Sans | **Inter** | Inter está diseñada específicamente para UI/dashboards. Mejor legibilidad a 12–14px, más profesional. |
| Números/métricas | Alegreya Sans | **Inter** con `font-feature-settings: 'tnum'` | Dígitos tabulares alinean columnas verticalmente |
| Teléfonos E.164, SIDs Twilio | — (no distinguido) | **JetBrains Mono** | Números de teléfono son código: monospace mejora escaneo |
| Branding (logo header) | Alegreya Sans | Opcional: mantener Alegreya para identidad Queirolo | Diferenciador visual de marca |

**Escala tipográfica (reducir variaciones):**

```
--text-xs    11px / 16px    (labels de columna, microcopy)
--text-sm    13px / 20px    (cuerpo base, tablas)
--text-md    15px / 24px    (párrafos, formularios)
--text-lg    18px / 28px    (subtítulos)
--text-xl    22px / 32px    (títulos de página)
--text-2xl   28px / 36px    (métricas grandes del dashboard)
--text-3xl   40px / 48px    (hero numbers)
```

Fetch vía `@fontsource/inter` (npm) o Google Fonts CDN (más simple, sin build).

### 3.3 Iconografía

**Reemplazar emojis por SVG icons consistentes.**

**Recomendación:** [**Lucide**](https://lucide.dev) (1 500+ iconos, gratis, MIT, ~1KB por icono inline).

| Uso actual | Reemplazo Lucide |
|------------|------------------|
| 🗑️ eliminar | `trash-2` |
| ✏️ editar | `pencil` |
| 📋 copiar | `copy` |
| 🔍 buscar | `search` |
| ✅ éxito | `check-circle` |
| ⚠️ warning | `alert-triangle` |
| ❌ error | `x-circle` |
| 📞 teléfono | `phone` |
| 🚗 vehículo | `car` |
| 📤 outbound | `send` |
| 📥 inbound | `inbox` |
| 📊 métricas | `bar-chart-3` |
| 🔄 refresh | `refresh-cw` |
| ⏸️ pausar | `pause` |
| ▶️ reanudar | `play` |

**Forma de integración sin build:** inyectar SVGs inline vía helper `renderIcon(name, size)` que lea desde un mapa precompilado. Tamaño estándar: **16px** (inline), **20px** (botones), **24px** (cards del dashboard).

### 3.4 Espaciado y radio

**Sistema de espaciado (escala 4px):**

```
--space-1    4px
--space-2    8px
--space-3    12px
--space-4    16px
--space-5    20px
--space-6    24px
--space-8    32px
--space-10   40px
--space-12   48px
```

**Radios consistentes:**

```
--radius-sm    6px    (badges, botones pequeños)
--radius-md    10px   (inputs, botones)
--radius-lg    14px   (cards)
--radius-xl    18px   (panels, actual)
--radius-full  999px  (pills, nav)
```

### 3.5 Sombras (sistema capas)

```
--shadow-1   0 1px 2px rgba(0,0,0,0.04)                   (separación sutil)
--shadow-2   0 2px 8px rgba(0,0,0,0.06)                   (cards elevados)
--shadow-3   0 8px 24px rgba(0,0,0,0.08)                  (modales, tooltips)
--shadow-4   0 18px 38px rgba(31,29,27,0.08)              (panels, actual)
```

---

## 4. Componentes nuevos y upgrades

### 4.1 Toast notifications (prioridad alta)

Reemplaza todos los `alert()` y los redirects silenciosos post-guardar.

```
┌─────────────────────────────────────────┐
│ ✅  Contacto guardado correctamente   × │
└─────────────────────────────────────────┘
                                     (4s)
```

**Posición:** bottom-right. Stackable. Auto-dismiss 4s (éxito) / 6s (error).
**Variantes:** success / error / warning / info — cada una con su icono + color de borde izquierdo.
**Accesibilidad:** `role="status"` para lectores de pantalla.

**Activación:** tras redirect `?toast=created` o tras fetch exitoso en el cliente.

### 4.2 Modal/Dialog nativo

Reemplaza `confirm()`. Usar el elemento HTML `<dialog>` nativo — soporte en todos los navegadores modernos, sin librería.

```
┌───────────────────────────────────────────┐
│ ⚠️  Eliminar contacto                    │
├───────────────────────────────────────────┤
│                                           │
│ ¿Eliminar el contacto +56975400946?       │
│                                           │
│ Esta acción eliminará también 2 vehículos │
│ asociados y no se puede deshacer.         │
│                                           │
├───────────────────────────────────────────┤
│              [ Cancelar ]  [ Eliminar ]   │
└───────────────────────────────────────────┘
```

**Detalle crítico:** botón destructivo a la derecha, color `--danger-500`, texto claro ("Eliminar" no "OK"). El usuario lee derecha-última.

### 4.3 Loading states

**3 patrones según duración esperada:**

| Duración | Patrón |
|----------|--------|
| < 200ms | Nada (se siente instantáneo) |
| 200ms–2s | Spinner inline en el botón (`<button><spinner/> Guardando...</button>`) |
| > 2s | Skeleton screen (filas grises animadas donde irán datos) |

**Ejemplo skeleton para tabla de contactos:**

```
Teléfono    Nombre       Estado    Creado       Acciones
████████    ████████     ████      ██████       ██ ██ ██
████████    ██████       ████      ██████       ██ ██ ██
████████    ███████████  ████      ██████       ██ ██ ██
████████    █████        ████      ██████       ██ ██ ██
```

Las líneas animan con un shimmer (gradient moviéndose izquierda-derecha, loop 1.5s).

### 4.4 Progress bars

**Para campañas activas** (ya existe endpoint `/admin/api/campaigns/:id/progress`):

```
┌───────────────────────────────────────────────────────┐
│ Campaña: Lanzamiento Toyota Corolla 2024             │
│ ████████████████████░░░░░░░░░░░░░░ 482/1200 (40%)    │
│ ✅ 478 enviados · ⚠️ 3 opt-out · ❌ 1 fallido · ⏱ 2min │
└───────────────────────────────────────────────────────┘
```

**Polling:** `setInterval` cada 3s mientras status === 'sending'; detener al completarse.
**Animación:** barra con gradient sutil moviéndose (indica "vivo").

### 4.5 Inline validation en formularios

**Problema actual:** validación solo ocurre al submit (400 → re-render completo).

**Propuesta:** validar mientras escribe + mostrar feedback inline.

```
Teléfono (E.164)   ┌──────────────────────┐ ✅
                   │ +56975400946         │
                   └──────────────────────┘

Teléfono (E.164)   ┌──────────────────────┐ ❌
                   │ 56975400946          │
                   └──────────────────────┘
                   ⚠ Debe empezar con + y código país
```

**Implementación:** evento `input`, regex `^\+[1-9]\d{1,14}$`, mostrar icono + mensaje debajo. Deshabilitar botón de submit si hay errores.

### 4.6 Data table upgrade

**Actual:** sort client-side + search client-side. Sólido pero limitado.

**Features a sumar:**

| Feature | Beneficio |
|---------|-----------|
| **Filtros por columna** (dropdown en header) | Filtrar status, marca, año sin escribir |
| **Row selection** (checkbox) | Base para bulk actions |
| **Bulk actions toolbar** | "Cambiar estado de 12 seleccionados", "Exportar selección" |
| **Density toggle** | Compact / Normal / Comfortable — operador elige |
| **Column visibility** | Ocultar columnas poco usadas |
| **Sticky header** | Al scrollear tablas largas, header se mantiene visible |
| **Row hover → expand** | Click en fila abre detalles sin cambiar de página |

**Librería opcional:** [Tabulator](https://tabulator.info) (~90KB, MIT) si queremos todo de una. O implementación propia progresiva. Recomendación: **propia**, siguiendo el patrón actual.

### 4.7 Command palette (Cmd+K)

**Power user feature** pero barato de implementar. Abrir con `Cmd/Ctrl+K`:

```
┌────────────────────────────────────────────────┐
│ 🔍  Buscar acciones, contactos, campañas...    │
├────────────────────────────────────────────────┤
│ → Ir a Contactos                               │
│ → Crear nueva campaña                          │
│ → Importar CSV                                 │
│ ─────────────────────────────────              │
│ 📞 +56975400946 — Juan Pérez                   │
│ 📞 +56987654321 — María González               │
│ ─────────────────────────────────              │
│ 📊 Campaña: Lanzamiento Toyota                 │
└────────────────────────────────────────────────┘
```

**Índice:** últimas 20 páginas visitadas + búsqueda fuzzy sobre contactos (vía `/admin/api/contacts?q=...`). Librería liviana: [kbar](https://github.com/timc1/kbar) o propia con ~100 líneas.

---

## 5. Rediseño por página

### 5.1 Dashboard (Resumen)

**Actual:** 6 cards con un número cada una.

**Propuesta:**

```
┌─────────────────────────────────────────────────────────────────┐
│  Dashboard · Queirolo Autos                    [Últimos 7 días▾]│
└─────────────────────────────────────────────────────────────────┘

┌──────────────────┐ ┌──────────────────┐ ┌──────────────────┐
│ 📞 Contactos     │ │ 💬 Mensajes hoy  │ │ 📊 Tasa respuesta│
│                  │ │                  │ │                  │
│  1 247           │ │  87              │ │  23%             │
│  ↑ +12 semana    │ │  ▁▂▅▇▃▂▁ última hr│ │  ↑ +3% vs ayer   │
└──────────────────┘ └──────────────────┘ └──────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│ Campañas activas                                                │
│                                                                 │
│ ▶ Lanzamiento Toyota    ██████░░░░ 482/1200 · 40% · 2min eta   │
│ ⏸ Recordatorio Junio    ████████░░ 856/1000 · Pausada           │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘

┌──────────────────────────────┐ ┌──────────────────────────────┐
│ Últimas conversaciones       │ │ Opt-outs recientes           │
│ ────────────────────────     │ │ ────────────────────────     │
│ 📥 Juan Pérez    "interesa"  │ │ +56975400946 · hace 2 h      │
│ 📥 María Soto    "info?"     │ │ +56912345678 · hace 5 h      │
│ 📤 Pedro Díaz    enviado     │ │                              │
└──────────────────────────────┘ └──────────────────────────────┘
```

**Cambios clave:**
- **Sparklines** en los KPIs (mini-gráfico que muestra tendencia 7 días). Librería: [Chartist](https://gionkunz.github.io/chartist-js/) (10KB) o inline SVG simple.
- **Deltas** (flecha + variación vs período anterior) — convierte número estático en narrativa.
- **Campañas activas en vivo** con progress bars y ETA.
- **Últimas conversaciones** — link directo a cada conversación.
- **Selector de rango temporal** (7 días / 30 días / este mes).

### 5.2 Página de conversación

**Actual:** tabla con columnas (fecha, dirección, cuerpo). Funciona pero no se siente natural.

**Propuesta:** burbujas de chat tipo WhatsApp (respetando el origen).

```
┌─ Conversación · +56975400946 (Juan Pérez) ──────────┐
│ Campaña: Lanzamiento Toyota · Inició 2026-04-20    │
│                                                     │
│                                                     │
│  ┌──────────────────────────────────────┐           │
│  │ Hola Juan! Tenemos un Toyota Corolla │ 14:32  📤 │
│  │ 2018 en excelente estado...          │           │
│  └──────────────────────────────────────┘           │
│                                                     │
│           ┌───────────────────────────┐             │
│    14:45 📥│ Me interesa, cuánto vale?│             │
│           └───────────────────────────┘             │
│                                                     │
│  ┌──────────────────────────────────────┐           │
│  │ $8.500.000. Te envío el link del     │ 14:47  📤 │
│  │ vehículo: https://...                │           │
│  └──────────────────────────────────────┘           │
│                                                     │
│           ┌──────────────────────────┐              │
│    15:10 📥│ Cuando puedo verlo?     │              │
│           └──────────────────────────┘              │
│                                                     │
│  ─────────── Sin respuesta desde 15:10 ───────────  │
└─────────────────────────────────────────────────────┘
```

**Detalles:**
- **Outbound**: verde-azulado claro, alineado izquierda, con icono 📤.
- **Inbound**: crema/beige, alineado derecha, con icono 📥.
- **Separador temporal** cuando hay >30 min de silencio.
- **Status Twilio** (✓✓ leído, ✓ entregado) como en WhatsApp real.
- **Auto-scroll** al final al cargar.

### 5.3 Formulario de campaña

**Actual:** Form largo con todos los campos visibles.

**Propuesta:** wizard en 3 pasos (reduce carga cognitiva).

```
Paso 1: Contenido
┌─────────────────────────────────────────────┐
│ ● Nombre de campaña  ○ Destinatarios  ○ Envío│
├─────────────────────────────────────────────┤
│                                             │
│ Nombre  [_________________________]         │
│                                             │
│ Template [Seleccionar ▾] o                  │
│         [Escribir mensaje personalizado]    │
│                                             │
│ ┌─────────────────────────┐                 │
│ │ Hola {{name}}, tenemos  │  Preview en vivo│
│ │ un {{make}} {{model}}   │  con sample:    │
│ │ {{year}} ...            │  "Juan, Toyota  │
│ └─────────────────────────┘   Corolla 2018" │
│                                             │
│                       [ Siguiente → ]       │
└─────────────────────────────────────────────┘
```

**Preview en tiempo real** (ya existe endpoint `/admin/api/campaigns/preview`).

### 5.4 Página de contactos

**Agregar:**
- **Filtros visibles** en la parte superior: por status (active/opted_out/invalid), con vehículo / sin vehículo, rango de fechas.
- **Búsqueda con resaltado** de término encontrado.
- **Bulk actions**: seleccionar N contactos → cambiar status / exportar / eliminar.
- **Quick view**: click en fila → side panel con detalles del contacto + vehículos + últimas conversaciones, sin cambiar de página.

---

## 6. Microinteracciones y animaciones

Reglas:
- Duración: 150–250ms (nunca más de 300ms).
- Easing: `cubic-bezier(0.4, 0, 0.2, 1)` (ease-out, feel profesional).
- `prefers-reduced-motion`: respetar siempre — desactivar animaciones si el usuario lo pidió a nivel OS.

**Microinteracciones específicas:**

| Evento | Animación |
|--------|-----------|
| Hover en card del dashboard | Lift 2px + shadow más marcada (actual, mantener) |
| Click en botón | Pulse sutil antes del feedback |
| Toast aparece | Slide-up from bottom + fade (300ms) |
| Modal abre | Fade-in backdrop + scale(0.95→1) content |
| Row hover en tabla | Background highlight suave |
| Submit form → loading | Botón encoge de ancho y muestra spinner |
| Delete row | Fade-out + slide-up (250ms) antes de remover |
| Number change en dashboard | Count-up animation (librería: 1KB propia) |

---

## 7. Accesibilidad (a11y)

**Pendientes identificables sin código profundo:**

- [ ] `aria-label` en todos los botones sólo con icono (🗑️, ✏️, 🔍)
- [ ] Focus rings visibles (`:focus-visible` con ring 2px `--brand-500`)
- [ ] Navegación completa por teclado (Tab/Shift+Tab/Enter/Escape)
- [ ] `aria-live="polite"` en zona de toasts para lectores de pantalla
- [ ] Contraste mínimo WCAG AA (4.5:1) en todos los textos — el muted actual `#5d5b56` sobre `#ffffff` está ok (7.3:1), pero `#5d5b56` sobre `#f3efe7` está en 6.1:1 que es OK. Revisar badges: `--warn-500 #b15a14` sobre `--warn-100 #fff0dc` = 4.9:1 (OK).
- [ ] Escalado de texto: que zoom a 200% no rompa layout
- [ ] Labels explícitos en todos los inputs (no placeholders como labels)

---

## 8. Dark mode

**Detección + toggle:**

```
1. Default: @media (prefers-color-scheme: dark) → aplica tokens oscuros
2. Toggle manual en header (icono sol/luna) → guarda en localStorage
3. localStorage pisa el media query si hay preferencia explícita
```

**Consideraciones:**
- Logo Queirolo: tener versión para fondo oscuro (si existe logo gráfico).
- Imágenes/SVG: revisar que se vean bien en ambos modos.
- Sombras: reducir opacidad en dark (sombras oscuras sobre fondo oscuro = poco visible).

---

## 9. Branding Queirolo Autos

**Identidad actual en el panel:** "WA Test Dashboard" — genérico, no dice nada.

**Propuesta header:**

```
┌──────────────────────────────────────────────────────┐
│  🚗  Queirolo Autos · Centro de comunicaciones      │
│      ────────────────────────────────────           │
│      WhatsApp · Campañas · Seguimiento              │
└──────────────────────────────────────────────────────┘
```

Si existe logo corporativo, incluirlo (SVG, ~40px alto). Si no, iconografía `car` de Lucide + texto. El subtítulo comunica qué es el panel sin jerga técnica.

**Favicon:** un `favicon.ico` o `favicon.svg` con el logo. Actualmente no hay.

**Meta tags social sharing:** `og:title`, `og:description`, `og:image` para cuando se comparta un link del panel internamente.

---

## 10. Organización de archivos CSS (sin tocar lógica)

Hoy el CSS vive dentro de `admin/render.js` como template string. **Propuesta de extracción (sin cambio funcional):**

```
public/
├── styles/
│   ├── base.css           (reset, variables, tipografía)
│   ├── components.css     (card, button, input, badge, table, modal, toast)
│   ├── layout.css         (shell, header, nav, panel)
│   ├── utilities.css      (espaciado, texto, flex helpers)
│   └── themes/
│       ├── light.css
│       └── dark.css
├── icons/
│   └── lucide.svg         (sprite SVG con todos los iconos)
├── scripts/
│   ├── toast.js
│   ├── modal.js
│   ├── table-enhanced.js
│   └── theme-toggle.js
└── fonts/
    └── inter/             (si optamos por self-host)
```

Servir con `express.static('public')` — una línea en `server.js`, no rompe nada. El `render.js` pasa de inline CSS a `<link rel="stylesheet" href="/styles/...">`.

**Beneficios:**
- HTML de respuestas pasa de ~40KB a ~8KB (CSS se cachea en browser después del primer request)
- Cambios visuales no requieren redeploy del server (solo cache-bust)
- Más fácil revisar diffs de diseño

---

## 11. Roadmap de implementación

Dividido en 4 fases según dependencias y ROI:

### Fase A — Fundación (1–2 días)
1. Extraer CSS inline a `public/styles/` + servir estáticos
2. Tokens de diseño completos (paleta extendida, espaciado, sombras)
3. Carga de Inter + Lucide (CDN, sin build)
4. Favicon + branding básico en header

**Sin cambio visual aún — preparación.**

### Fase B — Componentes (2–3 días)
1. Toast notifications + integración con redirects (`?toast=created`)
2. Modal dialog (reemplazar `confirm()`)
3. Loading states (spinners en botones + skeletons en tablas)
4. Reemplazar emojis por Lucide icons

**Aquí ya se nota la mejora.**

### Fase C — Interactividad (2–3 días)
1. Progress bars en vivo para campañas (polling `/progress`)
2. Inline validation en formularios
3. Table upgrades (sticky header, density, row selection)
4. Flash messages sistematizados

### Fase D — Dashboard y pulido (3–4 días)
1. Rediseño dashboard con KPIs + sparklines
2. Conversación como chat burbujeado
3. Dark mode completo
4. Command palette (Cmd+K)

### Fase E (opcional) — Wow features
1. Campaign wizard (3 pasos)
2. Quick view side panel en contactos
3. Bulk actions con toolbar
4. Accessibility audit + fixes

---

## 12. Librerías externas recomendadas (cero build step)

Ninguna requiere bundler — todas via CDN o archivo descargado:

| Librería | Tamaño | Uso | Alternativa |
|----------|--------|-----|-------------|
| **Lucide** | ~1KB/icono | Iconos SVG | [Feather](https://feathericons.com) |
| **Inter** (Google Fonts) | ~50KB | Tipografía UI | [DM Sans](https://fonts.google.com/specimen/DM+Sans) |
| **JetBrains Mono** | ~30KB | Monospace | [Fira Code](https://github.com/tonsky/FiraCode) |
| **htmx** (opcional) | 14KB | Interactividad declarativa sin SPA | Alpine.js (15KB) |
| **Chartist** (opcional) | 10KB | Sparklines dashboard | Inline SVG propio |

**Total overhead si adoptamos todo:** ~120KB (gzip: ~40KB). Cacheado 100% tras primera carga.

---

## 13. Validación: ¿funcionará?

**Riesgos:**
- ⚠️ **Scope creep:** este doc lista mucho. Implementar Fase A+B primero; medir si mejora satisfacción antes de seguir.
- ⚠️ **Cambio de fuente (Alegreya → Inter):** puede romper líneas/layouts en pages.js por diferencias de ancho de caracteres. Probar por pantalla.
- ⚠️ **Dark mode:** los badges con `background` claro fijo (ej. `#e0f3ee`) no funcionarán. Necesitan tokens que cambien por modo.

**Métricas de éxito (post-implementación):**
- Tiempo medio de tarea (crear campaña, encontrar contacto) disminuye
- 0 quejas del usuario tipo "no sé si se guardó"
- El dueño puede leer el dashboard en < 10 segundos sin preguntar
- Queirolo se siente representada en el panel (no "WA Test")

---

## 14. Referencias de inspiración

Dashboards administrativos bien diseñados para referencia:

- **Linear** (linear.app) — densidad, tipografía, keyboard-first
- **Vercel Dashboard** — dark mode elegante, buen uso de espacio
- **Stripe Dashboard** — tablas densas y escaneables
- **Cal.com** — empty states, onboarding, flash messages
- **Twilio Console** — referencia natural (mismo dominio)

Para un tono más cercano al Queirolo Autos (warm, approachable, no corporate):
- **Notion** — warm palette, humanista
- **Basecamp** — interfaz honesta, sin pretensiones

---

## 15. Resumen ejecutivo

| Cambio | Impacto | Esfuerzo | Prioridad |
|--------|---------|----------|-----------|
| Extraer CSS a archivos + servir estáticos | Mantenibilidad | 🟢 Bajo | 🔴 Alta |
| Reemplazar emojis por Lucide | Profesionalismo | 🟢 Bajo | 🔴 Alta |
| Toasts + modales (fuera de `alert`/`confirm`) | UX diaria | 🟡 Medio | 🔴 Alta |
| Loading states + skeletons | Percepción de velocidad | 🟡 Medio | 🟡 Media |
| Dashboard con sparklines + deltas | Valor para dueño | 🟡 Medio | 🟡 Media |
| Progress bars en vivo | Confianza en el sistema | 🟢 Bajo | 🟡 Media |
| Dark mode | Comodidad diaria | 🟡 Medio | 🟡 Media |
| Conversación como chat | Naturalidad | 🟡 Medio | 🟢 Baja |
| Command palette | Power users | 🟡 Medio | 🟢 Baja |
| Campaign wizard | Reduce errores | 🔴 Alto | 🟢 Baja |
| Branding Queirolo | Identidad | 🟢 Bajo | 🟡 Media |

**Empezar por:** Fase A (fundación) + toasts + iconos Lucide + branding. Esos 4 cambios ya transforman la percepción del panel sin alterar comportamiento.

---

**Siguiente paso:** discutir prioridades y decidir qué de esta propuesta vale la pena implementar primero. Nada aquí es obligatorio — son opciones coherentes para elegir.
