# Ayuda de DSJ

DSJ es un diario privado y local para sistemas disociativos. Todo queda en tu dispositivo — sin cuenta, sin nube, sin telemetría.

---

## Avatares y grupos

Los avatares representan a los miembros de tu sistema. Cada mensaje se publica como un avatar, o de forma anónima. Gestiónales en **Configuración → Editar avatares**.

Los grupos te permiten organizar avatares en subsistemas — un grupo llamado Frente puede fijarse en la parte superior del panel de avatares. Gestiónalo en **Configuración → Editar grupos**.

Los avatares ocultos no aparecen en el panel de avatares, pero sus mensajes permanecen en el diario.

## Campos de avatar

Los campos de avatar te permiten definir atributos personalizados para cada avatar — cosas como Edad, Rol, Pronombres, o lo que sea significativo para tu sistema. Los campos pueden ser texto, número, rango, booleano o lista.

Los campos aparecen en la vista de detalle del avatar (doble clic en un avatar del panel) y se pueden usar para filtrar la lista visible.

Gestiónalo en **Configuración → Campos de avatar**.

## Filtro y autocompletado de avatares

Escribe en el cuadro de filtro sobre el panel de avatares para buscar por nombre o iniciales.

Escribe `@nombre` en el cuadro de mensaje para mencionar a un avatar. El menú de autocompletado aparece mientras escribes — usa ↑↓ para navegar, Espacio o Enter para completar.

En la vista **Todos los mensajes**, hacer clic en un avatar del panel filtra sus mensajes. Haz clic de nuevo para limpiar el filtro.

## Canales y carpetas

Los canales son espacios para diferentes temas o partes de tu vida. Las carpetas agrupan canales relacionados. Haz clic en el nombre de una carpeta para contraerla o expandirla.

Haz clic derecho en cualquier canal o carpeta para renombrarlo, moverlo, cambiar su color o eliminarlo.

Cada canal puede tener su propio **modo de vista** (normal, compacto, registro) — configúralo con clic derecho o en **Configuración → Editar canales**.

## Chat

Selecciona un canal en la barra lateral para abrirlo. Los mensajes aparecen con los más recientes abajo.

**Doble clic** en un mensaje para editarlo. Los mensajes nunca se eliminan — esto es intencional y una decisión deliberada de seguridad.

Escribe `#etiqueta` para etiquetar un mensaje. El autocompletado aparece después de `#`. Usa la barra de búsqueda para filtrar por etiqueta más tarde.

Usa `@nombre` para mencionar a un avatar. Usa `/` para ver los comandos disponibles (tirar dados, tarot, atajos del registro del frente, y más).

Haz clic en el botón de **responder** de un mensaje (o clic derecho → Responder) para iniciar un hilo. Los hilos se sangran bajo el mensaje padre hasta la profundidad configurada.

Usa las **flechas de fecha** (← →) o el selector de fecha en la barra de herramientas para saltar a las entradas de un día específico.

## Seguimientos

Los seguimientos son formularios estructurados para registrar cosas con el tiempo — estado de ánimo, sueño, medicamentos, quién está en el frente, o cualquier cosa que definas.

Cada seguimiento tiene su propio canal. Abre el canal y haz clic en **+ Registro** para enviar una entrada. Verás un formulario con los campos que configuraste.

El botón de **Informe** (ícono de gráfico en la barra de herramientas del canal) muestra una vista resumida: promedios, totales y una línea de tiempo según los tipos de campo.

Crea y personaliza seguimientos en **Configuración → Editar seguimientos**.

## Seguimiento del frente

El seguimiento del frente es un seguimiento especial para registrar quién está en el frente. Aparece en la carpeta Seguimientos si no lo has movido.

Usa la sección **Frente** del panel de avatares (si está activada) para establecer o limpiar el frente rápidamente. Cada cambio se registra como un mensaje en el canal del Registro del frente.

El informe del seguimiento muestra una línea de tiempo del frente y estadísticas por avatar.

## Búsqueda

Haz clic en el ícono de búsqueda en la barra de herramientas del chat para buscar mensajes. La búsqueda usa coincidencia de prefijo — `ven` encuentra `venta` pero no `evento`.

Combina la búsqueda con el filtro de fecha o de avatar para acotar los resultados.

En **Todos los mensajes**, puedes buscar en todos los canales a la vez.

## Notas de avatar

