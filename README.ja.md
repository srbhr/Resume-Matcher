<div align="center">

[![Resume Matcher](assets/header.webp)](https://resumematcher.fyi/)

# Resume Matcher

[English](README.md) | [Español](README.es.md) | [简体中文](README.zh-CN.md) | **日本語**

[𝙹𝚘𝚒𝚗 𝙳𝚒𝚜𝚌𝚘𝚛𝚍](https://dsc.gg/resume-matcher) ✦ [𝚆𝚎𝚋𝚜𝚒𝚝𝚎](https://resumematcher.fyi/) ✦ [𝙷𝚘𝚠 𝚝𝚘 𝙸𝚗𝚜𝚝𝚊𝚕𝚕](https://resumematcher.fyi/docs/installation/) ✦ [𝙲𝚘𝚗𝚝𝚛𝚒𝚋𝚞𝚝𝚘𝚛𝚜](#contributors) ✦ [𝚂𝚙𝚘𝚗𝚜𝚘𝚛](#sponsors) ✦ [𝚃𝚠𝚒𝚝𝚝𝚎𝚛/𝚇](https://twitter.com/srbhr_r) ✦ [𝙻𝚒𝚗𝚔𝚎𝚍𝙸𝚗](https://www.linkedin.com/company/resume-matcher/) ✦ [𝙲𝚛𝚎𝚊𝚝𝚘𝚛](https://srbhr.com)

無料のオープンソース履歴書ビルダー。求人票ごとに履歴書（レジュメ）を最適化します。Claude、ChatGPT、DeepSeek、Kimi、GLM、Gemma などのローカル／リモート LLM に対応した、セルフホスト型の AI ツールです。

![Resume Matcher Demo](assets/Resume_Matcher_Demo_2.gif)

</div>

<br>

<div align="center">

![Stars](https://img.shields.io/github/stars/srbhr/Resume-Matcher?labelColor=F0F0E8&style=for-the-badge&color=1d4ed8)
![Apache 2.0](https://img.shields.io/github/license/srbhr/Resume-Matcher?labelColor=F0F0E8&style=for-the-badge&color=1d4ed8) ![Forks](https://img.shields.io/github/forks/srbhr/Resume-Matcher?labelColor=F0F0E8&style=for-the-badge&color=1d4ed8) ![version](https://img.shields.io/badge/Version-1.3%20Crescendolls%20-FFF?labelColor=F0F0E8&style=for-the-badge&color=1d4ed8)

[![Discord](https://img.shields.io/discord/1122069176962531400?labelColor=F0F0E8&logo=discord&logoColor=1d4ed8&style=for-the-badge&color=1d4ed8)](https://dsc.gg/resume-matcher) [![Website](https://img.shields.io/badge/website-Resume%20Matcher-FFF?labelColor=F0F0E8&style=for-the-badge&color=1d4ed8)](https://resumematcher.fyi/) [![LinkedIn](https://img.shields.io/badge/LinkedIn-Resume%20Matcher-FFF?labelColor=F0F0E8&logo=LinkedIn&style=for-the-badge&color=1d4ed8)](https://www.linkedin.com/company/resume-matcher/)

<a href="https://trendshift.io/repositories/565" target="_blank"><img src="https://trendshift.io/api/badge/repositories/565" alt="srbhr%2FResume-Matcher | Trendshift" style="width: 250px; height: 55px;" width="250" height="55"/></a>

![Vercel OSS Program](https://vercel.com/oss/program-badge.svg)

</div>

> \[!IMPORTANT]
>
> 本プロジェクトには皆さまの支援が必要です。少額でもご寄付いただけると、Resume Matcher の開発と改善を続ける力になります。

<div align="center">

[![Sponsor on GitHub](https://img.shields.io/github/sponsors/srbhr?style=for-the-badge&label=Sponsor&color=1d4ed8&labelColor=F0F0E8&logo=github&logoColor=black)](https://github.com/sponsors/srbhr) [![Buy Me a Coffee](https://img.shields.io/badge/Buy%20Me%20a%20Coffee-ffdd00?style=for-the-badge&logo=buy-me-a-coffee&color=1d4ed8&labelColor=F0F0E8&logoColor=black)](https://www.buymeacoffee.com/srbhr)

**企業としてのスポンサーをご検討ですか？** あなたのロゴを 27k 人超の開発者に届けましょう → **[スポンサーになる ↓](#sponsors)**

</div>

## はじめに

Resume Matcher は、まず「マスター履歴書」を作り、それを各求人応募向けに調整する形で動作します。インストール手順は：[インストール方法](#how-to-install)

### 仕組み

1. **アップロード**：マスター履歴書（PDF / DOCX）
2. **貼り付け**：応募先の求人票（Job Description）
3. **確認**：AI が生成した改善案と最適化内容
4. **生成**：求人向けのカバーレターとメール文面
5. **調整**：レイアウトやセクションを好みに合わせてカスタマイズ
6. **書き出し**：好みのテンプレートで PDF を出力

### ソフトウェアエンジニアのために

Resume Matcher のインストールにはターミナルが必要なので、使っている人の多くはソフトウェアを書く人です。普段の開発スタイルにそのまま馴染みます：

- **自分のマシンで動く。** FastAPI のバックエンド、Next.js のフロントエンド、SQLite ファイルだけです。リポジトリをクローンするか、Docker コンテナを 1 つ起動します。アカウント登録は不要で、履歴書は自分のデータベースに保存されます。
- **モデルは自分で選ぶ。** OpenAI、Anthropic、Gemini、DeepSeek、OpenRouter、Groq の API キーを使うか、Ollama でローカルモデルを動かせば、履歴書がマシンの外に出ることはありません。
- **Claude Code から操作できる。** [MCP サーバー](SETUP.ja.md#claude-code--claude-desktop-から-resume-matcher-を使うmcp)を使えば、Claude Code、Cursor、Codex が最適化した履歴書を書き、Resume Matcher が保存・チェック・レンダリングを担当します。LLM の API キーは不要です。
- **実際の経歴だけを使う。** 最適化用のプロンプトは、マスター履歴書にないスキル、ツール、会社名、数値の追加を禁止しています。
- **スコアは読めるコード。** ATS スコア（[`services/ats.py`](apps/backend/app/services/ats.py)）と ATS チェック（[`services/ats_parse/`](apps/backend/app/services/ats_parse/)）は LLM を呼び出しません。ATS チェックは pdfminer で PDF を読み取り、応募者追跡システム（ATS）が抽出する内容を表示します。
- **エンジニアらしいテンプレート。** 1 カラム・2 カラムに加えて、Deedy、Modern Deedy、LaTeX 風のレイアウトがあります。うち 7 つのデザインは、Overleaf で編集できる pdfLaTeX プロジェクトとして [resume-matcher-templates](https://github.com/resume-matcher/resume-matcher-templates) でも公開しています。

### コミュニティ

[![Discord](assets/resume_matcher_discord.webp)](https://dsc.gg/resume-matcher)

ディスカッション、要望、サポートは [Discord](https://dsc.gg/resume-matcher) へ。

[![LinkedIn](assets/resume_matcher_linkedin.webp)](https://www.linkedin.com/company/resume-matcher/)

最新情報は [LinkedIn](https://www.linkedin.com/company/resume-matcher/) でも発信しています。

![Star Resume Matcher](assets/star_resume_matcher.webp)

Star を付けていただけると開発の励みになります（リリース通知も受け取れます）。

<a id="sponsors"></a>

## スポンサー

![sponsors](assets/sponsors.webp)

Resume Matcher は無料かつオープンソースで、スポンサーと支援者の皆さまによって支えられています。役立つと感じたら、開発の支援をご検討ください。

### Resume Matcher を支える企業

企業ティアでスポンサーになると、**あなたのロゴ・リンク・紹介文がここに掲載されます** —— **27k 超の Star と 4.9k の Fork** を持つコミュニティに向けて。[Trendshift](https://trendshift.io/repositories/565) や [Vercel OSS プログラム](https://vercel.com/oss) にも掲載されています。

| Sponsor | Description |
|---------|-------------|
| [APIDECK](https://apideck.com?utm_source=resumematcher&utm_medium=github&utm_campaign=sponsors) | アプリを200以上のSaaSプラットフォーム（会計、HRIS、CRM、ファイルストレージ）に接続する単一のAPI。50回ではなく、1回の構築で統合を実現します。 🌐 [apideck.com](https://apideck.com?utm_source=resumematcher&utm_medium=github&utm_campaign=sponsors) |
| [Vercel](https://vercel.com?utm_source=resumematcher&utm_medium=github&utm_campaign=sponsors) | Resume Matcher は Vercel OSS // Summer 2025 プログラムの一部です 🌐 [vercel.com](https://vercel.com?utm_source=resumematcher&utm_medium=github&utm_campaign=sponsors) |
| [Cubic.dev](https://cubic.dev?utm_source=resumematcher&utm_medium=github&utm_campaign=sponsors) | Cubic は Resume Matcher に PR レビューを提供しています 🌐 [cubic.dev](https://cubic.dev?utm_source=resumematcher&utm_medium=github&utm_campaign=sponsors) |
| [Kilo Code](https://kilo.ai?utm_source=resumematcher&utm_medium=github&utm_campaign=sponsors) | Kilo Code は Resume Matcher に AI コードレビューとコーディングクレジットを提供しています 🌐 [kilo.ai](https://kilo.ai?utm_source=resumematcher&utm_medium=github&utm_campaign=sponsors) |
| [ZanReal](https://zanreal.com/?utm_source=resumematcher&utm_medium=github&utm_campaign=sponsors) | ZanReal は AI 駆動の開発企業で、戦略・UX から DevOps まで、スケーラブルなクラウドソリューションを構築し、チームがより速くリリースしアイデアを本番へと導く支援をしています。 🌐 [zanreal.com](https://zanreal.com/?utm_source=resumematcher&utm_medium=github&utm_campaign=sponsors) |
| **✦ あなたの企業のロゴをここに** | 27k 超の開発者と 4.9k の Fork にリーチ。**[スポンサーになる →](https://github.com/sponsors/srbhr)** |

スポンサーシップがプロジェクトにどのように役立つかについての詳細は、[Sponsorship Guide](https://resumematcher.fyi/docs/sponsoring/) をご覧ください。ReadME およびウェブサイトにて特別に感謝の意を表します。

<a id="support-the-development-by-donating"></a>

### 個人として支援する

![donate](assets/supporting_resume_matcher.webp)

少額の支援でも Resume Matcher を無料に保ち、新機能の開発を支えます —— ReadME とウェブサイトにて感謝の意をお伝えします。

| プラットフォーム | リンク |
|------------------|--------|
| GitHub | [![GitHub Sponsors](https://img.shields.io/github/sponsors/srbhr?style=for-the-badge&color=1d4ed8&labelColor=F0F0E8&logo=github&logoColor=black)](https://github.com/sponsors/srbhr) |
| Buy Me a Coffee | [![BuyMeACoffee](https://img.shields.io/badge/Buy%20Me%20a%20Coffee-ffdd00?style=for-the-badge&logo=buy-me-a-coffee&color=1d4ed8&labelColor=F0F0E8&logoColor=black)](https://www.buymeacoffee.com/srbhr) |

## 制作者ノート

Resume Matcher をご覧いただきありがとうございます。つながりやコラボレーション、あるいは挨拶だけでも、お気軽にご連絡ください！
~ **Saurabh Rai** ✨

以下でフォローできます：

- Website: [https://srbhr.com](https://srbhr.com)
- Linkedin: [https://www.linkedin.com/in/srbhr/](https://www.linkedin.com/in/srbhr/)
- Twitter: [https://twitter.com/srbhr_r](https://twitter.com/srbhr_r)
- GitHub: [https://github.com/srbhr](https://github.com/srbhr)

## 主な機能

![resume_matcher_features](assets/features.webp)

### コア機能

**マスター履歴書（Master Resume）**：既存の履歴書から、再利用できる包括的なマスター履歴書を作成します。

![Dashboard with a master resume and seven tailored resumes](assets/step_2.webp)

### 履歴書ビルダー

![Resume Builder with the template picker and a live preview of a software engineer resume](assets/step_5.webp)

求人票を貼り付けると、その職種に合わせた AI 提案の履歴書を生成します。

できること：

- 提案内容の編集
- セクションの追加/削除
- ドラッグ＆ドロップで順序変更
- 複数テンプレートから選択

### カバーレター＆メール生成

求人票と履歴書に基づき、カスタマイズされたカバーレターとメール文面を生成します。

![Cover letter editor next to its PDF preview](assets/cover_letter.webp)

### ATS スコア・ATS チェック・キーワードハイライト

「JD一致」タブでは、求人票と履歴書を並べて共通のキーワードをハイライトし、100 点満点の **ATS スコア**を表示します。内訳はキーワード一致（40%）、スキルの網羅（20%）、職種名の一致（15%）、セクションの充足（15%）、日付形式の一貫性（10%）です。不足しているキーワードと、マスター履歴書にすでにあるキーワードも一覧にするので、後者は事実を足さずに追加できます。

「ATSチェック」タブは PDF を生成し、応募者追跡システム（ATS）のテキスト抽出と同じように文字を読み戻して、読み取りやすさ、読み順、連絡先、セクション見出しを報告します。どちらも普通のコードで動きます。計算式は [What is an ATS score?](https://resumematcher.fyi/blog/what-is-an-ats-score/)（英語）で説明しています。

![JD Match tab with the ATS score breakdown and matching keywords highlighted](assets/keyword_highlighter.webp)

### PDF 出力

最適化した履歴書とカバーレターを PDF として出力できます。

### テンプレート

どのテンプレートも、テキストを含む PDF（A4 または US Letter）として書き出すので、応募者追跡システム（ATS）で読み取れます。

| テンプレート名 | プレビュー | 説明 |
|---------------|-----------|------|
| **1カラム** | ![1カラム](assets/pdf-templates/single-column.webp) | 内容密度が高い伝統的な全幅レイアウト。[PDF を見る](assets/pdf-templates/single-column.pdf) |
| **2カラム** | ![2カラム](assets/pdf-templates/two-column.webp) | 経験中心のメイン列とスキル用サイドバー。[PDF を見る](assets/pdf-templates/two-column.pdf) |
| **モダン** | ![モダン](assets/pdf-templates/modern-single-column.webp) | カラフルなアクセントとテーマ色のカスタマイズ。[PDF を見る](assets/pdf-templates/modern-single-column.pdf) |
| **モダン2カラム** | ![モダン2カラム](assets/pdf-templates/modern-two-column.webp) | モダンな2カラムとカラフルなアクセント。[PDF を見る](assets/pdf-templates/modern-two-column.pdf) |
| **LaTeX** | ![LaTeX](assets/pdf-templates/latex.webp) | 罫線付き見出しのクラシックなセリフ体レイアウト。[PDF を見る](assets/pdf-templates/latex.pdf) |
| **クリーン** | ![クリーン](assets/pdf-templates/clean.webp) | 大きく控えめな見出しのミニマルなサンセリフ体レイアウト。[PDF を見る](assets/pdf-templates/clean.pdf) |
| **ビビッド** | ![ビビッド](assets/pdf-templates/vivid.webp) | アクセント見出しと矢印箇条書きのカラフルな2カラムレイアウト。[PDF を見る](assets/pdf-templates/vivid.pdf) |
| **ビビッド1カラム** | ![ビビッド1カラム](assets/pdf-templates/vivid-single.webp) | アクセント見出しと矢印箇条書きのカラフルな1カラムレイアウト。[PDF を見る](assets/pdf-templates/vivid-single.pdf) |
| **Modern Deedy** | ![Modern Deedy](assets/pdf-templates/modern-deedy.webp) | Lato書体の1ページ向け高密度レイアウト。見出しは淡いグレーの大文字。[PDF を見る](assets/pdf-templates/modern-deedy.pdf) |
| **Deedy** | ![Deedy](assets/pdf-templates/deedy.webp) | 細字の名前、狭い左カラム、薄いグレーの見出しを備えた2カラムレイアウト。[PDF を見る](assets/pdf-templates/deedy.pdf) |

### 国際化

- **多言語 UI**：英語・スペイン語・中国語・日本語・ポルトガル語（ブラジル）・フランス語・韓国語に対応
- **多言語コンテンツ**：希望言語で履歴書とカバーレターを生成

### ロードマップ

提案や機能要望があれば、GitHub に Issue を立てるか、[Discord](https://dsc.gg/resume-matcher) でご相談ください。

- キーワードの視覚的ハイライト
- 定量的でインパクトのある内容を作る AI Canvas
- 複数求人票の同時最適化

## ソフトウェアエンジニア向け履歴書ガイド

[Resume Matcher ブログ](https://resumematcher.fyi/blog/)（英語）では、初めてのインターン応募から FAANG への応募まで、開発者向けの履歴書ガイドを公開しています：

- [Software engineer resume](https://resumematcher.fyi/blog/software-engineer-resume/)：1 ページのテンプレート、注釈付きの例 2 つ、セクションごとの書き方
- [Computer science resume](https://resumematcher.fyi/blog/computer-science-resume/)：学生・新卒向け。プロジェクトとインターン経験で書く履歴書
- [FAANG resume](https://resumematcher.fyi/blog/faang-resume/)：Google、Meta、Amazon が自社の採用ページで挙げている選考基準
- [LaTeX resume](https://resumematcher.fyi/blog/latex-resume/)：Jake's、sb2nov、Awesome-CV、Overleaf、そしてパーサーが PDF をどう読むか
- [Open source resume builders](https://resumematcher.fyi/blog/open-source-resume-builders/)：Reactive Resume、RenderCV、YAMLResume、Awesome-CV などの比較
- [Master resume](https://resumematcher.fyi/blog/master-resume/)：すべての応募のもとになる、完全版の履歴書
- [Tailor your resume to a job description](https://resumematcher.fyi/blog/how-to-match-your-resume-to-a-job-description/)：求人票に合わせて最適化する手順
- [Private AI resume tailoring with Ollama](https://resumematcher.fyi/blog/local-ai-resume-tailoring-ollama/)：履歴書を自分のマシンから出さずに最適化する
- [What is an ATS score?](https://resumematcher.fyi/blog/what-is-an-ats-score/)：履歴書チェッカーのスコアの計算方法と Resume Matcher の計算式
- [ChatGPT prompts for resume tailoring](https://resumematcher.fyi/blog/tailor-resume-with-chatgpt-claude/)：経歴を捏造しない ChatGPT・Claude 用プロンプト

<a id="how-to-install"></a>

## インストール方法

![Installation](assets/how_to_install_resumematcher.webp)

詳細なセットアップ手順は **[SETUP.ja.md](SETUP.ja.md)** を参照してください（[English](SETUP.md) / [Español](SETUP.es.md) / [简体中文](SETUP.zh-CN.md) も利用できます）。

### 前提条件

| ツール | バージョン | インストール |
|--------|------------|--------------|
| Python | 3.13+ | [python.org](https://python.org) |
| Node.js | 24+ | [nodejs.org](https://nodejs.org) |
| uv | 最新 | [astral.sh/uv](https://docs.astral.sh/uv/getting-started/installation/) |

### クイックスタート

MacOS / WSL / Ubuntu で最も手早い手順：

```bash
# リポジトリをクローン
git clone https://github.com/srbhr/Resume-Matcher.git
cd Resume-Matcher

# バックエンド（ターミナル 1）
cd apps/backend
cp .env.example .env        # AI プロバイダを設定
uv sync                      # 依存関係をインストール
uv run app

# フロントエンド（ターミナル 2）
cd apps/frontend
npm install
npm run dev
```

**<http://localhost:3000>** を開き、Settings で AI プロバイダを設定してください。

### 対応 AI プロバイダ

| プロバイダ | ローカル/クラウド | 備考 |
|------------|-------------------|------|
| **Ollama** | ローカル | 無料。手元のマシンで動作 |
| **OpenAI** | クラウド | GPT-4o、GPT-4o-mini |
| **Anthropic** | クラウド | Claude 3.5 Sonnet |
| **Google Gemini** | クラウド | Gemini 1.5 Flash/Pro |
| **OpenRouter** | クラウド | 複数モデルへアクセス |
| **DeepSeek** | クラウド | DeepSeek Chat |

### Docker デプロイ

```bash
docker pull srbhr/resume-matcher:latest

docker run srbhr/resume-matcher:latest
```

<!-- 注：Docker ドキュメントは準備中です。現在は docker-compose.yml を参照してください -->

> **Docker で Ollama を使う場合**：Ollama の URL は `localhost` ではなく `http://host.docker.internal:11434` を指定します。

### 技術スタック

| コンポーネント | 技術 |
|----------------|------|
| バックエンド | FastAPI、Python 3.13+、LiteLLM |
| フロントエンド | Next.js 15、React 19、TypeScript |
| データベース | TinyDB（JSON ファイル保存） |
| スタイリング | Tailwind CSS 4、Swiss International Style |
| PDF | Playwright による Headless Chromium |

## 参加・コントリビュート

![how to contribute](assets/how_to_contribute.webp)

どなたでもコントリビュート歓迎です。開発者・デザイナー・ユーザーを問わず、協力してくれる方を募集しています。コントリビューター一覧は、公式サイトの [about ページ](https://resumematcher.fyi/about/) と GitHub README に掲載されています。

ロードマップも参考にしてください。提案や機能要望があれば、GitHub で Issue を作成し、[Discord](https://dsc.gg/resume-matcher) でも議論できます。

<a id="contributors"></a>

## コントリビューター

![Contributors](assets/contributors.webp)

<a href="https://github.com/srbhr/Resume-Matcher/graphs/contributors">
  <img src="https://contrib.rocks/image?repo=srbhr/Resume-Matcher" />
</a>

<br/>

<details>
  <summary><kbd>Star の推移</kbd></summary>
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://star-history.dera.page/svg?repos=srbhr/resume-matcher&theme=dark&type=Date">
    <img width="100%" src="https://star-history.dera.page/svg?repos=srbhr/resume-matcher&theme=dark&type=Date">
  </picture>
</details>

## Resume Matcher は [Vercel Open Source Program](https://vercel.com/oss) の一部です

![Vercel OSS Program](https://vercel.com/oss/program-badge.svg)
