# Fuente de Verdad — Supresión por Vehículo/Publicación

**Proyecto:** WA-Test / Queirolo Autos  
**Fecha:** 2026-04-26  
**Estado:** Aprobado para implementación  
**Tipo:** Master spec funcional + técnica  
**Tag de resguardo previo:** `v-pre-vehicle-publication-suppression-2026-04-26`

---

## 1. Objetivo

Implementar un sistema de exclusión de campañas en dos niveles:

1. **Opt-out global por teléfono** para casos de BAJA real.
2. **Supresión puntual por vehículo/publicación exacta** para casos como:
   - `ya lo vendí`
   - `ya no está disponible`
   - `ese auto ya salió`

La meta es evitar contactos irrelevantes **sin perder futuros leads válidos** del mismo teléfono cuando ese contacto tenga otra publicación activa.

---

## 2. Problema que resuelve

Hoy el sistema solo sabe excluir por `phone` usando `opt_outs`. Eso funciona para compliance global, pero es demasiado agresivo cuando el cliente solo está diciendo que **ese aviso puntual** ya no corresponde.

Ejemplo correcto esperado:

- se crea campaña `Toyota 2020-2026`
- se contacta un vehículo Toyota específico
- el cliente responde `ya lo vendí`
- se deja de contactar **ese vehículo/publicación exacta**
- si ese mismo teléfono tiene luego un `Jeep` disponible, **sí puede entrar** a una campaña Jeep

---

## 3. Estado actual verificado del repo

### 3.1 Lo que YA existe

- `opt_outs` como exclusión global por teléfono.
- `vehicles` con `link`, `origin`, `external_id`.
- campañas con filtros por marca/modelo/año.
- inbound con reglas determinísticas + apoyo de n8n.
- admin para ver/editar/eliminar opt-outs globales.
- inventario de vehículos y edición de contactos con vehículos asociados.

### 3.2 Limitación estructural actual

Hoy la campaña sigue pensando demasiado en **contacto** y no en **vehículo**:

- `campaign_recipients` trackea `contact_id` y `phone`, pero no `vehicle_id`.
- la selección por vehículos termina aterrizando en contactos.
- el envío usa el último vehículo conocido del contacto, no necesariamente el vehículo efectivamente contactado.

### 3.3 Conclusión de diseño

Para soportar supresión puntual de forma confiable, la unidad real de targeting debe pasar a ser:

- **vehículo/publicación**, no solo contacto.

---

## 4. Decisiones cerradas

### 4.1 Scope de la exclusión

- **NO** bloquear por marca.
- **NO** bloquear por teléfono salvo BAJA global.
- **SÍ** bloquear por **vehículo exacto / publicación exacta**.

### 4.2 Regla para respuestas de no-disponibilidad

Ante respuestas como:

- `ya lo vendí`
- `ya no está disponible`
- `ese auto ya salió`

el sistema debe suprimir automáticamente **el último vehículo contactado** para ese teléfono.

### 4.3 BAJA global

Mensajes como:

- `BAJA`
- `STOP`
- `UNSUBSCRIBE`
- `no me contacten más`

siguen generando **opt-out global por teléfono**.

### 4.4 Opt-out manual

Debe existir operación manual para:

1. **opt-out global por teléfono**
2. **supresión puntual por vehículo/publicación**

### 4.5 Estado del contacto

`contacts.status = opted_out` debe representar solo **baja global**.

No debe usarse para supresión puntual por vehículo.

### 4.6 Reversa / reactivación

No se debe borrar historial como mecanismo principal.

Se recomienda:

- mantener registros históricos
- liberar con `released_at` / `released_by`
- preservar auditoría completa

### 4.7 Campañas activas

Al momento de redactar este documento, **no hay campañas vigentes**. La implementación puede asumir rollout sin necesidad de compatibilidad operativa con campañas en curso.

---

## 5. Modelo conceptual final

## 5.1 Nivel 1 — Opt-out global

Representa:

> “No quiero recibir más mensajes nunca.”

Scope:

- `phone`

Impacto:

- excluye al contacto completo de todas las campañas futuras

## 5.2 Nivel 2 — Supresión puntual

Representa:

> “Ese auto/publicación ya no corresponde.”

Scope:

- `vehicle_id` preferentemente
- con respaldo por publicación (`origin + external_id`, o `link`)

Impacto:

- excluye solo ese vehículo/publicación
- no invalida otros vehículos del mismo teléfono

---

## 6. Identidad canónica del vehículo/publicación

Orden recomendado de resolución:

1. `vehicle_id`
2. `origin + external_id`
3. `link`

Regla:

- el sistema debe usar `vehicle_id` como identidad principal interna
- `origin + external_id` y `link` quedan como soporte de auditoría y reconciliación

