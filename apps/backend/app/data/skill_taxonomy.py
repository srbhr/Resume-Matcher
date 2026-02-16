"""Skill synonym taxonomy for ATS keyword matching.

Maps canonical skill names to sets of lowercase aliases so that different
spellings and abbreviations of the same technology are treated as equivalent
(e.g. "React.js" == "ReactJS" == "React").

Usage:
    from app.data.skill_taxonomy import ALIAS_TO_CANONICAL

    canonical = ALIAS_TO_CANONICAL.get(token.lower())
"""

# ---------------------------------------------------------------------------
# Canonical name -> set of known lowercase spellings / abbreviations
# ---------------------------------------------------------------------------

SKILL_SYNONYMS: dict[str, set[str]] = {
    # ------------------------------------------------------------------
    # JavaScript / TypeScript ecosystem
    # ------------------------------------------------------------------
    "javascript": {"javascript", "js", "ecmascript", "es6", "es2015", "es2016", "es2017", "es2020", "es2021", "es2022", "es2023", "vanilla js"},
    "typescript": {"typescript", "ts"},
    "react": {"react", "react.js", "reactjs", "react js"},
    "react native": {"react native", "react-native", "reactnative", "rn"},
    "next.js": {"next.js", "nextjs", "next js", "next"},
    "vue": {"vue", "vue.js", "vuejs", "vue js"},
    "nuxt": {"nuxt", "nuxt.js", "nuxtjs", "nuxt js"},
    "angular": {"angular", "angular.js", "angularjs", "angular js", "ng"},
    "svelte": {"svelte", "sveltejs", "svelte.js"},
    "sveltekit": {"sveltekit", "svelte kit", "svelte-kit"},
    "node.js": {"node.js", "nodejs", "node js", "node"},
    "express": {"express", "express.js", "expressjs"},
    "nest.js": {"nest.js", "nestjs", "nest js", "nest"},
    "deno": {"deno"},
    "bun": {"bun"},
    "jquery": {"jquery", "j query"},
    "redux": {"redux", "redux toolkit", "rtk"},
    "mobx": {"mobx", "mob x"},
    "zustand": {"zustand"},
    "webpack": {"webpack"},
    "vite": {"vite", "vitejs"},
    "esbuild": {"esbuild"},
    "rollup": {"rollup", "rollup.js", "rollupjs"},
    "babel": {"babel", "babeljs", "babel.js"},
    "eslint": {"eslint"},
    "prettier": {"prettier"},
    "storybook": {"storybook"},
    "gatsby": {"gatsby", "gatsbyjs", "gatsby.js"},
    "remix": {"remix", "remix.run"},
    "astro": {"astro", "astro.build"},
    "electron": {"electron", "electronjs", "electron.js"},
    "npm": {"npm"},
    "yarn": {"yarn"},
    "pnpm": {"pnpm"},

    # ------------------------------------------------------------------
    # Python ecosystem
    # ------------------------------------------------------------------
    "python": {"python", "py", "python3", "python 3", "cpython"},
    "django": {"django"},
    "flask": {"flask"},
    "fastapi": {"fastapi", "fast api", "fast-api"},
    "sqlalchemy": {"sqlalchemy", "sql alchemy"},
    "celery": {"celery"},
    "pydantic": {"pydantic"},
    "poetry": {"poetry"},
    "pip": {"pip", "pip3"},
    "conda": {"conda", "anaconda", "miniconda"},
    "numpy": {"numpy", "np"},
    "pandas": {"pandas", "pd"},
    "scipy": {"scipy"},
    "matplotlib": {"matplotlib", "mpl"},
    "seaborn": {"seaborn", "sns"},
    "plotly": {"plotly"},
    "streamlit": {"streamlit"},
    "jupyter": {"jupyter", "jupyter notebook", "jupyter notebooks", "jupyter lab", "jupyterlab"},
    "pytest": {"pytest", "py.test"},
    "unittest": {"unittest"},
    "scrapy": {"scrapy"},
    "beautifulsoup": {"beautifulsoup", "beautiful soup", "bs4", "beautifulsoup4"},
    "asyncio": {"asyncio", "async io"},

    # ------------------------------------------------------------------
    # Java / JVM
    # ------------------------------------------------------------------
    "java": {"java", "jdk", "jre", "j2ee", "jee", "java ee", "jakarta ee"},
    "spring": {"spring", "spring framework"},
    "spring boot": {"spring boot", "springboot", "spring-boot"},
    "kotlin": {"kotlin", "kt"},
    "scala": {"scala"},
    "groovy": {"groovy"},
    "gradle": {"gradle"},
    "maven": {"maven", "mvn", "apache maven"},
    "hibernate": {"hibernate", "hql"},
    "apache kafka": {"apache kafka", "kafka"},
    "apache spark": {"apache spark", "spark", "pyspark"},

    # ------------------------------------------------------------------
    # .NET / C#
    # ------------------------------------------------------------------
    "c#": {"c#", "csharp", "c sharp", "c-sharp"},
    ".net": {".net", "dotnet", "dot net", ".net core", "dotnet core", ".net framework"},
    "asp.net": {"asp.net", "aspnet", "asp net", "asp.net core", "aspnet core"},
    "blazor": {"blazor"},
    "entity framework": {"entity framework", "ef", "ef core", "entity framework core"},
    "nuget": {"nuget"},
    "f#": {"f#", "fsharp", "f sharp"},
    "visual basic": {"visual basic", "vb", "vb.net", "vbnet"},
    "xamarin": {"xamarin"},
    "maui": {"maui", ".net maui", "dotnet maui"},

    # ------------------------------------------------------------------
    # Systems languages
    # ------------------------------------------------------------------
    "rust": {"rust", "rustlang", "rust-lang"},
    "go": {"go", "golang", "go lang"},
    "c": {"c", "c language", "ansi c"},
    "c++": {"c++", "cpp", "cplusplus", "c plus plus"},
    "zig": {"zig"},
    "assembly": {"assembly", "asm", "x86", "x86_64", "arm assembly"},

    # ------------------------------------------------------------------
    # Mobile development
    # ------------------------------------------------------------------
    "swift": {"swift", "swiftui"},
    "objective-c": {"objective-c", "objc", "obj-c", "objective c"},
    "ios": {"ios", "ios development"},
    "android": {"android", "android development"},
    "flutter": {"flutter"},
    "dart": {"dart", "dartlang"},
    "kotlin multiplatform": {"kotlin multiplatform", "kmp", "kmm", "kotlin multiplatform mobile"},
    "capacitor": {"capacitor", "capacitorjs"},
    "ionic": {"ionic", "ionic framework"},

    # ------------------------------------------------------------------
    # Databases
    # ------------------------------------------------------------------
    "postgresql": {"postgresql", "postgres", "pg", "psql"},
    "mysql": {"mysql", "my sql"},
    "mariadb": {"mariadb", "maria db"},
    "sql server": {"sql server", "mssql", "ms sql", "microsoft sql server", "tsql", "t-sql"},
    "oracle database": {"oracle database", "oracle db", "oracle", "pl/sql", "plsql"},
    "sqlite": {"sqlite", "sqlite3"},
    "mongodb": {"mongodb", "mongo", "mongo db"},
    "redis": {"redis"},
    "elasticsearch": {"elasticsearch", "elastic search", "elastic", "es"},
    "cassandra": {"cassandra", "apache cassandra"},
    "dynamodb": {"dynamodb", "dynamo db", "amazon dynamodb", "aws dynamodb", "dynamo"},
    "couchdb": {"couchdb", "couch db", "apache couchdb"},
    "neo4j": {"neo4j", "neo 4j"},
    "firebase": {"firebase", "firebase realtime database", "firestore", "cloud firestore"},
    "supabase": {"supabase"},
    "prisma": {"prisma", "prisma orm"},
    "drizzle": {"drizzle", "drizzle orm"},
    "typeorm": {"typeorm", "type orm"},
    "sequelize": {"sequelize"},
    "sql": {"sql", "structured query language"},

    # ------------------------------------------------------------------
    # Cloud platforms - AWS
    # ------------------------------------------------------------------
    "aws": {"aws", "amazon web services"},
    "aws ec2": {"aws ec2", "ec2", "amazon ec2", "elastic compute cloud"},
    "aws s3": {"aws s3", "s3", "amazon s3", "simple storage service"},
    "aws lambda": {"aws lambda", "lambda", "amazon lambda"},
    "aws ecs": {"aws ecs", "ecs", "elastic container service"},
    "aws eks": {"aws eks", "eks", "elastic kubernetes service"},
    "aws rds": {"aws rds", "rds", "relational database service"},
    "aws cloudformation": {"aws cloudformation", "cloudformation", "cfn"},
    "aws sqs": {"aws sqs", "sqs", "simple queue service", "amazon sqs"},
    "aws sns": {"aws sns", "sns", "simple notification service"},
    "aws cloudwatch": {"aws cloudwatch", "cloudwatch"},
    "aws iam": {"aws iam", "iam"},
    "aws api gateway": {"aws api gateway", "api gateway", "amazon api gateway"},
    "aws step functions": {"aws step functions", "step functions"},
    "aws cdk": {"aws cdk", "cdk", "cloud development kit"},
    "aws fargate": {"aws fargate", "fargate"},
    "aws cognito": {"aws cognito", "cognito"},
    "aws sagemaker": {"aws sagemaker", "sagemaker"},

    # ------------------------------------------------------------------
    # Cloud platforms - Azure
    # ------------------------------------------------------------------
    "azure": {"azure", "microsoft azure", "ms azure"},
    "azure devops": {"azure devops", "ado", "azure devops services"},
    "azure functions": {"azure functions"},
    "azure app service": {"azure app service", "app service"},
    "azure kubernetes service": {"azure kubernetes service", "aks"},
    "azure cosmos db": {"azure cosmos db", "cosmos db", "cosmosdb"},
    "azure blob storage": {"azure blob storage", "blob storage"},
    "azure active directory": {"azure active directory", "azure ad", "aad", "entra id", "microsoft entra"},
    "azure pipelines": {"azure pipelines"},

    # ------------------------------------------------------------------
    # Cloud platforms - GCP
    # ------------------------------------------------------------------
    "google cloud": {"google cloud", "gcp", "google cloud platform"},
    "google cloud functions": {"google cloud functions", "cloud functions", "gcf"},
    "google cloud run": {"google cloud run", "cloud run"},
    "google cloud storage": {"google cloud storage", "gcs", "cloud storage"},
    "google kubernetes engine": {"google kubernetes engine", "gke"},
    "bigquery": {"bigquery", "big query", "google bigquery"},
    "google cloud pub/sub": {"google cloud pub/sub", "pub/sub", "pubsub", "cloud pub/sub"},
    "google cloud dataflow": {"google cloud dataflow", "dataflow"},
    "google cloud spanner": {"google cloud spanner", "cloud spanner", "spanner"},

    # ------------------------------------------------------------------
    # DevOps / CI-CD
    # ------------------------------------------------------------------
    "docker": {"docker", "dockerfile", "docker-compose", "docker compose"},
    "kubernetes": {"kubernetes", "k8s", "kube"},
    "helm": {"helm", "helm charts"},
    "terraform": {"terraform", "hcl"},
    "ansible": {"ansible"},
    "puppet": {"puppet"},
    "chef": {"chef"},
    "jenkins": {"jenkins"},
    "github actions": {"github actions", "gh actions", "gha"},
    "gitlab ci": {"gitlab ci", "gitlab-ci", "gitlab ci/cd", "gitlab cicd"},
    "circleci": {"circleci", "circle ci", "circle-ci"},
    "travis ci": {"travis ci", "travis-ci", "travisci"},
    "argo cd": {"argo cd", "argocd", "argo-cd"},
    "nginx": {"nginx", "engine x"},
    "apache": {"apache", "apache httpd", "httpd", "apache2"},
    "prometheus": {"prometheus"},
    "grafana": {"grafana"},
    "datadog": {"datadog", "data dog"},
    "new relic": {"new relic", "newrelic"},
    "splunk": {"splunk"},
    "vault": {"vault", "hashicorp vault"},
    "consul": {"consul", "hashicorp consul"},
    "pulumi": {"pulumi"},
    "packer": {"packer", "hashicorp packer"},
    "vagrant": {"vagrant"},

    # ------------------------------------------------------------------
    # Version control
    # ------------------------------------------------------------------
    "git": {"git"},
    "github": {"github", "gh"},
    "gitlab": {"gitlab"},
    "bitbucket": {"bitbucket", "bit bucket"},
    "svn": {"svn", "subversion", "apache subversion"},
    "mercurial": {"mercurial", "hg"},

    # ------------------------------------------------------------------
    # Data / ML / AI
    # ------------------------------------------------------------------
    "machine learning": {"machine learning", "ml"},
    "deep learning": {"deep learning", "dl"},
    "artificial intelligence": {"artificial intelligence", "ai"},
    "natural language processing": {"natural language processing", "nlp"},
    "computer vision": {"computer vision", "cv"},
    "tensorflow": {"tensorflow", "tensor flow"},
    "pytorch": {"pytorch", "torch", "py torch"},
    "keras": {"keras"},
    "scikit-learn": {"scikit-learn", "sklearn", "scikit learn", "sk-learn"},
    "xgboost": {"xgboost", "xg boost"},
    "lightgbm": {"lightgbm", "light gbm", "lgbm"},
    "hugging face": {"hugging face", "huggingface", "hf"},
    "openai api": {"openai api", "openai", "open ai"},
    "langchain": {"langchain", "lang chain"},
    "llama": {"llama", "llama 2", "llama2", "llama 3", "llama3"},
    "rag": {"rag", "retrieval augmented generation"},
    "mlflow": {"mlflow", "ml flow"},
    "kubeflow": {"kubeflow", "kube flow"},
    "apache airflow": {"apache airflow", "airflow"},
    "dbt": {"dbt", "data build tool"},
    "snowflake": {"snowflake"},
    "databricks": {"databricks"},
    "tableau": {"tableau"},
    "power bi": {"power bi", "powerbi", "power-bi"},
    "looker": {"looker"},
    "r": {"r", "r language", "r programming", "rlang"},
    "matlab": {"matlab"},
    "sas": {"sas"},
    "spss": {"spss"},
    "opencv": {"opencv", "open cv"},

    # ------------------------------------------------------------------
    # Testing frameworks
    # ------------------------------------------------------------------
    "jest": {"jest"},
    "vitest": {"vitest"},
    "mocha": {"mocha", "mocha.js", "mochajs"},
    "chai": {"chai"},
    "cypress": {"cypress", "cypress.io"},
    "playwright": {"playwright"},
    "selenium": {"selenium", "selenium webdriver"},
    "puppeteer": {"puppeteer"},
    "testing library": {"testing library", "react testing library", "rtl", "@testing-library"},
    "junit": {"junit", "junit5", "junit 5"},
    "testng": {"testng", "test ng"},
    "nunit": {"nunit"},
    "xunit": {"xunit"},
    "rspec": {"rspec"},
    "minitest": {"minitest", "mini test"},
    "phpunit": {"phpunit"},
    "postman": {"postman"},
    "insomnia": {"insomnia"},

    # ------------------------------------------------------------------
    # API protocols and formats
    # ------------------------------------------------------------------
    "rest": {"rest", "restful", "rest api", "restful api"},
    "graphql": {"graphql", "gql", "graph ql"},
    "grpc": {"grpc", "g-rpc"},
    "websocket": {"websocket", "websockets", "ws", "wss"},
    "soap": {"soap"},
    "openapi": {"openapi", "open api", "swagger", "openapi spec"},
    "protobuf": {"protobuf", "protocol buffers", "proto"},
    "json": {"json"},
    "xml": {"xml"},
    "yaml": {"yaml", "yml"},
    "trpc": {"trpc", "t-rpc"},

    # ------------------------------------------------------------------
    # Frontend / CSS
    # ------------------------------------------------------------------
    "html": {"html", "html5", "html 5"},
    "css": {"css", "css3", "css 3"},
    "sass": {"sass", "scss"},
    "less": {"less", "less css", "lesscss"},
    "tailwind css": {"tailwind css", "tailwindcss", "tailwind"},
    "bootstrap": {"bootstrap", "bootstrap 5", "bootstrap5"},
    "material ui": {"material ui", "mui", "material-ui", "material design"},
    "chakra ui": {"chakra ui", "chakra-ui", "chakra"},
    "ant design": {"ant design", "antd", "ant-design"},
    "styled-components": {"styled-components", "styled components", "sc"},
    "css modules": {"css modules", "css-modules"},
    "responsive design": {"responsive design", "rwd", "responsive web design"},
    "accessibility": {"accessibility", "a11y", "wcag", "aria"},
    "figma": {"figma"},
    "sketch": {"sketch"},
    "adobe xd": {"adobe xd", "xd"},
    "framer motion": {"framer motion", "framer-motion"},
    "three.js": {"three.js", "threejs", "three js"},
    "d3": {"d3", "d3.js", "d3js"},
    "webgl": {"webgl"},

    # ------------------------------------------------------------------
    # Other languages
    # ------------------------------------------------------------------
    "ruby": {"ruby", "rb"},
    "ruby on rails": {"ruby on rails", "rails", "ror"},
    "php": {"php"},
    "laravel": {"laravel"},
    "wordpress": {"wordpress", "wp"},
    "perl": {"perl"},
    "lua": {"lua"},
    "haskell": {"haskell"},
    "elixir": {"elixir"},
    "phoenix": {"phoenix", "phoenix framework"},
    "erlang": {"erlang", "otp"},
    "clojure": {"clojure", "clj"},
    "ocaml": {"ocaml"},
    "solidity": {"solidity", "sol"},

    # ------------------------------------------------------------------
    # Methodologies / practices
    # ------------------------------------------------------------------
    "agile": {"agile", "agile methodology"},
    "scrum": {"scrum"},
    "kanban": {"kanban"},
    "ci/cd": {"ci/cd", "cicd", "ci cd", "ci-cd", "continuous integration", "continuous delivery", "continuous deployment"},
    "devops": {"devops", "dev ops", "dev-ops"},
    "tdd": {"tdd", "test driven development", "test-driven development"},
    "bdd": {"bdd", "behavior driven development", "behaviour driven development"},
    "pair programming": {"pair programming", "pairing"},
    "code review": {"code review", "code reviews", "peer review"},
    "microservices": {"microservices", "micro services", "micro-services"},
    "monorepo": {"monorepo", "mono repo", "mono-repo"},
    "soa": {"soa", "service oriented architecture", "service-oriented architecture"},
    "domain-driven design": {"domain-driven design", "ddd", "domain driven design"},
    "event-driven architecture": {"event-driven architecture", "eda", "event driven architecture", "event driven"},
    "serverless": {"serverless", "server-less", "faas", "function as a service"},
    "infrastructure as code": {"infrastructure as code", "iac"},
    "gitops": {"gitops", "git ops"},
    "site reliability engineering": {"site reliability engineering", "sre"},
    "twelve-factor app": {"twelve-factor app", "12-factor", "twelve factor", "12 factor"},
    "design patterns": {"design patterns", "gang of four", "gof"},
    "clean architecture": {"clean architecture"},
    "solid principles": {"solid principles", "solid"},
    "dry": {"dry", "don't repeat yourself"},
    "oop": {"oop", "object oriented programming", "object-oriented programming"},
    "functional programming": {"functional programming", "fp"},

    # ------------------------------------------------------------------
    # Security
    # ------------------------------------------------------------------
    "oauth": {"oauth", "oauth2", "oauth 2.0", "oauth2.0"},
    "jwt": {"jwt", "json web token", "json web tokens"},
    "saml": {"saml", "saml 2.0"},
    "openid connect": {"openid connect", "oidc"},
    "ssl/tls": {"ssl/tls", "ssl", "tls", "https"},
    "owasp": {"owasp", "owasp top 10"},
    "penetration testing": {"penetration testing", "pen testing", "pentest", "pen test"},
    "soc 2": {"soc 2", "soc2", "soc ii"},
    "encryption": {"encryption", "aes", "rsa"},
    "snyk": {"snyk"},
    "sonarqube": {"sonarqube", "sonar qube", "sonar"},
    "devsecops": {"devsecops", "dev sec ops"},
    "sso": {"sso", "single sign-on", "single sign on"},
    "mfa": {"mfa", "multi-factor authentication", "2fa", "two-factor authentication"},
    "cors": {"cors", "cross-origin resource sharing"},
    "csrf": {"csrf", "xsrf", "cross-site request forgery"},
    "xss": {"xss", "cross-site scripting"},

    # ------------------------------------------------------------------
    # Message brokers / streaming
    # ------------------------------------------------------------------
    "nats": {"nats", "nats.io"},

    # ------------------------------------------------------------------
    # Miscellaneous tools
    # ------------------------------------------------------------------
    "linux": {"linux", "gnu/linux"},
    "bash": {"bash", "shell", "shell scripting", "sh"},
    "powershell": {"powershell", "pwsh", "ps1"},
    "vim": {"vim", "neovim", "nvim"},
    "vscode": {"vscode", "vs code", "visual studio code"},
    "intellij": {"intellij", "intellij idea"},
    "jira": {"jira", "atlassian jira"},
    "confluence": {"confluence"},
    "notion": {"notion"},
    "slack": {"slack"},
    "vercel": {"vercel", "zeit"},
    "netlify": {"netlify"},
    "heroku": {"heroku"},
    "digitalocean": {"digitalocean", "digital ocean"},
    "cloudflare": {"cloudflare", "cloud flare", "cf"},
    "auth0": {"auth0"},
    "stripe": {"stripe", "stripe api"},
    "twilio": {"twilio"},
    "sendgrid": {"sendgrid", "send grid"},
    "rabbitmq": {"rabbitmq", "rabbit mq", "rabbit"},
}


def build_reverse_lookup(synonyms: dict[str, set[str]]) -> dict[str, str]:
    """Build a reverse mapping from every alias to its canonical skill name.

    Args:
        synonyms: Mapping of canonical names to sets of lowercase aliases.

    Returns:
        A dict where each key is a lowercase alias and the value is the
        canonical skill name it belongs to.
    """
    lookup: dict[str, str] = {}
    for canonical, aliases in synonyms.items():
        for alias in aliases:
            lookup[alias] = canonical
    return lookup


# Pre-built for fast O(1) lookups at import time
ALIAS_TO_CANONICAL: dict[str, str] = build_reverse_lookup(SKILL_SYNONYMS)
