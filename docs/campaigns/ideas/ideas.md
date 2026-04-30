## Ideas de campañas

### 1. Manejo de opt-out para vehículos no disponibles

#### Contexto
- Vamos a contactar clientes obtenidos desde Chileautos.
- Muchos vehículos pueden aparece   r todavía publicados aunque ya estén vendidos o no disponibles.
- Esto va a generar respuestas frecuentes como: "ya lo vendí" o "ya no está disponible".

#### Problema
Necesitamos evitar futuros contactos irrelevantes, pero sin bloquear definitivamente a un cliente que más adelante podría volver a publicar otro vehículo.

#### Tensión principal
El opt-out no necesariamente aplica igual para todos los casos:
- **Por teléfono**: bloquea al contacto completo para futuras campañas.
- **Por link / publicación / vehículo**: bloquea solo ese aviso puntual.

#### Hipótesis
En muchos casos, el elemento realmente no disponible es el **auto o la publicación**, no el **teléfono**.

#### Pregunta de diseño
¿El opt-out debe aplicarse sobre:
1. el **teléfono**, o
2. el **link / vehículo / publicación**?

#### Criterio sugerido para analizar
- Si la respuesta indica que no quiere más mensajes nunca -> aplicar bloqueo por **teléfono**.
- Si la respuesta solo indica que ese vehículo ya no está disponible -> aplicar bloqueo por **publicación / vehículo**.
- Si hay ambigüedad -> marcar para revisión o clasificación posterior.

#### Próximos pasos
- Definir tipos de respuesta esperados del cliente.
- Clasificar respuestas entre:
  - no disponible,
  - vendido,
  - no me contactes más,
  - respuesta ambigua.
- Diseñar la regla de negocio para decidir si bloquear por teléfono o por publicación.
- Evaluar si conviene guardar un estado temporal en vez de un bloqueo permanente.

#### Idea operativa
Podríamos modelarlo como dos niveles de exclusión:
- **Opt-out duro (teléfono)**: el contacto no debe recibir futuras campañas.
- **Opt-out blando (publicación/vehículo)**: ese aviso deja de ser contactable, pero el teléfono puede reutilizarse en otra publicación futura.

#### Riesgo
Si bloqueamos siempre por teléfono, podemos perder futuros leads válidos del mismo contacto.

#### Valor
Esta lógica puede mejorar la calidad de las campañas, reducir fricción con usuarios y evitar contactos innecesarios.


### 2. 
  - Como agregar a Segmentos manuales Autos, un contacto en especifico y viceverza. ya que a futuro quizar cree un segmento no relacionado a auto, sino algo por ejemplo a ubicacion u otro segmento. asi que no quiero amarrarlo. 
  - actualmente al crear campaña y cargar segmento, aunque el segmento si posea contactos lanza un msj que dice que campaña esta creada sin contactos. cosa que no es real ya que al crear,salir y verificar sale los contactos que corresponde.

