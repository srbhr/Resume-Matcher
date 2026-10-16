<div align="center">

[![Resume Matcher](assets/header.webp)](https://www.resumematcher.fyi)

# Resume Matcher

[English](README.md) | **Español** | [简体中文](README.zh-CN.md) | [日本語](README.ja.md)

[𝙹𝚘𝚒𝚗 𝙳𝚒𝚜𝚌𝚘𝚛𝚍](https://dsc.gg/resume-matcher) ✦ [𝚆𝚎𝚋𝚜𝚒𝚝𝚎](https://resumematcher.fyi) ✦ [𝙷𝚘𝚠 𝚝𝚘 𝙸𝚗𝚜𝚝𝚊𝚕𝚕](https://resumematcher.fyi/docs/installation) ✦ [𝙲𝚘𝚗𝚝𝚛𝚒𝚋𝚞𝚝𝚘𝚛𝚜](#contributors) ✦ [𝚂𝚙𝚘𝚗𝚜𝚘𝚛](#sponsors) ✦ [𝚃𝚠𝚒𝚝𝚝𝚎𝚛/𝚇](https://twitter.com/srbhr_r) ✦ [𝙻𝚒𝚗𝚔𝚎𝚍𝙸𝚗](https://www.linkedin.com/company/resume-matcher/) ✦ [𝙲𝚛𝚎𝚊𝚝𝚘𝚛](https://srbhr.com)

Constructor de currículums de código abierto que adapta tu currículum (CV u hoja de vida) a cada oferta de trabajo. Una herramienta de IA autoalojada que funciona con Claude, ChatGPT, DeepSeek, Kimi, GLM, Gemma y otros LLM, locales o remotos.

Esperamos convertir esto en **el VS Code para crear currículums**.

![Resume Matcher Demo](assets/Resume_Matcher_Demo_2.gif)

</div>

<br>

<div align="center">

![Stars](https://img.shields.io/github/stars/srbhr/Resume-Matcher?labelColor=F0F0E8&style=for-the-badge&color=1d4ed8)
![Apache 2.0](https://img.shields.io/github/license/srbhr/Resume-Matcher?labelColor=F0F0E8&style=for-the-badge&color=1d4ed8) ![Forks](https://img.shields.io/github/forks/srbhr/Resume-Matcher?labelColor=F0F0E8&style=for-the-badge&color=1d4ed8) ![version](https://img.shields.io/badge/Version-1.3%20Crescendolls-FFF?labelColor=F0F0E8&style=for-the-badge&color=1d4ed8)

[![Discord](https://img.shields.io/discord/1122069176962531400?labelColor=F0F0E8&logo=discord&logoColor=1d4ed8&style=for-the-badge&color=1d4ed8)](https://dsc.gg/resume-matcher) [![Website](https://img.shields.io/badge/website-Resume%20Matcher-FFF?labelColor=F0F0E8&style=for-the-badge&color=1d4ed8)](https://resumematcher.fyi) [![LinkedIn](https://img.shields.io/badge/LinkedIn-Resume%20Matcher-FFF?labelColor=F0F0E8&logo=LinkedIn&style=for-the-badge&color=1d4ed8)](https://www.linkedin.com/company/resume-matcher/)

<a href="https://trendshift.io/repositories/565" target="_blank"><img src="https://trendshift.io/api/badge/repositories/565" alt="srbhr%2FResume-Matcher | Trendshift" style="width: 250px; height: 55px;" width="250" height="55"/></a>

![Vercel OSS Program](https://vercel.com/oss/program-badge.svg)

</div>

> \[!IMPORTANT]
>
> El proyecto necesita tu ayuda y apoyo. Si puedes donar una pequeña cantidad, me ayudarás a seguir desarrollando y mejorando Resume Matcher.

<div align="center">

[![Sponsor on GitHub](https://img.shields.io/github/sponsors/srbhr?style=for-the-badge&label=Sponsor&color=1d4ed8&labelColor=F0F0E8&logo=github&logoColor=black)](https://github.com/sponsors/srbhr) [![Buy Me a Coffee](https://img.shields.io/badge/Buy%20Me%20a%20Coffee-ffdd00?style=for-the-badge&logo=buy-me-a-coffee&color=1d4ed8&labelColor=F0F0E8&logoColor=black)](https://www.buymeacoffee.com/srbhr)

**¿Patrocinas en nombre de una empresa?** Coloca tu logo ante más de 27k desarrolladores → **[conviértete en patrocinador ↓](#sponsors)**

</div>

## Primeros pasos

Resume Matcher funciona creando un currículum maestro que puedes usar para adaptar cada postulación. Instrucciones de instalación aquí: [Cómo instalar](#how-to-install)

### Cómo funciona

1. **Sube** tu currículum maestro (PDF o DOCX)
2. **Pega** la descripción del puesto al que apuntas
3. **Revisa** mejoras y contenido adaptado generado por IA
4. **Genera** carta de presentación y plantillas de email para la postulación
5. **Personaliza** el diseño y las secciones a tu estilo
6. **Exporta** como PDF profesional con tu plantilla preferida

### Hecho para ingenieros de software

Instalar Resume Matcher requiere una terminal, así que la mayoría de quienes lo usan escriben software. Se adapta a tu forma de trabajar:

- **Corre en tu máquina.** Un backend FastAPI, un frontend Next.js y un archivo SQLite. Clona el repositorio o inicia un contenedor Docker. No creas ninguna cuenta y tu currículum se queda en tu propia base de datos.
- **Tú eliges el modelo.** Usa una API key de OpenAI, Anthropic, Gemini, DeepSeek, OpenRouter o Groq, o ejecuta un modelo local con Ollama para que tu currículum nunca salga de tu máquina.
- **Claude Code puede manejarlo.** El [servidor MCP](SETUP.es.md#usar-resume-matcher-desde-claude-code-o-claude-desktop-mcp) permite que Claude Code, Cursor o Codex escriban el currículum adaptado mientras Resume Matcher lo guarda, lo revisa y lo renderiza, sin API key de LLM.
- **Se limita a tu experiencia real.** Los prompts de adaptación prohíben añadir habilidades, herramientas, empresas o métricas que no estén en tu currículum maestro.
- **Las puntuaciones son código que puedes leer.** La puntuación ATS ([`services/ats.py`](apps/backend/app/services/ats.py)) y la revisión ATS ([`services/ats_parse/`](apps/backend/app/services/ats_parse/)) no llaman a ningún LLM. La revisión ATS pasa tu PDF por pdfminer para mostrarte lo que extraería un sistema de seguimiento de candidatos (ATS).
- **Las plantillas parecen currículums de ingeniería.** Deedy, Modern Deedy y un diseño estilo LaTeX conviven con opciones de una y dos columnas. Siete de los diseños también existen como proyectos pdfLaTeX editables para Overleaf en [resume-matcher-templates](https://github.com/resume-matcher/resume-matcher-templates).

### Mantente conectado

[![Discord](assets/resume_matcher_discord.webp)](https://dsc.gg/resume-matcher)

Únete a nuestro [Discord](https://dsc.gg/resume-matcher) para discusiones, solicitudes de funcionalidades y soporte de la comunidad.

[![LinkedIn](assets/resume_matcher_linkedin.webp)](https://www.linkedin.com/company/resume-matcher/)

Síguenos en [LinkedIn](https://www.linkedin.com/company/resume-matcher/) para actualizaciones.

![Star Resume Matcher](assets/star_resume_matcher.webp)

Dale una estrella al repositorio para apoyar el desarrollo y recibir notificaciones de nuevas versiones.

<a id="sponsors"></a>

## Patrocinadores

![sponsors](assets/sponsors.webp)

Resume Matcher es libre y de código abierto, y se mantiene gracias a sus patrocinadores y colaboradores. Si te resulta útil, considera apoyar su desarrollo.

### Empresas que respaldan Resume Matcher

Patrocina con un nivel de empresa y **tu logo + enlace + descripción aparecerán aquí** — ante una comunidad de **más de 27k estrellas y 4.9k forks**, destacada en [Trendshift](https://trendshift.io/repositories/565) y el [Programa Vercel OSS](https://vercel.com/oss).

| Patrocinador | Descripción |
|---------|-------------|
| [APIDECK](https://apideck.com?utm_source=resumematcher&utm_medium=github&utm_campaign=sponsors) | Una API para conectar tu aplicación con más de 200 plataformas SaaS (contabilidad, HRIS, CRM, almacenamiento de archivos). Crea integraciones una vez, no 50. 🌐 [apideck.com](https://apideck.com?utm_source=resumematcher&utm_medium=github&utm_campaign=sponsors) |
| [Vercel](https://vercel.com?utm_source=resumematcher&utm_medium=github&utm_campaign=sponsors) | Resume Matcher es parte del programa Vercel OSS // Summer 2025 🌐 [vercel.com](https://vercel.com?utm_source=resumematcher&utm_medium=github&utm_campaign=sponsors) |
| [Cubic.dev](https://cubic.dev?utm_source=resumematcher&utm_medium=github&utm_campaign=sponsors) | Cubic ofrece revisiones de PR para Resume Matcher 🌐 [cubic.dev](https://cubic.dev?utm_source=resumematcher&utm_medium=github&utm_campaign=sponsors) |
| [Kilo Code](https://kilo.ai?utm_source=resumematcher&utm_medium=github&utm_campaign=sponsors) | Kilo Code proporciona revisiones de código de IA y créditos de codificación a Resume Matcher 🌐 [kilo.ai](https://kilo.ai?utm_source=resumematcher&utm_medium=github&utm_campaign=sponsors) |
| [ZanReal](https://zanreal.com/?utm_source=resumematcher&utm_medium=github&utm_campaign=sponsors) | ZanReal es una empresa de desarrollo impulsada por IA que crea soluciones cloud escalables, desde la estrategia y la UX hasta DevOps, ayudando a los equipos a lanzar más rápido y convertir ideas en producción. 🌐 [zanreal.com](https://zanreal.com/?utm_source=resumematcher&utm_medium=github&utm_campaign=sponsors) |
| **✦ Tu empresa aquí** | Llega a más de 27k desarrolladores y 4.9k forks. **[Conviértete en patrocinador →](https://github.com/sponsors/srbhr)** |

Por favor lee nuestra [Sponsorship Guide](https://resumematcher.fyi/docs/sponsoring) para detalles de cómo tu patrocinio ayuda al proyecto. Recibirás un agradecimiento especial en el ReadME y en nuestro sitio web.

<a id="support-the-development-by-donating"></a>

### Apoya como particular

![donate](assets/supporting_resume_matcher.webp)

Cada aporte mantiene Resume Matcher gratis y financia nuevas funciones — y recibirás un agradecimiento en el ReadME y en nuestro sitio web.

| Plataforma  | Enlace |
|-----------|--------|
| GitHub | [![GitHub Sponsors](https://img.shields.io/github/sponsors/srbhr?style=for-the-badge&color=1d4ed8&labelColor=F0F0E8&logo=github&logoColor=black)](https://github.com/sponsors/srbhr) |
| Buy Me a Coffee | [![BuyMeACoffee](https://img.shields.io/badge/Buy%20Me%20a%20Coffee-ffdd00?style=for-the-badge&logo=buy-me-a-coffee&color=1d4ed8&labelColor=F0F0E8&logoColor=black)](https://www.buymeacoffee.com/srbhr) |

## Nota del Creador

Gracias por visitar Resume Matcher. Si quieres conectar, colaborar o simplemente saludar, ¡no dudes en contactarme!
~ **Saurabh Rai** ✨

Puedes seguirme en:

- Website: [https://srbhr.com](https://srbhr.com)
- Linkedin: [https://www.linkedin.com/in/srbhr/](https://www.linkedin.com/in/srbhr/)
- Twitter: [https://twitter.com/srbhr_r](https://twitter.com/srbhr_r)
- GitHub: [https://github.com/srbhr](https://github.com/srbhr)

## Funciones clave

![resume_matcher_features](assets/features.webp)

### Funciones principales

**Currículum maestro**: crea un currículum maestro completo a partir de tu currículum actual.

![Dashboard with a master resume and seven tailored resumes](assets/step_2.webp)

### Constructor de currículum

![Resume Builder with the template picker and a live preview of a software engineer resume](assets/step_5.webp)

Pega una descripción del puesto y obtén un currículum adaptado con ayuda de IA.

Puedes:

- Modificar el contenido sugerido
- Añadir/quitar secciones
- Reordenar secciones con arrastrar y soltar
- Elegir entre múltiples plantillas

### Generador de carta de presentación y email

Genera cartas de presentación y plantillas de email adaptadas según la descripción del puesto y tu currículum.

![Cover letter editor next to its PDF preview](assets/cover_letter.webp)

### Puntuación del currículum (función en desarrollo)

Estamos trabajando en una función de puntuación que analiza tu currículum frente a la descripción del puesto y ofrece un puntaje de coincidencia con sugerencias de mejora.

![JD Match tab with the ATS score breakdown and matching keywords highlighted](assets/keyword_highlighter.webp)

### Exportación a PDF

Exporta tu currículum adaptado y tu carta de presentación en PDF.

### Plantillas

Las plantillas exportan PDF con texto real, en A4 o US Letter, que los sistemas de seguimiento de candidatos (ATS) pueden leer.

| Nombre de plantilla | Vista previa | Descripción |
|---------------------|-------------|-------------|
| **Una columna** | ![Una columna](assets/pdf-templates/single-column.webp) | Diseño tradicional de ancho completo con máxima densidad de contenido. [Ver PDF](assets/pdf-templates/single-column.pdf) |
| **Dos columnas** | ![Dos columnas](assets/pdf-templates/two-column.webp) | Columna principal centrada en experiencia con barra lateral para habilidades. [Ver PDF](assets/pdf-templates/two-column.pdf) |
| **Moderno** | ![Moderno](assets/pdf-templates/modern-single-column.webp) | Acentos coloridos con colores de tema personalizables. [Ver PDF](assets/pdf-templates/modern-single-column.pdf) |
| **Moderno de dos columnas** | ![Moderno de dos columnas](assets/pdf-templates/modern-two-column.webp) | Diseño de dos columnas moderno con acentos coloridos y temas. [Ver PDF](assets/pdf-templates/modern-two-column.pdf) |
| **LaTeX** | ![LaTeX](assets/pdf-templates/latex.webp) | Diseño académico clásico con tipografía serif y encabezados con líneas. [Ver PDF](assets/pdf-templates/latex.pdf) |
| **Limpio** | ![Limpio](assets/pdf-templates/clean.webp) | Diseño minimalista sans con encabezados grandes y sobrios. [Ver PDF](assets/pdf-templates/clean.pdf) |
| **Vívido** | ![Vívido](assets/pdf-templates/vivid.webp) | Diseño de dos columnas colorido con encabezados de acento y viñetas de flecha. [Ver PDF](assets/pdf-templates/vivid.pdf) |
| **Vívido de una columna** | ![Vívido de una columna](assets/pdf-templates/vivid-single.webp) | Diseño de una columna colorido con encabezados de acento y viñetas de flecha. [Ver PDF](assets/pdf-templates/vivid-single.pdf) |
| **Modern Deedy** | ![Modern Deedy](assets/pdf-templates/modern-deedy.webp) | Diseño denso de una página en Lato con encabezados de sección en mayúsculas de gris claro. [Ver PDF](assets/pdf-templates/modern-deedy.pdf) |
| **Deedy** | ![Deedy](assets/pdf-templates/deedy.webp) | Diseño de dos columnas con nombre en trazo fino, columna izquierda estrecha y encabezados en gris claro. [Ver PDF](assets/pdf-templates/deedy.pdf) |

### Internacionalización

- **UI multilingüe**: interfaz disponible en inglés, español, chino y japonés
- **Contenido multilingüe**: genera currículums y cartas de presentación en tu idioma preferido

### Roadmap

Si tienes alguna sugerencia o solicitud de características, no dudes en abrir un *issue* en GitHub o discutirlo en nuestro servidor de [Discord](https://dsc.gg/resume-matcher).

- Resaltado visual de palabras clave
- AI Canvas para crear contenido de currículum impactante y basado en métricas
- Optimización para múltiples descripciones de trabajo

## Guías de currículum para ingenieros de software

El [blog de Resume Matcher](https://resumematcher.fyi/es/blog/) tiene guías para desarrolladores, desde el primer currículum para unas prácticas hasta una postulación a FAANG:

- [Currículum de ingeniero de software](https://resumematcher.fyi/es/blog/software-engineer-resume/): una plantilla de una página, dos ejemplos comentados y consejos para cada sección
- [Currículum de ciencias de la computación](https://resumematcher.fyi/es/blog/computer-science-resume/): para estudiantes y recién graduados, a partir de proyectos y prácticas
- [Currículum para FAANG](https://resumematcher.fyi/es/blog/faang-resume/): lo que Google, Meta y Amazon dicen que evalúan, según sus propias páginas de empleo
- [Currículum en LaTeX](https://resumematcher.fyi/es/blog/latex-resume/): Jake's, sb2nov y Awesome-CV, Overleaf, y cómo lee el PDF un parser
- [Constructores de currículum de código abierto](https://resumematcher.fyi/es/blog/open-source-resume-builders/): Reactive Resume, RenderCV, YAMLResume, Awesome-CV y otros, comparados
- [Currículum maestro](https://resumematcher.fyi/es/blog/master-resume/): el currículum completo del que adaptas cada postulación
- [Adaptar tu currículum (CV) a la descripción de un puesto](https://resumematcher.fyi/es/blog/how-to-match-your-resume-to-a-job-description/): el método, paso a paso
- [Adapta tu currículum con IA en privado, con Ollama](https://resumematcher.fyi/es/blog/local-ai-resume-tailoring-ollama/): tu currículum se queda en tu propia máquina

<a id="how-to-install"></a>

## Cómo instalar

![Instalación](assets/how_to_install_resumematcher.webp)

Para instrucciones detalladas de configuración, consulta **[SETUP.es.md](SETUP.es.md)**. También está disponible en [English](SETUP.md), [简体中文](SETUP.zh-CN.md) y [日本語](SETUP.ja.md).

### Requisitos previos

| Herramienta | Versión | Instalación |
|------------|---------|-------------|
| Python | 3.13+ | [python.org](https://python.org) |
| Node.js | 24+ | [nodejs.org](https://nodejs.org) |
| uv | Última | [astral.sh/uv](https://docs.astral.sh/uv/getting-started/installation/) |

### Inicio rápido

La forma más rápida (MacOS, WSL y Ubuntu):

```bash
# Clona el repositorio
git clone https://github.com/srbhr/Resume-Matcher.git
cd Resume-Matcher

# Backend (Terminal 1)
cd apps/backend
cp .env.example .env        # Configura tu proveedor de IA
uv sync                      # Instala dependencias
uv run app

# Frontend (Terminal 2)
cd apps/frontend
npm install
npm run dev
```

Abre **<http://localhost:3000>** y configura tu proveedor de IA en Settings.

### Proveedores de IA compatibles

| Proveedor | Local/Nube | Notas |
|----------|------------|-------|
| **Ollama** | Local | Gratis, se ejecuta en tu máquina |
| **OpenAI** | Nube | GPT-4o, GPT-4o-mini |
| **Anthropic** | Nube | Claude 3.5 Sonnet |
| **Google Gemini** | Nube | Gemini 1.5 Flash/Pro |
| **OpenRouter** | Nube | Acceso a múltiples modelos |
| **DeepSeek** | Nube | DeepSeek Chat |

### Despliegue con Docker

```bash
docker pull srbhr/resume-matcher:latest

docker run srbhr/resume-matcher:latest
```

<!-- Nota: La documentación de Docker está pendiente. Por ahora, usa docker-compose.yml como referencia -->

> **¿Usas Ollama con Docker?** Usa `http://host.docker.internal:11434` como URL de Ollama en lugar de `localhost`.

### Stack tecnológico

| Componente | Tecnología |
|-----------|------------|
| Backend | FastAPI, Python 3.13+, LiteLLM |
| Frontend | Next.js 15, React 19, TypeScript |
| Base de datos | TinyDB (almacenamiento en archivo JSON) |
| Estilos | Tailwind CSS 4, Swiss International Style |
| PDF | Chromium headless vía Playwright |

## Únete y contribuye

![Cómo contribuir](assets/how_to_contribute.webp)

¡Damos la bienvenida a las contribuciones de todos! Ya seas un desarrollador, diseñador o simplemente alguien que quiere ayudar. Todos los colaboradores están listados en la [página "Acerca de"](https://resumematcher.fyi/about) en nuestro sitio web y en el Readme de GitHub.

Echa un vistazo al roadmap si te gustaría trabajar en las características que están planeadas para el futuro. Si tienes alguna sugerencia o solicitud de características, no dudes en abrir un *issue* en GitHub y discutirlo en nuestro servidor de [Discord](https://dsc.gg/resume-matcher).

<a id="contributors"></a>

## Colaboradores

![Colaboradores](assets/contributors.webp)

<a href="https://github.com/srbhr/Resume-Matcher/graphs/contributors">
  <img src="https://contrib.rocks/image?repo=srbhr/Resume-Matcher" />
</a>

<details>
  <summary><kbd>Historial de Estrellas</kbd></summary>
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://star-history.dera.page/svg?repos=srbhr/resume-matcher&theme=dark&type=Date">
    <img width="100%" src="https://star-history.dera.page/svg?repos=srbhr/resume-matcher&theme=dark&type=Date">
  </picture>
</details>

## Resume Matcher es parte del [Vercel Open Source Program](https://vercel.com/oss)

![Vercel OSS Program](https://vercel.com/oss/program-badge.svg)
