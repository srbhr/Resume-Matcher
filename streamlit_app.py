#!/usr/bin/env python3
"""
🚨 IMPORTANT: This file is a compatibility stub for Resume Matcher v0.1+

The Resume Matcher project has been completely refactored and no longer uses Streamlit.
The application now runs on a modern FastAPI + Next.js stack for better performance,
security, and user experience.

╔═══════════════════════════════════════════════════════════════════════════════════════╗
║                      🎯 NEW RESUME MATCHER ARCHITECTURE                             ║
╠═══════════════════════════════════════════════════════════════════════════════════════╣
║                                                                                       ║
║  🔄 Migration from Streamlit to FastAPI + Next.js                                  ║
║                                                                                       ║
║  Old Stack:               →    New Stack:                                           ║
║  • Streamlit frontend     →    • Next.js 15+ (React)                               ║  
║  • Python backend         →    • FastAPI (async Python)                            ║
║  • Manual setup          →    • Automated setup scripts                            ║
║  • Basic UI               →    • Modern Tailwind CSS UI                            ║
║                                                                                       ║
╚═══════════════════════════════════════════════════════════════════════════════════════╝

🚀 QUICK START - GET RUNNING IN 2 MINUTES:
==========================================

1. 📖 Read the setup guide:
   https://github.com/srbhr/Resume-Matcher/blob/main/SETUP.md

2. 🛠️ Run the automated setup:
   
   Linux/macOS:
   -----------
   chmod +x setup.sh
   ./setup.sh
   
   Windows:
   --------
   .\\setup.ps1

3. 🌐 Start the application:
   
   npm run dev
   
   Then open:
   • Frontend: http://localhost:3000  ← Main application UI
   • API Docs: http://localhost:8000/docs  ← Backend API documentation

✨ NEW FEATURES YOU'LL LOVE:
===========================

🔒 Privacy-First: Everything runs locally with Ollama AI
🚀 Lightning Fast: Async FastAPI backend + optimized frontend  
🎨 Beautiful UI: Modern, responsive design with Tailwind CSS
🤖 Smart Analysis: Enhanced ATS compatibility scoring
📊 Real-time Feedback: Instant resume optimization suggestions
🔧 Easy Setup: One-command installation and configuration
📱 Mobile Friendly: Works great on all devices
🌐 API-First: RESTful API for integrations and extensions

💡 WHAT HAPPENED TO STREAMLIT?
=============================

We outgrew Streamlit! Here's why we migrated:

❌ Streamlit Limitations:
• Limited customization options
• Single-threaded performance bottlenecks  
• Difficult to integrate with modern tooling
• Basic UI components
• Limited mobile responsiveness

✅ New Architecture Benefits:
• Full control over UI/UX with Next.js + React
• Async/await performance with FastAPI
• Type-safe development with TypeScript
• Modern development workflow with hot reload
• Better SEO and performance optimization
• Easy deployment and scaling options

🛠️ FOR DEVELOPERS:
==================

Tech Stack:
-----------
Backend:  FastAPI + SQLAlchemy + Pydantic + Ollama
Frontend: Next.js + TypeScript + Tailwind CSS + Radix UI
Database: SQLite (development) → PostgreSQL (production)
AI:       Ollama serving gemma3:4b model locally

Project Structure:
------------------
apps/
├── backend/     ← FastAPI application
│   ├── app/
│   │   ├── models/      ← Database models
│   │   ├── services/    ← Business logic
│   │   ├── api/         ← API routes
│   │   └── schemas/     ← Request/response schemas
│   └── pyproject.toml
└── frontend/    ← Next.js application
    ├── app/            ← App Router pages
    ├── components/     ← Reusable UI components
    └── lib/            ← Utilities and API clients

Development Commands:
--------------------
npm run dev              # Start both frontend and backend
npm run dev:frontend     # Frontend only (port 3000)
npm run dev:backend      # Backend only (port 8000)
npm run build            # Production build
npm run lint             # Code linting

🆘 NEED HELP?
=============

• 📖 Documentation: https://github.com/srbhr/Resume-Matcher/blob/main/README.md
• 💬 Discord Community: https://dsc.gg/resume-matcher  
• 🐛 Report Issues: https://github.com/srbhr/Resume-Matcher/issues
• 🌐 Website: https://resumematcher.fyi

🔄 LEGACY STREAMLIT VERSION:
============================

If you absolutely need the old Streamlit version:
1. Check out a commit before the v0.1 refactor
2. Or create an issue requesting legacy support
3. Consider migrating to the new version for better features!

The new version is significantly more powerful and user-friendly.
"""

