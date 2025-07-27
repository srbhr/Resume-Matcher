# Guía de Configuración Local para Resume-Matcher

![Instalando Resume Matcher](assets/how_to_install_resumematcher.png)

Este documento proporciona instrucciones multiplataforma para poner en marcha el proyecto localmente.

---

## 🚀 Inicio Rápido

```bash
# 1. Haz que los scripts sean ejecutables
chmod +x setup.sh

# 2. Configura tu entorno e instala las dependencias
./setup.sh

# 3. (Opcional) Inicia el servidor de desarrollo
./setup.sh --start-dev
# o a través de Makefile
make setup
make run-dev
````

-----

## 🛠️ Prerrequisitos

Antes de ejecutar `setup.sh`, asegúrate de tener:

  - **Bash** 4.4 o superior
  - **Node.js** ≥ v18 (incluye `npm`)
  - **Python** ≥ 3.8 (`python3`, `pip3`)
  - **curl** (para instalar uv y Ollama)
  - **make** (para la integración con Makefile)

En **macOS**, puedes instalar las herramientas que falten a través de Homebrew:

```bash
brew update
brew install node python3 curl make
```

En **Linux** (Debian/Ubuntu):

```bash
sudo apt update && sudo apt install -y bash nodejs npm python3 python3-pip curl make
```

-----

## 🔧 Configuración del Entorno

El proyecto utiliza archivos `.env` en dos niveles:

1.  **`.env` raíz** — se copia desde `./.env.example` si no existe.
2.  **`.env` del backend** — se copia desde `apps/backend/.env.sample` si no existe.

Puedes personalizar cualquier variable en estos archivos antes o después de la inicialización.

### Variables Comunes

| Nombre                    | Descripción                             | Valor por Defecto              |
| ------------------------- | --------------------------------------- | ------------------------------ |
| `SYNC_DATABASE_URL`       | URI de conexión a la base de datos del backend | `sqlite:///db.sqlite3`         |
| `SESSION_SECRET_KEY`      | Clave secreta de sesión para FastAPI    | `a-secret-key`                 |
| `PYTHONDONTWRITEBYTECODE` | Deshabilitar archivos de bytecode de Python | `1`                            |
| `ASYNC_DATABASE_URL`      | URI de conexión asíncrona de la BD | `sqlite+aiosqlite:///./app.db` |
| `NEXT_PUBLIC_API_URL`     | URI del proxy del frontend al backend   | `http://localhost:8000`        |

> **Nota:** `setup.sh` exporta `PYTHONDONTWRITEBYTECODE=1` para evitar la creación de archivos `.pyc`.

-----

## 📦 Pasos de Instalación

1.  **Clona el repositorio**

    ```bash
    git clone https://github.com/srbhr/Resume-Matcher.git
    cd Resume-Matcher
    ```

2.  **Haz que el script de configuración sea ejecutable**

    ```bash
    chmod +x setup.sh
    ```

3.  **Ejecuta la configuración**

    ```bash
    ./setup.sh
    ```

    Esto hará lo siguiente:

      - Verificar/instalar prerrequisitos (`node`, `npm`, `python3`, `pip3`, `uv`, `ollama`).
      - Descargar el modelo `gemma3:4b` a través de Ollama.
      - Inicializar los archivos `.env` en la raíz y en el backend.
      - Instalar dependencias de Node.js (`npm ci`) en la raíz y en el frontend.
      - Sincronizar dependencias de Python en `apps/backend` a través de `uv sync`.

4.  **(Opcional) Iniciar el desarrollo**

    ```bash
    ./setup.sh --start-dev
    # o
    make setup
    make run-dev
    ```

    Presiona `Ctrl+C` para detenerlo de forma segura.

5.  **Compilar para producción**

    ```bash
    npm run build
    # o
    make run-prod
    ```

-----

## 🔨 Targets de Makefile

  - **`make help`** — Muestra los targets disponibles.
  - **`make setup`** — Ejecuta `setup.sh`.
  - **`make run-dev`** — Inicia el servidor de desarrollo (seguro ante `SIGINT`).
  - **`make run-prod`** — Compila para producción.
  - **`make clean`** — Elimina los artefactos de compilación (personaliza según sea necesario).

-----

## 🐞 Solución de Problemas

  - **`permission denied`** (permiso denegado) en `setup.sh`:

      - Ejecuta `chmod +x setup.sh`.

  - **`uv: command not found`** (comando no encontrado) a pesar de la instalación:

      - Asegúrate de que `~/.local/bin` esté en tu `$PATH`.

  - **`ollama: command not found`** en Linux:

      - Verifica que el script de instalación se haya ejecutado, o instálalo manualmente a través del gestor de paquetes.

  - **Errores de `npm ci`**:

      - Comprueba que tu `package-lock.json` esté sincronizado con `package.json`.

-----

## 🖋️ Frontend

  - Por favor, asegúrate de tener habilitada la opción de formatear al guardar en tu editor (o) ejecuta `npm run format` para formatear todos los cambios preparados (*staged changes*).

*Última actualización: 25 de mayo de 2025*