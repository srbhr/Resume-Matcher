# Resume Matcher Setup Guide

## Prerequisites

- Node.js (v18 or higher)
- Python (v3.8 or higher)
- uv (for fast Python package management)
- npm or yarn

## Installation Steps

### 0. Install uv (if not already installed)

```bash
curl -LsSf https://astral.sh/uv/install.sh | sh
```

### 1. Install Root Dependencies

```bash
npm install
```

This will install the `concurrently` package needed to run both frontend and backend simultaneously.

### 2. Setup Frontend

```bash
npm run install:frontend
```

Or manually:
```bash
cd apps/frontend
npm install
```

### 3. Setup Backend

```bash
npm run install:backend
```

Or manually:
```bash
cd apps/backend
uv sync
```

## Development

### Run Both Frontend and Backend
```bash
npm run dev
```

### Run Frontend Only
```bash
npm run dev:frontend
```

### Run Backend Only
```bash
npm run dev:backend
```

## Building

### Build Both
```bash
npm run build
```

### Build Frontend Only
```bash
npm run build:frontend
```

## Production

### Start Both in Production Mode
```bash
npm run start
```

### Start Frontend Only
```bash
npm run start:frontend
```

### Start Backend Only
```bash
npm run start:backend
```

## Troubleshooting

1. **Network issues with npm**: If you encounter network issues, try:
   ```bash
   npm config set registry https://registry.npmjs.org/
   npm cache clean --force
   ```

2. **Python virtual environment issues**: Make sure you have uv and Python 3.8+ installed and try syncing manually:
   ```bash
   cd apps/backend
   uv sync
   ```

3. **Port conflicts**: The backend runs on port 8000 and frontend on port 3000 by default. Make sure these ports are available.

## Directory Structure

```
Resume-Matcher/
├── package.json              # Root package.json with build scripts
├── apps/
│   ├── backend/
│   │   ├── requirements.txt   # Python dependencies
│   │   └── app/
│   │       └── main.py       # FastAPI application entry point
│   └── frontend/
│       ├── package.json      # Frontend dependencies
│       └── app/              # Next.js application
```