import sys
import os
import subprocess
from pathlib import Path

def print_migration_banner():
    """Print the detailed migration information"""
    banner = """
    ╔══════════════════════════════════════════════════════════════════════╗
    ║            🔄 Streamlit → FastAPI + Next.js Migration              ║
    ╠══════════════════════════════════════════════════════════════════════╣
    ║                                                                      ║
    ║  Resume Matcher has evolved! The Streamlit app has been replaced    ║
    ║  with a modern, fast, and beautiful FastAPI + Next.js application.  ║
    ║                                                                      ║
    ║  🎯 Better Performance  🎨 Modern UI  🔒 Privacy-Focused            ║
    ║                                                                      ║
    ╚══════════════════════════════════════════════════════════════════════╝
    """
    print(banner)

def show_quick_comparison():
    """Show before/after comparison"""
    print("\n📊 What Changed:")
    print("┌─────────────────┬──────────────────────┬─────────────────────┐")
    print("│ Aspect          │ Old (Streamlit)      │ New (FastAPI+Next) │")
    print("├─────────────────┼──────────────────────┼─────────────────────┤")
    print("│ Frontend        │ Streamlit widgets    │ Modern React UI     │")
    print("│ Backend         │ Synchronous Python   │ Async FastAPI       │")
    print("│ Performance     │ Single-threaded      │ Multi-threaded      │")
    print("│ UI/UX           │ Basic components     │ Custom Tailwind CSS │")
    print("│ Mobile Support  │ Limited              │ Fully responsive    │")
    print("│ API             │ None                 │ RESTful + OpenAPI   │")
    print("│ Type Safety     │ Basic Python         │ TypeScript + Python │")
    print("│ Development     │ Simple rerun         │ Hot reload + HMR    │")
    print("└─────────────────┴──────────────────────┴─────────────────────┘")

def check_new_setup():
    """Check if new setup files are available"""
    root_dir = Path(__file__).parent
    
    print("\n🔍 Checking for new setup files...")
    
    setup_files = {
        "SETUP.md": "📖 Setup documentation",
        "setup.sh": "🐧 Linux/macOS setup script", 
        "setup.ps1": "🪟 Windows PowerShell setup script",
        "package.json": "📦 Node.js dependencies",
        "apps/backend/pyproject.toml": "🐍 Python backend dependencies",
        "apps/frontend/package.json": "⚛️ Frontend dependencies"
    }
    
    missing_files = []
    
    for file_path, description in setup_files.items():
        full_path = root_dir / file_path
        if full_path.exists():
            print(f"  ✅ {description}")
        else:
            print(f"  ❌ {description} - Missing: {file_path}")
            missing_files.append(file_path)
    
    if missing_files:
        print("\n⚠️  Some setup files are missing. This might not be the latest version.")
        print("   Consider pulling the latest changes from the repository.")
    
    return len(missing_files) == 0

def provide_setup_instructions():
    """Provide step-by-step setup instructions"""
    print("\n🚀 Step-by-Step Setup Instructions:")
    print("=" * 50)
    
    if sys.platform.startswith('win'):
        print("\n🪟 Windows Setup:")
        print("1. Open PowerShell as Administrator")
        print("2. Navigate to the project directory")
        print("3. Run: .\\setup.ps1")
        print("4. Wait for installation to complete")
        print("5. Run: npm run dev")
        print("6. Open http://localhost:3000 in your browser")
    else:
        print("\n🐧 Linux/macOS Setup:")
        print("1. Open Terminal")
        print("2. Navigate to the project directory") 
        print("3. Run: chmod +x setup.sh")
        print("4. Run: ./setup.sh")
        print("5. Wait for installation to complete")
        print("6. Run: npm run dev")
        print("7. Open http://localhost:3000 in your browser")
    
    print("\n🔧 Manual Setup (if scripts fail):")
    print("1. Install Node.js 18+ and Python 3.12+")
    print("2. Install Ollama: https://ollama.com")
    print("3. Pull AI model: ollama pull gemma3:4b")
    print("4. Install frontend: cd apps/frontend && npm install")
    print("5. Install backend: cd apps/backend && uv sync")
    print("6. Start both: npm run dev")

