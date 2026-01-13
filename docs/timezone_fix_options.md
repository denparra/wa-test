# Opciones para Corregir el Desfase Horario en VPS (3 horas)

Actualmente, el VPS está en UTC (Tiempo Universal Coordinado), lo que causa que la función `datetime('now')` de SQLite devuelva una hora 3 horas adelantada respecto a tu hora local (UTC-3). Esto provoca que los envíos programados no funcionen correctamente.

A continuación, se detallan las opciones para solucionar este problema, desde cambios en infraestructura hasta modificaciones en el código.

---

## 1. Opción de Infraestructura (Recomendada si tienes acceso root)
**Cambiar la Zona Horaria del Servidor VPS**

Esta es la solución más limpia porque alinea todo el sistema operativo con tu hora local. SQLite tomará automáticamente la hora del sistema.

**Pasos:**
1.  Conéctate a tu VPS por SSH.
2.  Ejecuta el siguiente comando para establecer la zona horaria (ejemplo para Chile/Santiago, ajusta según tu ciudad):
    ```bash
    sudo timedatectl set-timezone America/Santiago
    ```
    *Para Argentina:* `america/Argentina/Buenos_Aires`
3.  Verifica el cambio con el comando `date`. Debería mostrar tu hora local correcta.
4.  Reinicia tu aplicación (Node.js/PM2) para que tome el cambio.

**Ventajas:**
*   Soluciona el problema de raíz para todos los servicios del servidor.
*   No requiere tocar una sola línea de código.

**Desventajas:**
*   Requiere permisos de administrador (sudo).

---

## 2. Opción de Código SQL (Rápida y Local)
**Modificar la Consulta SQL con un Offset Fijo**

Si no puedes o no quieres tocar la configuración del servidor, puedes "engañar" a la consulta SQL restando manualmente las 3 horas de diferencia.

**Archivo a modificar:** `db/index.js`
**Línea aprox:** 241 (dentro de `listScheduledCampaignsDue`)

**Código actual:**
```javascript
AND datetime(scheduled_at) <= datetime('now')
```

**Código modificado:**
```javascript
AND datetime(scheduled_at) <= datetime('now', '-03:00')
```

**Ventajas:**
*   Se aplica solo a tu aplicación, sin afectar al servidor.
*   Funciona inmediatamente tras reiniciar la app.

**Desventajas:**
*   Si el servidor cambia de hora (ej: horario de verano) o se mueve de zona, tendrás que editar el código de nuevo.
*   Es un valor "hardcodeado".

---

## 3. Opción de Variable de Entorno (Node.js)
**Configurar la Zona Horaria del Proceso Node**

Puedes intentar forzar la zona horaria solo para el proceso que corre tu aplicación. Esto funciona bien para objetos `Date` de Javascript, aunque SQLite a veces sigue usando la hora del sistema base si usa `now`.

**Cómo implementar:**
Al iniciar tu aplicación, pasas la variable de entorno `TZ`.

**En tu archivo `.env`:**
```ini
TZ=America/Santiago
```

**O en el comando de inicio (`package.json`):**
```json
"scripts": {
  "start": "TZ=America/Santiago node server.js"
}
```

**Nota:** Para que SQLite respete esto al usar `datetime('now', 'localtime')`, debes cambiar la consulta SQL para usar el modificador `localtime`.

**Cambio en SQL requerido:**
```javascript
AND datetime(scheduled_at) <= datetime('now', 'localtime')
```

**Ventajas:**
*   Es configurable por entorno sin cambiar código duro.
*   No requiere permisos de root en el VPS.

---

## Resumen de Recomendación

1.  **Si tienes acceso root al VPS:** Usa la **Opción 1**. Es la solución definitiva y correcta.
2.  **Si no tienes root o prefieres no tocar el OS:** Usa la **Opción 2**. Es la más segura para asegurar que la consulta SQL haga exactamente lo que esperas (-3 horas) sin depender de configuraciones externas complejas.

---

## Nota: Seguimiento de campanas (replies 24h/7d)

El tracking de replies compara `messages.created_at` con `campaign_recipients.sent_at`. Si `sent_at` esta en UTC (ISO con `Z`) y `created_at` esta en hora local, las ventanas 24h/7d pueden quedar vacias en VPS. La correccion mas segura es normalizar en las consultas usando `datetime(sent_at, 'localtime')` o estandarizar ambos timestamps al mismo huso horario.