---

## 7. Modelo de datos recomendado

## 7.1 Mantener y robustecer `opt_outs`

`opt_outs` debe seguir siendo la tabla de compliance global.

### Campos recomendados para evolución

- `id`
- `phone`
- `reason_code`
- `reason_detail`
- `source` (`keyword`, `phrase`, `ai`, `manual`, `import`, `admin`)
- `created_at`
- `updated_at`
- `released_at`
- `created_by`
- `released_by`

### Regla semántica

`opt_outs` **NO** debe mezclarse con suppressions por publicación.

---

## 7.2 Nueva tabla recomendada: `vehicle_suppressions`

Tabla dedicada para exclusión puntual.

### Campos recomendados

- `id`
- `vehicle_id`
- `phone`
- `origin`
- `external_id`
- `link`
- `reason_code`
- `reason_detail`
- `source` (`rule`, `ai`, `manual`, `admin`)
- `campaign_id`
- `message_sid`
- `suppressed_at`
- `updated_at`
- `released_at`
- `created_by`
- `released_by`
- `notes`

### Notas

- `vehicle_id` debe ser la referencia principal.
- `phone` ayuda a trazabilidad y debugging.
- `campaign_id` y `message_sid` permiten saber de qué contacto vino la supresión.

---

## 7.3 Evolución requerida de `campaign_recipients`

Agregar al menos:

- `vehicle_id` nullable

Opcional recomendado:

- `selection_scope` (`contact` | `vehicle`)

### Regla

Cuando una campaña se construya desde filtros de vehículos, cada recipient debe conservar qué `vehicle_id` fue el objetivo real del envío.

---

## 8. Catálogo de motivos

No dejar la semántica únicamente en texto libre.

### 8.1 Motivos globales

- `global_user_request`
- `global_keyword_stop`
- `global_phrase_stop`
- `global_ai_detected`
- `global_manual`
- `global_import`

### 8.2 Motivos por vehículo/publicación

- `vehicle_sold`
- `vehicle_unavailable`
- `vehicle_duplicate_listing`
- `vehicle_wrong_target`
- `vehicle_manual`
- `vehicle_admin_review`

### 8.3 Texto libre complementario

`reason_detail` debe seguir existiendo para observaciones humanas o trazas específicas.

---

## 9. Reglas de negocio operativas

## 9.1 Priorización

Orden de evaluación:

1. si el teléfono tiene opt-out global -> excluir siempre
2. si el vehículo está suprimido -> excluir ese vehículo
3. si el teléfono tiene otro vehículo no suprimido -> sigue siendo elegible

## 9.2 Clasificación inbound

### Baja global

Disparadores:

- `BAJA`
- `STOP`
- `UNSUBSCRIBE`
- `no me contacten más`

Resultado:

- insertar/actualizar `opt_outs`
- marcar `contacts.status = opted_out`

### No disponibilidad puntual

Disparadores:

- `ya lo vendí`
- `ya no está disponible`
- `ese auto ya salió`

Resultado:

- suprimir el **último vehículo contactado**
- NO generar opt-out global
- NO cambiar `contacts.status` a `opted_out`

### Ambigüedad residual

Para esta mejora se adopta una política práctica:

- si el mensaje coincide con no-disponibilidad puntual, se resuelve contra el último vehículo contactado
- no se detiene por revisión manual por defecto

---

## 10. Estrategia de targeting futura

Las campañas podrán seguir filtrándose por:

- marca
- modelo
- rango de año
- otros filtros futuros

Pero la elegibilidad real debe evaluarse a nivel de **vehículo**.

### Ejemplo

Campaña: `Toyota 2020-2026`

- se seleccionan vehículos Toyota en ese rango
- si un Toyota puntual queda suprimido, sale de futuras campañas Toyota
- si ese mismo teléfono tiene un Jeep activo, puede entrar a una campaña Jeep
- si ese mismo teléfono tiene otro Toyota distinto, también podría entrar

---

## 11. Recomendación UX/UI para opt-out manual

## 11.1 Recomendación principal

La mejor ubicación para el **opt-out manual por vehículo** es en superficies donde el operador ya piensa en el activo exacto:

### Primaria

1. **Inventario de Vehículos** (`/admin/vehicles`)
2. **Sección “Vehículos asociados” dentro del perfil del contacto** (`/admin/contacts/:id/edit`)

### Por qué

- ahí el operador ve el vehículo exacto
- reduce errores de scope
- evita confundir una baja puntual con una baja global
- respeta la forma actual del admin, que ya organiza acciones por fila/tarjeta con CTA claros

## 11.2 Recomendación secundaria