Cada avatar tiene una lista de notas privadas — texto asociado a ese avatar, visible en su vista de detalle (doble clic en el panel).

Doble clic en una nota existente para editarla. Marca una nota como favorita para mantenerla fijada al principio.

## Comandos de barra

Escribe `/` en el cuadro de mensaje para ver todos los comandos disponibles. Algunos destacados:

- `/roll` — tirar dados (ej. `/roll 2d6`)
- `/tarot` — sacar una carta del tarot
- `/lottery` — elegir números de lotería
- `/front` — registrar el frente directamente desde el cuadro de mensaje

## Sincronización

La sincronización es opcional, completamente local, y de dispositivo a dispositivo a través de tu red doméstica. No se necesita nube ni cuenta.

**Para emparejar dos dispositivos:**
1. En un dispositivo, abre **Configuración → Sincronización** y anota la dirección IP y el puerto.
2. En el otro dispositivo, abre **Configuración → Sincronización**, introduce la IP:puerto del primer dispositivo y el código de emparejamiento que aparece allí.
3. Una vez emparejados, pulsa el botón de sincronizar (⇅) en la barra lateral para sincronizar.

**Los tipos de dispositivo** controlan qué se sincroniza:
- **Principal / Completo** — reciben todos los datos
- **Remoto** — sincroniza una ventana de tiempo reciente (configurable)
- **Frío** — solo estructura (avatares, canales, seguimientos) — útil para archivar o una instalación nueva

Cada cambio se registra en un registro de eventos y se sincroniza de forma incremental — no toda la base de datos cada vez. Establece un puerto fijo en los ajustes de sincronización para que las direcciones de los pares se mantengan estables entre reinicios.

## Copia de seguridad

DSJ almacena todos los datos en un único archivo SQLite en tu dispositivo. Configura copias de seguridad automáticas diarias y semanales en **Configuración → Copia de seguridad y exportación**.

Haz una copia manual en cualquier momento con **Hacer copia ahora**. Haz clic en **Abrir carpeta de copias** para encontrar los archivos en disco.

**Para restaurar desde una copia de seguridad:** cierra DSJ, reemplaza `dsj.db` con el archivo de copia de seguridad y vuelve a abrirlo. Si cambiaste tu frase de contraseña después de hacer la copia, necesitarás la frase que estaba activa en ese momento.

## Importación y exportación

Exporta todos tus datos como un archivo JSON desde **Configuración → Copia de seguridad y exportación**. Tus datos, tu archivo.

Importa desde **Simply Plural** o **PluralKit** a través de **Configuración → Importar**. El importador mapea miembros → avatares, grupos → grupos de avatares, canales → canales, y mensajes donde estén disponibles.

## Ajustes de la aplicación

**Configuración → Ajustes de la aplicación** tiene opciones organizadas por nivel de configuración — básico, estándar y avanzado. Sube el nivel de configuración para desbloquear más opciones (modos de vista, profundidad de hilos, límites de etiquetas, políticas de sincronización, y más).

## Seguridad y cifrado

El cifrado es opcional. Actívalo en **Configuración → Seguridad**. DSJ usa SQLCipher (AES-256) con una frase de contraseña que tú eliges.

Cuando activas el cifrado, se genera un **código de recuperación**. Anótalo y guárdalo en un lugar seguro — es la única forma de acceder a tus datos si olvidas tu frase de contraseña.

Opcionalmente, guarda tu frase de contraseña en el Llavero de macOS para no ser solicitada en cada inicio.

## Filosofía y privacidad

Datos locales. Tus datos. DSJ está diseñado para que tu diario nunca salga de tu dispositivo. Sin cuenta, sin nube, sin telemetría — nunca.

Creado por un sistema disociativo, para sistemas disociativos. Entendemos las necesidades únicas de llevar un diario en un sistema y construimos las funciones que queríamos que existieran.

DSJ es código abierto. Las contribuciones y el feedback son bienvenidos. Ver [github.com/FrontSwitch/dsj](https://github.com/FrontSwitch/dsj).

## Hoja de ruta

¡Acceso anticipado! El enfoque a corto plazo es mejoras de calidad de vida, pulido y corrección de errores basados en el uso real.

Previsto para más adelante: mejoras de importación, mejoras móviles y mejoras de sincronización.

¿Tienes feedback? Abre un issue en GitHub o contáctanos a través de la comunidad.
