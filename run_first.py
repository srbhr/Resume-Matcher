#!/usr/bin/env python3
"""
🚨 IMPORTANT: This file is a compatibility stub for Resume Matcher v0.1+

The Resume Matcher project has been refactored to use a modern FastAPI + Next.js architecture.
The old Streamlit-based application (streamlit_app.py) and this setup script (run_first.py) 
are no longer needed.

╔═══════════════════════════════════════════════════════════════════════════════════════╗
║                             🚀 NEW SETUP PROCESS                                    ║  
╠═══════════════════════════════════════════════════════════════════════════════════════╣
║                                                                                       ║
║  1. Follow the instructions in SETUP.md                                             ║
║     📄 https://github.com/srbhr/Resume-Matcher/blob/main/SETUP.md                   ║
║                                                                                       ║
║  2. Quick setup commands:                                                            ║
║     • Linux/macOS: ./setup.sh                                                       ║
║     • Windows:     .\\setup.ps1                                                     ║
║                                                                                       ║
║  3. Start development server:                                                        ║
║     • Linux/macOS: ./setup.sh --start-dev                                          ║
║     • Windows:     .\\setup.ps1 -StartDev                                          ║
║     • Manual:      npm run dev                                                       ║
║                                                                                       ║
║  4. Access the application:                                                          ║
║     • Frontend: http://localhost:3000                                               ║
║     • Backend API: http://localhost:8000                                            ║
║                                                                                       ║
╚═══════════════════════════════════════════════════════════════════════════════════════╝

What's New:
-----------
✨ Modern FastAPI backend with async processing
✨ Beautiful Next.js frontend with Tailwind CSS  
✨ Local AI processing with Ollama (privacy-focused)
✨ Improved ATS compatibility analysis
✨ Better resume parsing and matching algorithms
✨ Real-time keyword optimization suggestions

Need Help?
----------
• Join our Discord: https://dsc.gg/resume-matcher
• Documentation: https://github.com/srbhr/Resume-Matcher/blob/main/README.md
• Issues: https://github.com/srbhr/Resume-Matcher/issues

Legacy Support:
---------------
If you specifically need the old Streamlit version, please checkout an earlier commit
or create an issue on GitHub for guidance.
"""

import sys
import os
import subprocess
from pathlib import Path

def print_banner():
    """Print the migration banner"""
    banner = """
    ╔══════════════════════════════════════════════════════════════════════╗
    ║               🔄 Resume Matcher Migration Notice                    ║
    ╠══════════════════════════════════════════════════════════════════════╣
    ║                                                                      ║
    ║  This script (run_first.py) is no longer used in Resume Matcher.   ║
    ║  The project has migrated to a FastAPI + Next.js architecture.      ║
    ║                                                                      ║
    ║  📖 Please follow the new setup instructions in SETUP.md            ║
    ║                                                                      ║
    ╚══════════════════════════════════════════════════════════════════════╝
    """
    print(banner)

def check_setup_files():
    """Check if setup files exist and provide guidance"""
    root_dir = Path(__file__).parent
    setup_md = root_dir / "SETUP.md"
    setup_sh = root_dir / "setup.sh" 
    setup_ps1 = root_dir / "setup.ps1"
    
    print("\n📋 Available setup options:")
    
    if setup_md.exists():
        print(f"  ✅ Setup documentation: {setup_md}")
    else:
        print("  ❌ SETUP.md not found")
    
    if setup_sh.exists():
        print(f"  ✅ Linux/macOS setup: {setup_sh}")
        if not os.access(setup_sh, os.X_OK):
            print(f"     💡 Make it executable: chmod +x {setup_sh}")
    
    if setup_ps1.exists():
        print(f"  ✅ Windows setup: {setup_ps1}")

def suggest_next_steps():
    """Suggest next steps based on the operating system"""
    print("\n🚀 Recommended next steps:")
    
    if sys.platform.startswith('win'):
        print("  1. Open PowerShell as Administrator")
        print("  2. Run: .\\setup.ps1")
        print("  3. Or with development server: .\\setup.ps1 -StartDev")
    else:
        print("  1. Make setup script executable: chmod +x setup.sh")
        print("  2. Run setup: ./setup.sh")
        print("  3. Or with development server: ./setup.sh --start-dev")
    
    print("\n🔗 Useful links:")
    print("  • Documentation: https://github.com/srbhr/Resume-Matcher/blob/main/README.md")
    print("  • Setup Guide: https://github.com/srbhr/Resume-Matcher/blob/main/SETUP.md")
    print("  • Discord Community: https://dsc.gg/resume-matcher")

def attempt_auto_setup():
    """Attempt to automatically run the new setup process"""
    root_dir = Path(__file__).parent
    
    print("\n🤖 Attempting automatic setup...")
    
    try:
        if sys.platform.startswith('win'):
            setup_script = root_dir / "setup.ps1"
            if setup_script.exists():
                print("  Running Windows setup script...")
                result = subprocess.run([
                    "powershell", "-ExecutionPolicy", "Bypass", 
                    "-File", str(setup_script)
                ])
                
                if result.returncode == 0:
                    print("  ✅ Setup completed successfully!")
                    print("  🌐 You can now run: npm run dev")
                    return True
                else:
                    print(f"  ❌ Setup failed with exit code: {result.returncode}")
                    return False
        else:
            setup_script = root_dir / "setup.sh"
            if setup_script.exists():
                # Make executable if not already
                setup_script.chmod(0o755)
                print("  Running Linux/macOS setup script...")
                result = subprocess.run([str(setup_script)])
                
                if result.returncode == 0:
                    print("  ✅ Setup completed successfully!")
                    print("  🌐 You can now run: npm run dev")
                    return True
                else:
                    print(f"  ❌ Setup failed with exit code: {result.returncode}")
                    return False
                    
    except Exception as e:
        print(f"  ❌ Auto-setup failed: {e}")
        return False
    
    return False

def main():
    """Main function"""
    print_banner()
    check_setup_files()
    suggest_next_steps()
    
    # Ask user if they want to attempt automatic setup
    try:
        response = input("\n❓ Would you like to attempt automatic setup? (y/N): ").strip().lower()
        if response in ['y', 'yes']:
            success = attempt_auto_setup()
            if not success:
                print("\n💡 Please follow the manual setup instructions above.")
        else:
            print("\n👍 Please follow the setup instructions above to get started.")
            
    except KeyboardInterrupt:
        print("\n\n👋 Setup cancelled. Please follow the manual instructions above.")
    except Exception as e:
        print(f"\n❌ Error: {e}")
        print("Please follow the manual setup instructions above.")

if __name__ == "__main__":
    main()