Agregar acceso contextual desde conversación/inbox **solo como acción auxiliar**, no como punto principal.

Condición:

- debe mostrar claramente cuál es el vehículo/publicación que se va a suprimir

### Razón

En conversación el operador piensa primero en la persona y el mensaje, no siempre en el activo exacto. Si esta acción se vuelve primaria allí, sube el riesgo de equivocarse de scope.

## 11.3 Ubicación recomendada para opt-out global manual

Mantener y fortalecer el flujo actual de `opt-outs` por teléfono como superficie primaria para bajas globales.

Además, permitir atajo desde el perfil del contacto.

---

## 12. Principios UX/UI

Toda la mejora debe respetar la estética actual del admin:

- lenguaje simple
- CTA claros
- badges discretos
- acciones por contexto
- paneles y tarjetas consistentes con las vistas actuales

### Lineamientos

- diferenciar visualmente:
  - `BAJA GLOBAL`
  - `SUPRIMIDO ESTE VEHÍCULO`
- nunca mezclar ambos estados bajo un mismo badge ambiguo
- toda acción destructiva o sensible debe tener confirmación clara
- toda reversa debe ser entendible y visible

---

## 13. Auditoría obligatoria

Cada baja o supresión debe registrar:

- cuándo ocurrió
- quién o qué la generó
- desde dónde se generó (`manual`, `rule`, `ai`, `import`, `admin`)
- motivo estructurado
- detalle libre opcional
- campaña y mensaje origen si existen

### Requisito

No implementar esta mejora sin trazabilidad suficiente.

---

## 14. Reglas de reversa

## 14.1 Global

Debe poder reactivarse un teléfono globalmente, manteniendo historial.

## 14.2 Vehículo/publicación

Debe poder liberarse una supresión puntual, manteniendo historial.

## 14.3 Política técnica

Preferir:

- `released_at`
- `released_by`

en vez de borrar registros como mecanismo estándar.

---

## 15. Protección de funcionalidad actual

Esta mejora NO debe romper estas capacidades existentes:

1. inbound Twilio actual
2. fallback local + integración n8n
3. opt-out global actual por keyword/phrase
4. envío de campañas ya existente
5. importación masiva de opt-outs globales
6. vistas admin de contactos, vehículos, inbox, seguimiento y opt-outs

### Reglas de protección

- el opt-out global actual sigue funcionando desde el día 1
- la nueva supresión puntual se suma, no reemplaza compliance global
- las campañas deben excluir suppressions tanto al asignar recipients como antes de enviar
- si falta `vehicle_id` en algún flujo heredado, la implementación debe degradar con cuidado y sin romper envíos existentes

---

## 16. Estrategia de implementación recomendada

## Fase 1 — Modelo y persistencia

- robustecer `opt_outs`
- crear `vehicle_suppressions`
- agregar `vehicle_id` a `campaign_recipients`

## Fase 2 — Selección y envío por vehículo

- hacer que selección por filtros conserve `vehicle_id`
- hacer que el sender use el vehículo del recipient, no “el último del contacto”

## Fase 3 — Inbound y clasificación

- mantener reglas globales actuales
- agregar supresión puntual contra último vehículo contactado
- guardar auditoría completa

## Fase 4 — Admin UX

- acciones manuales globales y puntuales
- vistas de suppressions
- reversa con historial

---

## 17. Criterios de aceptación

La mejora se considera correcta cuando:

1. un `BAJA/STOP` sigue bloqueando al teléfono completo
2. un `ya lo vendí` solo bloquea el vehículo/publicación exacta
3. un mismo teléfono con otro vehículo activo sigue siendo elegible
4. campañas por filtros de vehículo ya no pierden la identidad del vehículo target
5. el admin puede crear y revertir bajas globales manuales
6. el admin puede crear y revertir suppressions puntuales manuales
7. toda acción queda auditada
8. la UI se siente consistente con el panel actual

---

## 18. No objetivos de esta mejora

Quedan fuera de este documento:

- scoring comercial avanzado
- reglas por marca completa
- reglas automáticas por tiempo de expiración
- mini-CRM comercial extendido

Si más adelante se quiere expiración automática, debe abrirse como mejora nueva y separada.

---

## 19. Resolución final

La arquitectura aprobada para esta mejora es:

- **opt-out global** por `phone` en `opt_outs`
- **supresión puntual** por `vehicle/publication` en tabla dedicada
- **campañas orientadas por vehículo** cuando el origen del targeting sea por filtros de vehículo
- **resolución automática contra el último vehículo contactado** para respuestas de no-disponibilidad puntual
- **operación manual** tanto global como puntual con auditoría completa

Este documento es la **fuente de verdad** para la implementación.
