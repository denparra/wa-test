# Spec — Segmentos genéricos con fuente única

## Objetivo

Redefinir `Segment` como una audiencia reusable con **una sola fuente explícita por segmento**:

- `vehicles`
- `contacts`

La implementación debe **preservar sin regresiones** la lógica y la experiencia actual de segmentos/campañas basadas en vehículos.

## Contexto

Hoy el proyecto ya funciona bien para campañas por autos.

Ejemplo actual válido:
- crear segmento por marca/modelo/año
- seleccionar ese segmento en campaña
- cargar audiencia
- enviar campaña correctamente

El cambio NO busca reemplazar ese flujo. Busca evitar que el sistema quede amarrado solo a autos, para poder crear segmentos de contactos incluso cuando no tengan vehículos asociados.

## Alcance de esta versión

Esta versión define:

1. `Segment` como entidad de audiencia reusable.
2. Contrato de **fuente única** por segmento.
3. Soporte para segmentos de `contacts` y `vehicles`.
4. Soporte para segmentos `manual` y `dynamic`, siempre dentro de su fuente.
5. Compatibilidad hacia atrás del flujo actual de `vehicles`.

## Fuera de alcance

Queda explícitamente fuera de este cambio:

1. Corregir el bug visual/preview que puede mostrar una campaña “sin contactos”.
2. Rediseñar o degradar la UX/UI actual del flujo de segmentos por autos.
3. Permitir segmentos mixtos con `contacts` y `vehicles` al mismo tiempo.
4. Cambiar la lógica exitosa actual de resolución de campañas por vehículos.

Ese bug visual debe tratarse como **issue separado**.

## Invariantes

Las siguientes reglas NO se negocian en esta fase:

1. Todo segmento debe tener exactamente un `source`.
2. `source` solo puede ser `vehicles` o `contacts`.
3. Un segmento no puede mezclar criterios, miembros ni resolución de distintas fuentes.
4. Un segmento `vehicles` debe seguir comportándose como hoy.
5. Un segmento `contacts` debe poder incluir contactos sin autos asociados.

## Requerimientos funcionales

### RF-1. Contrato de fuente única por segmento

El sistema debe persistir y exponer cada segmento con una única fuente explícita.

#### Escenario: crear segmento de vehículos
- DADO un usuario que crea un segmento desde el flujo actual de vehículos
- CUANDO guarda el segmento
- ENTONCES el segmento queda con `source = vehicles`
- Y el comportamiento actual se mantiene igual

#### Escenario: rechazar mezcla de fuentes
- DADO un intento de definir un segmento con criterios o miembros de `contacts` y `vehicles`
- CUANDO el sistema valida la definición
- ENTONCES debe rechazarla
- Y no debe crear un segmento parcial

### RF-2. Compatibilidad total del baseline de vehículos

El sistema debe preservar la lógica y el resultado actual del flujo basado en vehículos.

#### Escenario: segmento de vehículos existente
- DADO un segmento de vehículos creado antes de este cambio
- CUANDO se carga o se usa en campaña
- ENTONCES debe funcionar igual que hoy
- Y no debe exigir pasos nuevos al usuario

#### Escenario: campaña por vehículos sin regresión
- DADO una campaña que usa un segmento `vehicles`
- CUANDO resuelve audiencia o envía
- ENTONCES debe mantener el mismo comportamiento exitoso actual

### RF-3. Modos de segmento acotados por fuente

El sistema debe soportar segmentos `manual` y `dynamic`, pero cada modo debe operar solo dentro de la fuente declarada.

#### Escenario: segmento manual de vehículos
- DADO un segmento manual con `source = vehicles`
- CUANDO el usuario gestiona miembros
- ENTONCES solo se deben aceptar entidades de vehículos

#### Escenario: segmento dinámico de contactos
- DADO un segmento dinámico con `source = contacts`
- CUANDO se evalúan sus reglas
- ENTONCES solo deben considerarse contactos
- Y los vehículos no deben intervenir en la membresía

### RF-4. Soporte de segmentos de contactos

El sistema debe permitir crear, editar y usar segmentos cuya audiencia base sean contactos.

#### Escenario: contacto sin vehículo en segmento manual
- DADO un contacto sin vehículo asociado
- CUANDO el usuario lo agrega a un segmento manual `contacts`
- ENTONCES debe aceptarse como miembro válido

#### Escenario: edición de segmento dinámico de contactos
- DADO un segmento dinámico `contacts`
- CUANDO se actualizan sus reglas
- ENTONCES el segmento debe seguir siendo `contacts`
- Y no debe aceptar criterios de vehículos

### RF-5. Uso de segmentos de contactos en campañas

El sistema debe permitir usar segmentos `contacts` en campañas sin alterar el flujo exitoso actual de `vehicles`.

#### Escenario: campaña usando segmento de contactos
- DADO una campaña que selecciona un segmento `contacts`
- CUANDO resuelve destinatarios
- ENTONCES la audiencia debe salir solo de contactos
- Y no debe requerirse vehículo asociado

#### Escenario: flujo tradicional de vehículos intacto
- DADO un usuario que sigue el flujo actual de campañas por autos
- CUANDO no necesita segmentos de contactos
- ENTONCES la experiencia debe seguir por el camino actual sin fricción adicional

## Criterios de diseño para implementación

1. **No tocar el happy path actual de vehicles** salvo lo mínimo para integrarlo al nuevo contrato general.
2. `source` debe ser la verdad única para:
   - membresía
   - filtros
   - preview
   - resolución de audiencia en campañas
3. La implementación debe encapsular el comportamiento existente de `vehicles` como baseline preservado.
4. El soporte `contacts` debe agregarse como nueva capacidad, no como reemplazo del flujo actual.

## Issue separado obligatorio

El bug reportado donde la UI puede indicar “campaña sin contactos” aunque luego la campaña sí tenga destinatarios:

- **NO forma parte de esta spec**
- debe abrirse y resolverse como **issue independiente**
- no debe contaminar el alcance de esta implementación

## Resultado esperado

Al finalizar este cambio, el proyecto debe poder:

- seguir funcionando exactamente como hoy para segmentos de autos
- crear segmentos de contactos con fuente clara
- usar segmentos de contactos en campañas
- dejar preparada una base limpia para futuras segmentaciones sin quedar amarrado a vehículos