def attempt_launch_new_app():
    """Attempt to launch the new application"""
    root_dir = Path(__file__).parent
    
    print("\n🚀 Attempting to start the new Resume Matcher...")
    
    # Check if we can run npm dev
    try:
        # First check if package.json exists
        package_json = root_dir / "package.json"
        if not package_json.exists():
            print("❌ package.json not found. Please ensure you're in the correct directory.")
            return False
        
        # Check if node_modules exists
        node_modules = root_dir / "node_modules"
        frontend_node_modules = root_dir / "apps" / "frontend" / "node_modules"
        
        if not (node_modules.exists() or frontend_node_modules.exists()):
            print("📦 Dependencies not installed. Running setup first...")
            
            # Try to run setup
            if sys.platform.startswith('win'):
                setup_script = root_dir / "setup.ps1"
                if setup_script.exists():
                    result = subprocess.run([
                        "powershell", "-ExecutionPolicy", "Bypass",
                        "-File", str(setup_script)
                    ])
                    if result.returncode != 0:
                        print("❌ Setup failed. Please run setup manually.")
                        return False
            else:
                setup_script = root_dir / "setup.sh"
                if setup_script.exists():
                    setup_script.chmod(0o755)
                    result = subprocess.run([str(setup_script)])
                    if result.returncode != 0:
                        print("❌ Setup failed. Please run setup manually.")
                        return False
        
        print("🎯 Starting Resume Matcher application...")
        print("   Frontend will be available at: http://localhost:3000")
        print("   Backend API will be available at: http://localhost:8000")
        print("   Press Ctrl+C to stop the application")
        
        # Start the development server
        process = subprocess.Popen(
            ["npm", "run", "dev"],
            cwd=root_dir,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            universal_newlines=True,
            bufsize=1
        )
        
        # Stream output
        try:
            for line in iter(process.stdout.readline, ''):
                print(line, end='')
        except KeyboardInterrupt:
            print("\n🛑 Shutting down Resume Matcher...")
            process.terminate()
            process.wait()
            print("👋 Resume Matcher stopped.")
            
        return True
        
    except FileNotFoundError:
        print("❌ npm not found. Please install Node.js first.")
        return False
    except Exception as e:
        print(f"❌ Failed to start application: {e}")
        return False

def main():
    """Main function"""
    print_migration_banner()
    show_quick_comparison()
    
    setup_ready = check_new_setup()
    provide_setup_instructions()
    
    if setup_ready:
        print("\n" + "="*70)
        try:
            response = input("\n❓ Would you like to start the new Resume Matcher now? (y/N): ").strip().lower()
            if response in ['y', 'yes']:
                success = attempt_launch_new_app()
                if not success:
                    print("\n💡 Please follow the manual setup instructions above.")
            else:
                print("\n👍 Great! Run 'npm run dev' when you're ready to start.")
                
        except (KeyboardInterrupt, EOFError):
            # Handle both KeyboardInterrupt and EOFError (when run via streamlit run)
            print("\n\n👍 Great! Run 'npm run dev' when you're ready to start.")
            print("💡 If you ran this via 'streamlit run', use 'python streamlit_app.py' instead for interactive features.")
    else:
        print("\n⚠️  Please ensure you have the latest version of Resume Matcher.")
        print("   Then follow the setup instructions above.")
    
    print("\n🔗 Helpful Resources:")
    print("   • New Documentation: https://github.com/srbhr/Resume-Matcher/blob/main/README.md")
    print("   • Setup Guide: https://github.com/srbhr/Resume-Matcher/blob/main/SETUP.md") 
    print("   • Community Support: https://dsc.gg/resume-matcher")
    print("   • Website: https://resumematcher.fyi")

if __name__ == "__main__":
    main()