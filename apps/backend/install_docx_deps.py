#!/usr/bin/env python3
"""
Install script for missing DOCX dependencies.
Fixes issue #409: Error processing file conversion DocxConverter
"""

import subprocess
import sys
import os

def install_dependencies():
    """Install the missing dependencies for DOCX processing"""
    print("Installing missing dependencies for DOCX processing...")
    
    dependencies = [
        "python-docx==1.2.0",
        "lxml==5.4.0"
    ]
    
    for dep in dependencies:
        print(f"Installing {dep}...")
        try:
            subprocess.check_call([sys.executable, "-m", "pip", "install", dep])
            print(f"✓ Successfully installed {dep}")
        except subprocess.CalledProcessError as e:
            print(f"✗ Failed to install {dep}: {e}")
            return False
    
    print("\n✓ All dependencies installed successfully!")
    print("You can now test DOCX upload functionality.")
    return True

def main():
    print("Resume Matcher - DOCX Dependencies Installer")
    print("=" * 50)
    print("This script installs missing dependencies to fix issue #409")
    print("(Error processing file conversion DocxConverter)")
    print()
    
    # Check if we're in the right directory
    if not os.path.exists("requirements.txt"):
        print("Error: requirements.txt not found.")
        print("Please run this script from the apps/backend directory.")
        sys.exit(1)
    
    if install_dependencies():
        print("\nDependencies installed successfully!")
        print("You can now test DOCX file uploads in the Resume Matcher application.")
    else:
        print("\nSome dependencies failed to install.")
        print("Please check the error messages above and try installing manually:")
        print("  pip install python-docx==1.2.0 lxml==5.4.0")
        sys.exit(1)

if __name__ == "__main__":
    main()
