# git-alias

Colección de herramientas de automatización e interfaces interactivas para Git, diseñadas sobre Node.js para optimizar los flujos de trabajo diarios en la terminal mediante menús limpios y validaciones avanzadas.

## 1. Instalación

Para instalar y habilitar el binario global en su máquina local, siga estos pasos:

1\. **Clonar el repositorio** en su directorio de preferencia:

```
git clone https://github.com/the-planb/git-alias.git
cd git-alias
```

2\. **Instalar las dependencias** de Node.js:

```
npm install
```

3\. **Crear el enlace simbólico global** en el sistema:

```
npm link
```

*Nota: Esto registrará el binario `git-alias` especificado en el `package.json` dentro del `$PATH` de su sistema operativo, permitiendo su invocación desde cualquier ubicación.*

## 2. Configuración de Alias en Git

Para integrar los comandos de este paquete como subcomandos nativos de Git, debe registrar los alias correspondientes en su configuración global. El uso del prefijo `!` indica a Git que debe delegar la ejecución a un binario externo del sistema.

Ejecute los siguientes comandos en su terminal:

```
git config --global alias.switch-to '!git-alias switch-to'
git config --global alias.kill '!git-alias kill'
git config --global alias.release '!git-alias release'
git config --global alias.mirror-to '!git-alias mirror-to'
git config --global alias.mirror-from '!git-alias mirror-from'
```

### Verificación en .gitconfig

Tras la ejecución, su archivo de configuración global `~/.gitconfig` contendrá la siguiente estructura:

```
[alias]
    switch-to = "!git-alias switch-to"
    kill = "!git-alias kill"
    release = "!git-alias release"
    mirror-to = "!git-alias mirror-to"
    mirror-from = "!git-alias mirror-from"
```

## 3. Resumen de Comandos Desarrollados

### `git kill` (Subcomando `clean`)

Analiza el estado del repositorio local (y del servidor remoto si se añade el flag `-r`) para ofrecer una interfaz interactiva de eliminación masiva de referencias.

- **Exclusión de rama activa:** Oculta automáticamente la rama `current` para evitar estados de error en Git.
- **Pantalla de revisión unificada:** Muestra una lista de confirmación previa basada en casillas de verificación ya marcadas por defecto.
- **Detección de Upstream:** Identifica si una rama local tiene un track remoto activo, decorándola en azul (`rama -> origin/rama`) en la selección, desmarcándola por defecto en la revisión final e inyectando un mensaje de alerta crítico en rojo si el usuario decide forzar su borrado.
- **Uso:** `git kill` o `git kill -r` (o `--include-remote`).

### `git mirror-to` / `git mirror-from` (Subcomando `mirror`)

Replica con exactitud el estado de una rama sobre otra mediante un proceso seguro respaldado por el área de preparación (*stash*).

- **`mirror-to`:** Sincroniza el contenido de la rama actual en una rama de destino seleccionada (la cual se crea si no existe con el flag `-s`).
- **`mirror-from`:** Trae y vuelca el contenido de una rama externa sobre la rama en la que se encuentra posicionado el usuario.
- **Aislamiento de selección:** Desbanca la rama activa del menú de selección para impedir redundancias destructivas.

## Requisitos del Sistema

- Node.js v18.0.0 o superior (compatible con `node:util#parseArgs` nativo).
- Git instalado y configurado en las variables de entorno del sistema.