# 🚀 Resume Matcher Setup Guide

This guide explains how to set up and run the **Resume Matcher** project using the automated setup script.

---

## 📌 Prerequisites
Before running the setup, ensure you have:
- **Python 3.11+** installed
- **Git** installed
- **Internet connection** to download dependencies

---

## 🔹 How to Use the Script
### 1️⃣ Clone the Repository
If you haven’t already, clone the Resume Matcher repository:
```bash
git clone https://github.com/YOUR-USERNAME/Resume-Matcher.git
cd Resume-Matcher
```

### 2️⃣ Run the Setup Script
To automatically install all dependencies and run the application, execute:
```bash
bash scripts/utils/project-setup/setup.sh
```
This will:
✔ **Detect your OS** (Windows/macOS/Linux)  
✔ **Ensure Python 3.11 is used**  
✔ **Create & activate a virtual environment**  
✔ **Install required dependencies**  
✔ **Fix common issues automatically**  
✔ **Run the Resume Matcher setup**  

---

## 🛠 What the Script Does
- If Python **3.13+** is detected, it **downgrades to Python 3.11** using `pyenv`
- On **macOS**, installs missing **Xcode Command Line Tools & Homebrew**
- Creates & activates a **virtual environment**
- Installs all required **Python dependencies** with **error handling**
- **Ensures Streamlit is installed** and launches the app automatically  

---

## 🚀 Running the Application
Once the setup completes, the script **automatically starts Streamlit**.

If you need to run it manually later:
```bash
source env/bin/activate  # Activate the virtual environment
streamlit run streamlit_app.py  # Start the web app
```

📌 The app will open in your **web browser** at:  
➡ `http://localhost:8501`

---

## 💾 Adding Resumes & Job Descriptions
Before using the tool, add your files:
- **Resumes** → `Data/Resumes/`
- **Job Descriptions** → `Data/JobDescription/`

Ensure they are in **PDF format**.

---

## ❓ Troubleshooting
### 1️⃣ Streamlit command not found
If you see:
```
zsh: command not found: streamlit
```
Run:
```bash
source env/bin/activate
pip install streamlit
```

### 2️⃣ Dependencies not installed properly
Try:
```bash
pip install -r requirements.txt
```

### 3️⃣ Virtual environment not activating
Use:
```bash
source env/bin/activate
```
(Windows: `source env/Scripts/activate`)

---

## ✅ Summary
- **Run** `bash setup.sh` to install everything & start the app  
- **Upload resumes & job descriptions** in `Data/`  
- **Use the web app** to analyze your resume  
- **Enjoy a fully automated setup!** 🚀🔥
