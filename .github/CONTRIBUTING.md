# Contributing to Resume-Matcher on GitHub

Thank you for taking the time to contribute to [Resume-Matcher](https://github.com/srbhr/Resume-Matcher).

We want you to have a great experience making your first contribution.

This contribution could be anything from a small fix to a typo in our
documentation or a full feature.

Tell us what you enjoy working on and we would love to help!

If you would like to contribute, but don't know where to start, check the
issues that are labeled
`good first issue`
or
`help wanted`.

Contributions make the open-source community a fantastic place to learn, inspire, and create. Any contributions you make are greatly appreciated.

The development branch is `main`. This is the branch where all pull requests should be made.

## Reporting Bugs

Please try to create bug reports that are:

- Reproducible. Include steps to reproduce the problem.
- Specific. Include as much detail as possible: which version, what environment, etc.
- Unique. Do not duplicate existing opened issues.
- Scoped to a Single Bug. One bug per report.

## Testing

Please test your changes before submitting the PR.

## Good First Issues

We have a list of `help wanted` and `good first issue` that contains small features and bugs with a relatively limited scope. Nevertheless, this is a great place to get started, gain experience, and get familiar with our contribution process.

## Development

Follow these steps to set up the environment and run the application.

## How to install

1. Fork the repository [here](https://github.com/srbhr/Resume-Matcher/fork).

2. Clone the forked repository.

   ```bash
   git clone https://github.com/<YOUR-USERNAME>/Resume-Matcher.git
   cd Resume-Matcher
   ```

3. **Install Dependencies (Quick Setup):**

   ```bash
   # Install all dependencies (frontend + backend)
   npm install
   ```
   
   This will automatically:
   - Install frontend dependencies via npm
   - Install backend Python dependencies via uv (creates virtual environment automatically)

4. **Set up Environment Files:**

   **Backend (.env):**
   ```bash
   # Create backend environment file
   echo 'SYNC_DATABASE_URL=sqlite:///./resume_matcher.db' > apps/backend/.env
   echo 'ASYNC_DATABASE_URL=sqlite+aiosqlite:///./resume_matcher.db' >> apps/backend/.env
   echo 'SESSION_SECRET_KEY=your-secret-key-here-change-in-production' >> apps/backend/.env
   echo 'LLM_PROVIDER=ollama' >> apps/backend/.env
   echo 'LLM_BASE_URL=http://localhost:11434' >> apps/backend/.env
   echo 'LL_MODEL=gemma3:4b' >> apps/backend/.env
   ```

   **Frontend (.env.local):**
   ```bash
   # Create frontend environment file
   echo 'NEXT_PUBLIC_API_URL=http://localhost:8000' > apps/frontend/.env.local
   ```

5. **Start Development:**

   ```bash
   # Start both frontend and backend
   npm run dev
   
   # OR start individually:
   npm run dev:frontend  # Next.js frontend on http://localhost:3000
   npm run dev:backend   # FastAPI backend on http://localhost:8000
   ```

6. **Alternative Setup Methods:**

   **Quick Setup (Recommended for first-time setup):**
   
   **Windows (PowerShell):**
   ```powershell
   .\setup.ps1
   ```
   
   **Linux/macOS (Bash):**
   ```bash
   chmod +x setup.sh
   ./setup.sh
   ```

   **Manual Setup (For advanced users):**
   
   - Install frontend dependencies:
     ```bash
     cd apps/frontend
     npm ci
     ```
   
   - Install backend dependencies:
     ```bash
     cd apps/backend
     uv sync
     ```

7. **Prerequisites:**

   Make sure you have these installed:
   - **Node.js** ≥ v18 (includes npm)
   - **Python** ≥ 3.12 
   - **uv** ≥ 0.6.0 (Python package manager) - will be auto-installed by setup scripts
   - **Ollama** (for AI model serving) - install from [ollama.com](https://ollama.com)

8. **Troubleshooting:**

   If you encounter issues:
   
   - **Missing dependencies**: Run `npm install` to ensure all packages are installed
   - **Backend won't start**: Check that `.env` files are created in both `apps/backend/` and `apps/frontend/`
   - **Database errors**: Ensure `SYNC_DATABASE_URL` and `ASYNC_DATABASE_URL` are set in `apps/backend/.env`
   - **API 404 errors**: Verify `NEXT_PUBLIC_API_URL=http://localhost:8000` in `apps/frontend/.env.local`

## 🚀 Development Workflow (uv + npm)

Resume Matcher now uses **uv** for fast Python dependency management alongside npm for frontend dependencies.

### Common Development Commands:

```bash
# Install all dependencies
npm install

# Start development servers (both frontend + backend)
npm run dev

# Start individual services
npm run dev:frontend    # Frontend only (port 3000)
npm run dev:backend     # Backend only (port 8000)

# Add new Python dependency
cd apps/backend
uv add package-name

# Add development dependency
cd apps/backend
uv add --dev package-name

# Install frontend package
cd apps/frontend
npm install package-name
```

### Environment Variables:

**Required for backend** (`apps/backend/.env`):
```env
SYNC_DATABASE_URL=sqlite:///./resume_matcher.db
ASYNC_DATABASE_URL=sqlite+aiosqlite:///./resume_matcher.db
SESSION_SECRET_KEY=your-secret-key-here
LLM_PROVIDER=ollama
LLM_BASE_URL=http://localhost:11434
LL_MODEL=gemma3:4b
```

**Required for frontend** (`apps/frontend/.env.local`):
```env
NEXT_PUBLIC_API_URL=http://localhost:8000
```

## Code Formatting

This project uses [Black](https://black.readthedocs.io/en/stable/) for code formatting. We believe this helps to keep the code base consistent and reduces the cognitive load when reading code.

Before submitting your pull request, please make sure your changes are in accordance with the Black style guide. You can format your code by running the following command in your terminal:

```sh
black .
```

## Pre-commit Hooks

We also use [pre-commit](https://pre-commit.com/) to automatically check for common issues before commits are submitted. This includes checks for code formatting with Black.

If you haven't already, please install the pre-commit hooks by running the following command in your terminal:

```sh
# Install pre-commit using uv
uv tool install pre-commit
# OR if you prefer system-wide installation
pip install pre-commit

pre-commit install
```

Now, the pre-commit hooks will automatically run every time you commit your changes. If any of the hooks fail, the commit will be aborted.

## Join Us, Contribute!

Pull Requests & Issues are not just welcomed, they're celebrated! Let's create together.

🎉 Join our lively [Discord](https://dsc.gg/resume-matcher) community and discuss away!

💡 Spot a problem? Create an issue!

👩‍💻 Dive in and help resolve existing [issues](https://github.com/srbhr/Resume-Matcher/issues).

🔔 Share your thoughts in our [Discussions & Announcements](https://github.com/srbhr/Resume-Matcher/discussions).

🚀 Explore and improve our [Landing Page](https://github.com/srbhr/website-for-resume-matcher). PRs always welcome!

📚 Contribute to the [Resume Matcher Docs](https://github.com/srbhr/Resume-Matcher-Docs) and help people get started with using the software.
