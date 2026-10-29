<div align="center">

[![Resume Matcher](assets/header.webp)](https://resumematcher.fyi/)

# Resume Matcher

[𝙹𝚘𝚒𝚗 𝙳𝚒𝚜𝚌𝚘𝚛𝚍](https://dsc.gg/resume-matcher) ✦ [𝚆𝚎𝚋𝚜𝚒𝚝𝚎](https://resumematcher.fyi/) ✦ [𝙷𝚘𝚠 𝚝𝚘 𝙸𝚗𝚜𝚝𝚊𝚕𝚕](https://resumematcher.fyi/docs/installation/) ✦ [𝙲𝚘𝚗𝚝𝚛𝚒𝚋𝚞𝚝𝚘𝚛𝚜](#contributors) ✦ [𝚂𝚙𝚘𝚗𝚜𝚘𝚛](#sponsors) ✦ [𝚃𝚠𝚒𝚝𝚝𝚎𝚛/𝚇](https://twitter.com/srbhr_r) ✦ [𝙻𝚒𝚗𝚔𝚎𝚍𝙸𝚗](https://www.linkedin.com/company/resume-matcher/) ✦ [𝙲𝚛𝚎𝚊𝚝𝚘𝚛](https://srbhr.com)

[English](README.md) | [Español](README.es.md) | [简体中文](README.zh-CN.md) | [日本語](README.ja.md) | **Português (BR)**

Gerador de currículos (CV) gratuito e de código aberto que adapta o seu currículo a cada descrição de vaga. Uma estrutura de IA autohospedada para Claude, ChatGPT, DeepSeek, Kimi, GLM, Gemma e outros LLMs, locais ou remotos.

![Resume Matcher Demo](assets/Resume_Matcher_Demo_2.gif)

</div>

<br>

<div align="center">

![Stars](https://img.shields.io/github/stars/srbhr/Resume-Matcher?labelColor=F0F0E8&style=for-the-badge&color=1d4ed8)
![Apache 2.0](https://img.shields.io/github/license/srbhr/Resume-Matcher?labelColor=F0F0E8&style=for-the-badge&color=1d4ed8) ![Forks](https://img.shields.io/github/forks/srbhr/Resume-Matcher?labelColor=F0F0E8&style=for-the-badge&color=1d4ed8) ![version](https://img.shields.io/badge/Version-1.4%20Short%20Circuit%20-FFF?labelColor=F0F0E8&style=for-the-badge&color=1d4ed8)

[![Discord](https://img.shields.io/discord/1122069176962531400?labelColor=F0F0E8&logo=discord&logoColor=1d4ed8&style=for-the-badge&color=1d4ed8)](https://dsc.gg/resume-matcher) [![Website](https://img.shields.io/badge/website-Resume%20Matcher-FFF?labelColor=F0F0E8&style=for-the-badge&color=1d4ed8)](https://resumematcher.fyi/) [![LinkedIn](https://img.shields.io/badge/LinkedIn-Resume%20Matcher-FFF?labelColor=F0F0E8&logo=LinkedIn&style=for-the-badge&color=1d4ed8)](https://www.linkedin.com/company/resume-matcher/)

<a href="https://trendshift.io/repositories/565" target="_blank"><img src="https://trendshift.io/api/badge/repositories/565" alt="srbhr%2FResume-Matcher | Trendshift" style="width: 250px; height: 55px;" width="250" height="55"/></a>

![Vercel OSS Program](https://vercel.com/oss/program-badge.svg)

</div>

> \[!IMPORTANT]
>
> O projeto precisa da sua ajuda e do seu apoio. Se você puder doar um valor pequeno, isso me ajuda a continuar desenvolvendo e melhorando o Resume Matcher.

<div align="center">

[![Sponsor on GitHub](https://img.shields.io/github/sponsors/srbhr?style=for-the-badge&label=Sponsor&color=1d4ed8&labelColor=F0F0E8&logo=github&logoColor=black)](https://github.com/sponsors/srbhr) [![Buy Me a Coffee](https://img.shields.io/badge/Buy%20Me%20a%20Coffee-ffdd00?style=for-the-badge&logo=buy-me-a-coffee&color=1d4ed8&labelColor=F0F0E8&logoColor=black)](https://www.buymeacoffee.com/srbhr)

**Patrocinando em nome de uma empresa?** Coloque o seu logo na frente de mais de 27 mil desenvolvedores → **[torne-se um patrocinador ↓](#sponsors)**

</div>

## Primeiros passos

O Resume Matcher funciona criando um currículo mestre que você usa para adaptar cada candidatura. Instruções de instalação aqui: [Como instalar](#how-to-install)

### Como funciona

1. **Envie** o seu currículo mestre (PDF ou DOCX)
2. **Cole** a descrição da vaga que você tem em mente
3. **Revise** as melhorias geradas por IA e o conteúdo adaptado
4. **Carta de apresentação** e preparação opcional para entrevistas para a candidatura
5. **Personalize** o layout e as seções ao seu gosto
6. **Exporte** como um PDF profissional com o template de sua preferência

### Feito para engenheiros de software

Instalar o Resume Matcher exige um terminal, então a maioria de quem o usa escreve software. Ele se encaixa no jeito como você já trabalha:

- **Roda na sua máquina.** Um backend FastAPI, um frontend Next.js e um arquivo SQLite. Clone o repositório ou suba um único contêiner Docker. Você não cria conta, e o seu currículo fica no seu próprio banco de dados.
- **Você escolhe o modelo.** Use uma chave de API da OpenAI, Anthropic, Gemini, DeepSeek, OpenRouter ou Groq, ou rode um modelo local com o Ollama para que o seu currículo nunca saia da máquina.
- **O Claude Code pode operá-lo.** O [servidor MCP](SETUP.pt-BR.md#usar-o-resume-matcher-pelo-claude-code-ou-claude-desktop-mcp) permite que o Claude Code, o Cursor ou o Codex escrevam o currículo adaptado enquanto o Resume Matcher armazena, verifica e renderiza o resultado, sem chave de API de LLM.
- **Ele se prende à sua experiência real.** Os prompts de adaptação proíbem acrescentar habilidades, ferramentas, empregadores ou métricas que não estejam no seu currículo mestre.
- **As pontuações são código simples.** A pontuação ATS ([`services/ats.py`](apps/backend/app/services/ats.py)) e a verificação ATS ([`services/ats_parse/`](apps/backend/app/services/ats_parse/)) não fazem nenhuma chamada a LLM. A verificação ATS passa o seu PDF pelo pdfminer para mostrar o que um sistema de rastreamento de candidatos (ATS) extrairia.
- **Os templates parecem currículos de engenharia.** Deedy, Modern Deedy e um layout no estilo LaTeX ficam ao lado de opções de coluna única e de duas colunas. Sete dos designs também estão disponíveis como projetos pdfLaTeX editáveis para o Overleaf em [resume-matcher-templates](https://github.com/resume-matcher/resume-matcher-templates).

### Fique por dentro

[![Discord](assets/resume_matcher_discord.webp)](https://dsc.gg/resume-matcher)

Entre no nosso [Discord](https://dsc.gg/resume-matcher) para discussões, pedidos de recursos e suporte da comunidade.

[![LinkedIn](assets/resume_matcher_linkedin.webp)](https://www.linkedin.com/company/resume-matcher/)

Siga-nos no [LinkedIn](https://www.linkedin.com/company/resume-matcher/) para novidades.

![Star Resume Matcher](assets/star_resume_matcher.webp)

Dê uma estrela no repositório para apoiar o desenvolvimento e ser avisado de novas versões.

<a id="sponsors"></a>

## Patrocinadores

![sponsors](assets/sponsors.webp)

O Resume Matcher é gratuito e de código aberto, mantido por seus patrocinadores e apoiadores. Se ele te ajuda, considere apoiar o seu desenvolvimento.

### Empresas que apoiam o Resume Matcher

Patrocine em um nível de empresa e **o seu logo, o link e a descrição aparecem aqui**, diante de uma comunidade de **mais de 27 mil estrelas e 4,9 mil forks**, com destaque no [Trendshift](https://trendshift.io/repositories/565) e no [Vercel OSS Program](https://vercel.com/oss).

| Patrocinador | Descrição |
|---------|-------------|
| [Apideck](https://apideck.com?utm_source=resumematcher&utm_medium=github&utm_campaign=sponsors) | Uma API para conectar o seu app a mais de 200 plataformas SaaS (contabilidade, HRIS, CRM, armazenamento de arquivos). Construa integrações uma vez, não 50. 🌐 [apideck.com](https://apideck.com?utm_source=resumematcher&utm_medium=github&utm_campaign=sponsors) |
| [Vercel](https://vercel.com?utm_source=resumematcher&utm_medium=github&utm_campaign=sponsors) | O Resume Matcher faz parte do programa Vercel OSS // Summer 2025 🌐 [vercel.com](https://vercel.com?utm_source=resumematcher&utm_medium=github&utm_campaign=sponsors) |
| [Cubic.dev](https://cubic.dev?utm_source=resumematcher&utm_medium=github&utm_campaign=sponsors) | A Cubic faz as revisões de PR do Resume Matcher 🌐 [cubic.dev](https://cubic.dev?utm_source=resumematcher&utm_medium=github&utm_campaign=sponsors) |
| [Kilo Code](https://kilo.ai?utm_source=resumematcher&utm_medium=github&utm_campaign=sponsors) | A Kilo Code oferece ao Resume Matcher revisões de código com IA e créditos de programação 🌐 [kilo.ai](https://kilo.ai?utm_source=resumematcher&utm_medium=github&utm_campaign=sponsors) |
| [ZanReal](https://zanreal.com/?utm_source=resumematcher&utm_medium=github&utm_campaign=sponsors) | A ZanReal é uma empresa de desenvolvimento orientada por IA que constrói soluções de nuvem escaláveis, da estratégia e UX ao DevOps, ajudando equipes a entregar mais rápido e a levar ideias para produção. 🌐 [zanreal.com](https://zanreal.com/?utm_source=resumematcher&utm_medium=github&utm_campaign=sponsors) |
| **✦ Sua empresa aqui** | Alcance mais de 27 mil desenvolvedores e 4,9 mil forks. **[Torne-se um patrocinador →](https://github.com/sponsors/srbhr)** |

Leia o [Guia de Patrocínio](https://resumematcher.fyi/docs/sponsoring/) para ver os níveis e os detalhes. Patrocinadores recebem um agradecimento especial no README e no nosso site.

<a id="support-the-development-by-donating"></a>

### Apoie como pessoa física

![donate](assets/supporting_resume_matcher.webp)

Cada contribuição mantém o Resume Matcher gratuito e financia novos recursos, e você será agradecido no README e no nosso site.

| Plataforma  | Link                                   |
|-----------|----------------------------------------|
| GitHub    | [![GitHub Sponsors](https://img.shields.io/github/sponsors/srbhr?style=for-the-badge&color=1d4ed8&labelColor=F0F0E8&logo=github&logoColor=black)](https://github.com/sponsors/srbhr) |
| Buy Me a Coffee | [![BuyMeACoffee](https://img.shields.io/badge/Buy%20Me%20a%20Coffee-ffdd00?style=for-the-badge&logo=buy-me-a-coffee&color=1d4ed8&labelColor=F0F0E8&logoColor=black)](https://www.buymeacoffee.com/srbhr) |

## Nota do criador

[![srbhr](assets/creators_note.webp)](https://srbhr.com)

Obrigado por conhecer o Resume Matcher. Se você quiser se conectar, colaborar ou só dar um oi, fique à vontade para entrar em contato!
~ **Saurabh Rai** ✨

Você pode me seguir em:

- Website: [https://srbhr.com](https://srbhr.com)
- Linkedin: [https://www.linkedin.com/in/srbhr/](https://www.linkedin.com/in/srbhr/)
- Twitter: [https://twitter.com/srbhr_r](https://twitter.com/srbhr_r)
- GitHub: [https://github.com/srbhr](https://github.com/srbhr)

## Principais recursos

![resume_matcher_features](assets/features.webp)

### Recursos essenciais

**Currículo mestre**: crie um currículo mestre completo, a partir do que você já tem, para servir de base.

![Dashboard with a master resume and seven tailored resumes](assets/step_2.webp)

### Construtor de currículos

![Resume Builder with the template picker and a live preview of a software engineer resume](assets/step_5.webp)

Cole uma descrição de vaga e receba um currículo gerado por IA e adaptado a essa função específica.

Você pode:

- Modificar o conteúdo sugerido
- Adicionar/remover seções
- Reordenar seções arrastando e soltando
- Escolher entre vários templates de currículo

### Gerador de cartas de apresentação

Gere cartas de apresentação sob medida com base na descrição da vaga e no seu currículo.

A abordagem de escrita padrão usa uma abertura específica, dois ou três exemplos de experiência relevantes, um parágrafo de adequação à empresa baseado na descrição da vaga fornecida e uma chamada para ação confiante. As cartas têm de 200 a 300 palavras e adaptam o tom e as convenções regionais quando as informações fornecidas dão contexto suficiente. Nomes, métricas, pesquisa sobre a empresa e motivações pessoais precisam estar sustentados pelas informações fornecidas. Prompts personalizados de carta de apresentação já existentes em Configurações continuam substituindo o padrão.

Essa abordagem é adaptada da [skill resume-cover-letter da jezweb](https://github.com/jezweb/claude-skills/blob/main/plugins/writing/skills/resume-cover-letter/SKILL.md). O editor, a prévia e a exportação em PDF que o Resume Matcher já tinha continuam disponíveis.

![Cover letter editor next to its PDF preview](assets/cover_letter.webp)

### Preparação para entrevistas

Gere uma preparação para entrevistas estruturada e baseada no seu currículo, para os currículos adaptados que você salvou. Use a aba Interview Prep do Construtor sob demanda ou ative a geração automática em Configurações.

### Fila de adaptação

Cole várias descrições de vaga na página Fila de adaptação (Tailoring Queue) e elas são adaptadas a partir do seu currículo mestre, uma depois da outra, em segundo plano. Cargo, empresa e ID da vaga são detectados a partir do texto sem chamar IA, e você pode editá-los. Um intervalo opcional entre as vagas (de 0 a 60 segundos) reduz o risco de atingir os limites de taxa do seu provedor. As vagas na fila ficam salvas no banco de dados e continuam depois de uma reinicialização.

### Pontuação ATS, verificação ATS e destaque de palavras-chave

A aba JD Match mostra a descrição da vaga ao lado do seu currículo, com as palavras-chave em comum destacadas, além de uma **pontuação ATS** de 0 a 100: correspondência de palavras-chave (40%), cobertura de habilidades (20%), correspondência do título da vaga (15%), completude das seções (15%) e consistência das datas (10%). Ela lista as palavras-chave que faltam e as que o seu currículo mestre já tem, para que você possa incluí-las sem inventar nada.

A aba **ATS Check** renderiza o seu PDF e lê o texto de volta do mesmo jeito que o extrator de texto de um sistema de rastreamento de candidatos, e depois informa a legibilidade para o parser, a ordem de leitura, os dados de contato e os títulos das seções. As duas rodam como código simples. [O que é uma pontuação ATS?](https://resumematcher.fyi/blog/what-is-an-ats-score/) explica as fórmulas.

![JD Match tab with the ATS score breakdown and matching keywords highlighted](assets/keyword_highlighter.webp)

### Exportação em PDF

Exporte o seu currículo adaptado e a sua carta de apresentação em PDF.

### Templates

Os templates exportam PDFs baseados em texto, em A4 ou US Letter, que os sistemas de rastreamento de candidatos conseguem interpretar.

| Template | Prévia | Descrição |
|---------------|---------|-------------|
| **Single Column** | ![Single Column](assets/pdf-templates/single-column.webp) | Layout tradicional de largura total, com a máxima densidade de conteúdo. [𝐕𝐢𝐞𝐰 𝐏𝐃𝐅](assets/pdf-templates/single-column.pdf) |
| **Two Column** | ![Two Column](assets/pdf-templates/two-column.webp) | Coluna principal focada em experiência, com barra lateral para habilidades. [𝐕𝐢𝐞𝐰 𝐏𝐃𝐅](assets/pdf-templates/two-column.pdf) |
| **Modern** | ![Modern](assets/pdf-templates/modern-single-column.webp) | Detalhes coloridos com cores de tema personalizáveis. [𝐕𝐢𝐞𝐰 𝐏𝐃𝐅](assets/pdf-templates/modern-single-column.pdf) |
| **Modern Two Column** | ![Modern Two Column](assets/pdf-templates/modern-two-column.webp) | Layout de duas colunas com detalhes coloridos modernos e temas. [𝐕𝐢𝐞𝐰 𝐏𝐃𝐅](assets/pdf-templates/modern-two-column.pdf) |
| **LaTeX** | ![LaTeX](assets/pdf-templates/latex.webp) | Layout acadêmico clássico com serifa e títulos de seção sublinhados. [𝐕𝐢𝐞𝐰 𝐏𝐃𝐅](assets/pdf-templates/latex.pdf) |
| **Clean** | ![Clean](assets/pdf-templates/clean.webp) | Layout minimalista sem serifa, com títulos de seção grandes e discretos. [𝐕𝐢𝐞𝐰 𝐏𝐃𝐅](assets/pdf-templates/clean.pdf) |
| **Vivid** | ![Vivid](assets/pdf-templates/vivid.webp) | Layout colorido de duas colunas, com títulos em destaque e marcadores em seta. [𝐕𝐢𝐞𝐰 𝐏𝐃𝐅](assets/pdf-templates/vivid.pdf) |
| **Vivid Single Column** | ![Vivid Single Column](assets/pdf-templates/vivid-single.webp) | Layout colorido de coluna única, com títulos em destaque e marcadores em seta. [𝐕𝐢𝐞𝐰 𝐏𝐃𝐅](assets/pdf-templates/vivid-single.pdf) |
| **Modern Deedy** | ![Modern Deedy](assets/pdf-templates/modern-deedy.webp) | Layout denso de uma página em Lato, com títulos de seção em maiúsculas cinza-claro. [𝐕𝐢𝐞𝐰 𝐏𝐃𝐅](assets/pdf-templates/modern-deedy.pdf) |
| **Deedy** | ![Deedy](assets/pdf-templates/deedy.webp) | Layout de duas colunas com nome em traço fino, coluna esquerda estreita e títulos em cinza-claro. [𝐕𝐢𝐞𝐰 𝐏𝐃𝐅](assets/pdf-templates/deedy.pdf) |

### Internacionalização

- **Interface multilíngue**: interface disponível em inglês, espanhol, chinês, japonês, português do Brasil, francês e coreano
- **Conteúdo multilíngue**: gere currículos e cartas de apresentação no idioma de sua preferência

### Roadmap

Se você tiver sugestões ou pedidos de recursos, fique à vontade para abrir uma issue no GitHub ou conversar no nosso servidor do [Discord](https://dsc.gg/resume-matcher).

- AI Canvas para criar conteúdo de currículo impactante e orientado por métricas
- Gerador de templates de e-mail para candidaturas
- Otimização para várias descrições de vaga

## Guias de currículo para engenheiros de software

O [blog do Resume Matcher](https://resumematcher.fyi/blog/) tem guias de escrita para desenvolvedores, do currículo do primeiro estágio a uma candidatura para a FAANG:

- [Currículo de engenheiro de software](https://resumematcher.fyi/blog/software-engineer-resume/): um template de uma página, dois exemplos comentados e conselhos para cada seção
- [Currículo de ciência da computação](https://resumematcher.fyi/blog/computer-science-resume/): para estudantes e recém-formados, construído a partir de projetos e estágios
- [Currículo para a FAANG](https://resumematcher.fyi/blog/faang-resume/): o que Google, Meta e Amazon dizem que avaliam, segundo as próprias páginas de carreiras
- [Currículo em LaTeX](https://resumematcher.fyi/blog/latex-resume/): Jake's, sb2nov e Awesome-CV, Overleaf, e como um parser lê o PDF
- [Geradores de currículo de código aberto](https://resumematcher.fyi/blog/open-source-resume-builders/): Reactive Resume, RenderCV, YAMLResume, Awesome-CV e outros comparados
- [Currículo mestre](https://resumematcher.fyi/blog/master-resume/): o currículo completo a partir do qual você adapta cada candidatura
- [Adapte o seu currículo a uma descrição de vaga](https://resumematcher.fyi/blog/how-to-match-your-resume-to-a-job-description/): o método, passo a passo
- [Adaptação de currículo com IA privada usando o Ollama](https://resumematcher.fyi/blog/local-ai-resume-tailoring-ollama/): mantenha o seu currículo na sua própria máquina
- [O que é uma pontuação ATS?](https://resumematcher.fyi/blog/what-is-an-ats-score/): como os verificadores de currículo calculam uma pontuação, com as fórmulas do Resume Matcher
- [Prompts do ChatGPT para adaptar currículos](https://resumematcher.fyi/blog/tailor-resume-with-chatgpt-claude/): prompts para ChatGPT e Claude que não inventam experiência

<a id="how-to-install"></a>

## Como instalar

![Installation](assets/how_to_install_resumematcher.webp)

Para instruções detalhadas de instalação, veja **[SETUP.pt-BR.md](SETUP.pt-BR.md)**. Também disponível em [English](SETUP.md), [Español](SETUP.es.md), [简体中文](SETUP.zh-CN.md) e [日本語](SETUP.ja.md).

### Pré-requisitos

| Ferramenta | Versão | Instalação |
|------|---------|--------------|
| Python | 3.13+ | [python.org](https://python.org) |
| Node.js | 24.22.1 (fixada em `.nvmrc`) | [nodejs.org](https://nodejs.org) |
| uv | Latest | [astral.sh/uv](https://docs.astral.sh/uv/getting-started/installation/) |

### Início rápido

O mais rápido para usuários de MacOS, WSL e Ubuntu:

```bash
# Clone the repository
git clone https://github.com/srbhr/Resume-Matcher.git
cd Resume-Matcher

# Backend (Terminal 1)
cd apps/backend
cp .env.example .env        # Configure your AI provider
uv sync                      # Install dependencies
uv run app

# Frontend (Terminal 2)
cd apps/frontend
npm install
npm run dev
```

Abra **<http://localhost:3000>** e configure o seu provedor de IA em Configurações.

**Windows 11:** veja [Instalação no Windows 11](SETUP.pt-BR.md#instalação-no-windows-11) para os comandos do PowerShell.

### Provedores de IA compatíveis

| Provedor | Local/Nuvem | Observações |
|----------|-------------|-------|
| **Seu agente de código** | Local | Sem chave de API. Abra o Claude Code, o Codex, o Cursor ou o Copilot nesta pasta e peça para ele configurar o Resume Matcher e adaptar o seu currículo: o agente faz o trabalho de IA no próprio app, e o Resume Matcher armazena, verifica e renderiza o resultado para você editar. Escolha **Coding agent** em Configurações. Veja [SETUP.pt-BR.md](SETUP.pt-BR.md#usar-o-resume-matcher-com-um-agente-de-código). |
| **Ollama** | Local | Gratuito, roda na sua máquina |
| **Assinatura do Claude (via Claude Code)** | Nuvem (via CLI local) | Executa a CLI `claude` que você já instalou, então este app não precisa de chave de API e nunca vê nem armazena as suas credenciais do Claude, mas os prompts ainda vão para a Anthropic por meio do seu login no Claude Code e contam para os limites de uso do seu plano (a Anthropic pode descontá-los de créditos de uso). A Anthropic não permite que apps de terceiros encaminhem requisições pelos planos Claude Free/Pro/Max, esta opção pode ser considerada um desses casos, e a Anthropic pode aplicar essa regra sem aviso; Configurações pede que você aceite esse risco antes. Para ter acesso garantido, use o provedor **Anthropic** com uma chave de API, ou deixe o Claude Code fazer o trabalho como [o seu agente de código](SETUP.pt-BR.md#usar-o-resume-matcher-com-um-agente-de-código). Defina `LLM_PROVIDER=claude_cli`; escolha o modelo em Configurações ou com `LLM_MODEL` (`fable`, `opus`, `sonnet`, `haiku` ou um nome completo `claude-…`). Requer o [Claude Code](https://claude.com/claude-code) instalado e com login feito (`claude auth login`); não disponível dentro das imagens Docker. |
| **Plano do ChatGPT (Sign in with ChatGPT)** | Nuvem | Criado pela comunidade. Usa o [Sign in with ChatGPT for open-source apps](https://developers.openai.com/siwc/token-sharing-open-source) oficial da OpenAI (preview, pode mudar) com ChatGPT Plus ou Pro: escolha **ChatGPT plan** em Configurações e clique em **Continue with ChatGPT**; não precisa de chave de API. As requisições saem da sua máquina para a API Responses da OpenAI e contam para os limites do seu plano (no Plus, o limite de cinco horas é compartilhado com os seus outros apps; o Pro não tem esse limite). Faça o login em um navegador na máquina que executa o backend; a configuração padrão do Docker não consegue concluir o login (veja [SETUP.pt-BR.md](SETUP.pt-BR.md#opção-c-seu-plano-do-chatgpt-sign-in-with-chatgpt)). Para ter acesso garantido, use o provedor **OpenAI** com uma chave de API. Defina `LLM_PROVIDER=chatgpt`. |
| **OpenAI** | Nuvem | GPT-5 Nano, GPT-4o |
| **Anthropic** | Nuvem | Claude Haiku 4.5 |
| **Google Gemini** | Nuvem | Gemini 3 Flash |
| **OpenRouter** | Nuvem | Acesso a vários modelos |
| **DeepSeek** | Nuvem | DeepSeek Chat |
| **Groq** | Nuvem | Llama 3.3 70B, GPT-OSS |

### Deploy com Docker

Imagens Docker oficiais são publicadas para `linux/amd64` e `linux/arm64` em:

- `ghcr.io/srbhr/resume-matcher`
- `srbhr/resume-matcher`

Execute em uma única porta pública (`3000`), com a API disponível em `/api`:

```bash
docker run --name resume-matcher \
  -p 3000:3000 \
  -v resume-data:/app/backend/data \
  ghcr.io/srbhr/resume-matcher:latest
```

Em produção, prefira fixar uma versão, por exemplo `ghcr.io/srbhr/resume-matcher:1.4.0` ou
`ghcr.io/srbhr/resume-matcher:1.4`.

Endpoints:

- App: <http://localhost:3000>
- Verificação de saúde da API: <http://localhost:3000/api/v1/health>
- Documentação da API: <http://localhost:3000/docs>

> **Usando o Ollama com Docker?** Use `http://host.docker.internal:11434` como URL do Ollama em vez de `localhost` (no Linux, o Ollama também precisa escutar além de `127.0.0.1`; veja [SETUP.pt-BR.md](SETUP.pt-BR.md#usar-o-ollama-com-docker)). O Docker publica o app apenas em `127.0.0.1`; para abri-lo de outro dispositivo, veja [SETUP.pt-BR.md](SETUP.pt-BR.md#abrir-de-outro-dispositivo).

### Stack tecnológica

| Componente | Tecnologia |
|-----------|------------|
| Backend | FastAPI, Python 3.13+, LiteLLM |
| Frontend | Next.js 16, React 19, TypeScript |
| Banco de dados | SQLite por padrão, PostgreSQL opcional (SQLAlchemy 2.0) |
| Estilização | Tailwind CSS 4, Swiss International Style |
| PDF | Chromium headless via Playwright |

## Junte-se a nós e contribua

![how to contribute](assets/how_to_contribute.webp)

Contribuições de todos são bem-vindas! Seja você desenvolvedor, designer ou apenas alguém que quer ajudar. Todos os contribuidores estão listados na [página sobre](https://resumematcher.fyi/about/) do nosso site e no README do GitHub aqui.

Confira o roadmap se quiser trabalhar nos recursos planejados para o futuro. Se você tiver sugestões ou pedidos de recursos, fique à vontade para abrir uma issue no GitHub e discutir no nosso servidor do [Discord](https://dsc.gg/resume-matcher).

<a id="contributors"></a>

## Contribuidores

![Contributors](assets/contributors.webp)

<a href="https://github.com/srbhr/Resume-Matcher/graphs/contributors">
  <img src="https://contrib.rocks/image?repo=srbhr/Resume-Matcher" />
</a>

<br/>

<details>
  <summary><kbd>Star History</kbd></summary>
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://star-history.dera.page/svg?repos=srbhr/resume-matcher&theme=dark&type=Date">
    <img width="100%" src="https://star-history.dera.page/svg?repos=srbhr/resume-matcher&theme=dark&type=Date">
  </picture>
</details>

## O Resume Matcher faz parte do [Vercel Open Source Program](https://vercel.com/oss)

![Vercel OSS Program](https://vercel.com/oss/program-badge.svg)
