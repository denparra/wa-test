# Guía Rápida: Importación CSV

## Formato del Archivo CSV

Tu archivo CSV debe tener estas columnas **exactamente** (mayúsculas/minúsculas no importan):

```
Telefono,Nombre,Marca,Modelo,Año,Precio,Link
```

### Ejemplo de datos válidos:

```csv
Telefono,Nombre,Marca,Modelo,Año,Precio,Link
+56975400946,Juan Perez,Toyota,Corolla,2015,5500000,https://example.com/corolla
56998765432,Maria Lopez,Honda,Civic,2018,7200000,https://example.com/civic
+56912345678,Pedro Gonzalez,Chevrolet,Cruze,2020,9500000,https://example.com/cruze
```

## Reglas de Validación

### ✅ Teléfono (OBLIGATORIO)
- Debe incluir código de país (ej: `+56` para Chile)
- Si no tiene `+`, se agregará automáticamente
- Formato final: `+56975400946` (E.164)

### ✅ Nombre (OPCIONAL)
- Puede estar vacío
- Se guardará el nombre si está disponible

### ✅ Marca (OBLIGATORIO)
- No puede estar vacío
- Ejemplo: `Toyota`, `Honda`, `Chevrolet`

### ✅ Modelo (OBLIGATORIO)
- No puede estar vacío
- Ejemplo: `Corolla`, `Civic`, `Cruze`

### ✅ Año (OBLIGATORIO)
- Debe ser un número entre 1900 y 2028
- Ejemplo: `2015`, `2018`, `2020`

### ✅ Precio (OPCIONAL)
- Puede estar vacío
- Si está presente, debe ser un número positivo
- Ejemplo: `5500000`, `7200000`

### ✅ Link (OPCIONAL)
- Puede estar vacío
- Si está presente, debe tener al menos 5 caracteres
- Ejemplo: `https://example.com/car`

## Paso a Paso

### 1. Preparar el CSV
- Usa Excel, Google Sheets o cualquier editor de texto
- Guarda como `.csv` (separado por comas)
- Asegúrate de tener las 7 columnas

### 2. Subir el Archivo
- Ve a **Dashboard** → **Importar**
- Haz clic en "Elegir archivo"
- Selecciona tu CSV
- Haz clic en "Previsualizar datos"

### 3. Revisar la Previsualización
- **Registros válidos**: Se muestran con teléfonos normalizados
- **Registros inválidos**: Se muestran con el motivo del error
- Verifica que la normalización de teléfonos sea correcta

### 4. Confirmar la Importación
- Haz clic en "Finalizar y cargar X contactos"
- Espera unos segundos (máx. 1 minuto para 1000 registros)
- Revisa el resumen de la importación

### 5. Verificar los Datos
- Haz clic en "Ver contactos"
- Busca los contactos recién importados
- Verifica que los teléfonos estén en formato `+56...`

## Errores Comunes

### ❌ "Falta columna requerida: telefono"
**Solución:** Asegúrate de que tu CSV tenga la columna `Telefono` (con o sin tilde).

### ❌ "Teléfono inválido"
**Solución:**
- Agrega el código de país: `+56` al inicio
- Verifica que no tenga letras o caracteres especiales

### ❌ "Año inválido"
**Solución:**
- El año debe ser un número
- Rango permitido: 1900 a 2028

### ❌ "Marca vacía" o "Modelo vacío"
**Solución:** Completa estos campos, son obligatorios.

## Límites

- **Máximo 5000 registros** por importación
- **Tamaño máximo del archivo:** 10 MB
- **Formato:** Solo archivos `.csv`

## Características Especiales

### ✨ Contactos Duplicados
Si importas un teléfono que ya existe:
- ✅ Se **actualiza** el nombre si viene en el CSV
- ✅ Se **agrega** un nuevo vehículo al contacto existente

### ✨ Normalización Automática
Los teléfonos se normalizan automáticamente:
- `56975400946` → `+56975400946`
- `whatsapp:+56975400946` → `+56975400946`

### ✨ Importación Parcial
Si algunos registros son inválidos:
- ✅ Los registros **válidos se importan de todas formas**
- ❌ Los inválidos se muestran en la tabla de errores

## Ejemplo Completo

Archivo: `contactos.csv`
```csv
Telefono,Nombre,Marca,Modelo,Año,Precio,Link
+56975400946,Juan Perez,Toyota,Corolla,2015,5500000,https://example.com/corolla
56998765432,Maria Lopez,Honda,Civic,2018,7200000,https://example.com/civic
+56912345678,Pedro Gonzalez,Chevrolet,Cruze,2020,9500000,https://example.com/cruze
56955555555,,Nissan,Sentra,2019,,
```

**Resultado esperado:**
- ✅ 4 contactos procesados
- ✅ 4 vehículos insertados
- ✅ Teléfonos normalizados a formato E.164
- ✅ Contacto 4 sin nombre y sin precio (válido, campos opcionales)

## Soporte

Si tienes problemas con la importación:
1. Revisa esta guía
2. Verifica que tu CSV tenga el formato correcto
3. Contacta al administrador del sistema con el archivo CSV y captura de pantalla del error
