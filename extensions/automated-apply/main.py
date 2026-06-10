import os
import time
import requests
import re
import random
from scraper import fetch_jobs, get_browser_headers
from notifier import send_whatsapp_notification
from parser import create_tailored_docx
from github_fetcher import fetch_github_projects
from tailor import enrich_and_format_resume, audit_and_correct_resume

# ===========================================================================
# Resume Matcher Customization Settings
# Customize these variables to control the appearance of your generated resume
# ===========================================================================
PDF_SETTINGS = {
    "template": "swiss-single",       # Options: swiss-single, swiss-two-column, modern, modern-two-column
    "pageSize": "A4",                 # Options: A4, LETTER
    "accentColor": "blue",            # Options: blue, green, orange, red
    "compactMode": "false",           # Options: true, false
    "showContactIcons": "false",      # Options: true, false
    "marginTop": 10,                  # Margins in mm (5 to 25)
    "marginBottom": 10,
    "marginLeft": 10,
    "marginRight": 10,
    "sectionSpacing": 3,              # Gap between sections (1 to 5)
    "itemSpacing": 2,                 # Gap between items (1 to 5)
    "lineHeight": 3,                  # Line height (1 to 5)
    "fontSize": 3,                    # Base font size (1 to 5)
}

BASE_RESUME_PATH = "Chinmaya Shah Resume.docx"
OUTPUT_DIR = "Tailored_Resumes"
API_BASE_URL = "http://localhost:8000/api/v1"

PROCESSED_URLS_FILE = "processed_urls.txt"

def is_fresher_job(title, description):
    """
    Returns True if the job is suitable for a fresher/junior (0-2 years of experience),
    False if it requires senior or mid-level experience (3+ years).
    """
    title_lower = title.lower()
    
    # Keywords indicating senior/lead/experience roles
    senior_keywords = [
        "senior", "sr.", "sr ", "lead", "principal", "architect", "manager", 
        "staff engineer", "head of", "director", "mgr", "vp", "chief",
        "tech lead", "technical lead", "solution architect", "solutions architect",
        "expert", "specialist", "mid-level", "mid level"
    ]
    
    # If the title explicitly contains senior keywords, reject it
    if any(keyword in title_lower for keyword in senior_keywords):
        return False
        
    # Check if the title explicitly mentions junior/intern/fresher/entry-level/associate
    fresher_keywords = ["junior", "jr", "associate", "intern", "trainee", "fresher", "graduate", "entry level", "entry-level"]
    if any(keyword in title_lower for keyword in fresher_keywords):
        return True
        
    # Soft filter: check description for high experience requirements
    import re
    desc_lower = description.lower()
    
    # Example: "3-5 years of experience", "3 to 5 years", "3+ years", "minimum 3 years"
    range_pattern = r"\b(\d+)\s*(?:-|to)\s*(\d+)\s*(?:years?|yrs?|yoe)\b"
    single_pattern = r"\b(\d+)\+?\s*(?:years?|yrs?|yoe)\b"
    
    # Check ranges first (e.g. 3-5 years)
    for match in re.finditer(range_pattern, desc_lower):
        min_exp = int(match.group(1))
        
        # Check context around the match to make sure it refers to experience
        start_idx = max(0, match.start() - 30)
        end_idx = min(len(desc_lower), match.end() + 30)
        context = desc_lower[start_idx:end_idx]
        if any(w in context for w in ["experience", "exp", "work", "yoe", "background", "industry", "professional"]):
            if min_exp >= 3:
                return False
                
    # Check single numbers (e.g. "3+ years", "3 years")
    for match in re.finditer(single_pattern, desc_lower):
        exp = int(match.group(1))
        
        # Check context
        start_idx = max(0, match.start() - 30)
        end_idx = min(len(desc_lower), match.end() + 30)
        context = desc_lower[start_idx:end_idx]
        if any(w in context for w in ["experience", "exp", "work", "yoe", "background", "industry", "professional"]):
            # Avoid double-matching the second part of a range
            preceding_context = desc_lower[max(0, match.start() - 5):match.start()]
            if "-" in preceding_context or "to" in preceding_context:
                continue
                
            if exp >= 3:
                return False

    return True

def load_processed_urls():
    if os.path.exists(PROCESSED_URLS_FILE):
        try:
            with open(PROCESSED_URLS_FILE, "r", encoding="utf-8") as f:
                return set(line.strip() for line in f if line.strip())
        except Exception as e:
            print(f"[WARNING] Could not load processed URLs: {e}")
    return set()

def save_processed_url(url):
    try:
        with open(PROCESSED_URLS_FILE, "a", encoding="utf-8") as f:
            f.write(url + "\n")
    except Exception as e:
        print(f"[WARNING] Could not save processed URL: {e}")

def wait_for_backend(api_url, timeout=30):
    """
    Waits for the Resume Matcher backend to start listening and respond to requests.
    """
    print(f"Waiting for Resume Matcher backend to start up at {api_url}...")
    for i in range(timeout):
        try:
            response = requests.get(f"{api_url}/health", timeout=2)
            if response.status_code == 200:
                print("Backend is online and healthy!")
                return True
        except requests.exceptions.ConnectionError:
            pass
        time.sleep(1)
    return False

def get_or_upload_master_resume():
    """
    Checks if a master resume exists in Resume Matcher.
    If not, prompts the user to upload it manually in the frontend and loops/polls.
    Returns the master_resume_id.
    """
    print("Checking for existing master resume in Resume Matcher...")
    while True:
        try:
            response = requests.get(f"{API_BASE_URL}/resumes/list?include_master=true", timeout=5)
            if response.status_code == 200:
                resumes = response.json().get("data", [])
                for res in resumes:
                    if res.get("is_master"):
                        master_id = res.get("resume_id")
                        print(f"Found master resume in system! (ID: {master_id})")
                        return master_id
            
            print("\n[PROMPT] No master resume found in system!")
            print("  Please open your browser to: http://localhost:3000")
            print("  1. Upload your latest resume.")
            print("  2. Set/Confirm it as your MASTER resume in the interface.")
            print("Waiting for master resume to be uploaded... (polling every 10 seconds)\n")
            time.sleep(10)
        except Exception as e:
            print(f"[WARNING] Waiting for Resume Matcher backend to respond: {e}")
            time.sleep(5)

def map_backend_to_local_schema(backend_data):
    """
    Maps backend ResumeData structure to local parser.py template schema.
    """
    personal = backend_data.get("personalInfo", {})
    education_list = []
    for edu in backend_data.get("education", []):
        desc = edu.get("description", "") or ""
        # Default CGPA if not found
        cgpa = "7.62/10.00"
        match = re.search(r"CGPA:\s*([\d.]+/?[\d.]*)", desc, re.IGNORECASE)
        if match:
            cgpa = match.group(1)
            
        education_list.append({
            "university": edu.get("institution", ""),
            "degree": edu.get("degree", ""),
            "graduation_year": edu.get("years", ""),
            "cgpa": cgpa
        })

    projects_list = []
    for proj in backend_data.get("personalProjects", []):
        projects_list.append({
            "name": proj.get("name", ""),
            "technologies": proj.get("role", ""),  # In backend role is often used for tech stack/details
            "bullets": proj.get("description", [])
        })

    additional = backend_data.get("additional", {})
    # Simple mapping for skills fields
    skills = {
        "languages": ", ".join(additional.get("languages", [])),
        "frameworks": ", ".join(additional.get("technicalSkills", [])[:5]),
        "tools": ", ".join(additional.get("technicalSkills", [])[5:])
    }

    return {
        "contact": {
            "name": personal.get("name", "CHINMAYA SHAH"),
            "email": personal.get("email", "chinmayashah123335@gmail.com"),
            "phone": personal.get("phone", "+91 97242 00396"),
            "linkedin": personal.get("linkedin", "linkedin.com/in/chinmaya-shah"),
            "github": personal.get("github", "github.com/Chinmaya-shah"),
            "leetcode": "leetcode.com/chinmaya_shah"
        },
        "education": education_list,
        "summary": backend_data.get("summary", ""),
        "projects": projects_list,
        "skills": skills
    }

def map_enriched_to_backend_schema(enriched, original, master_data):
    """
    Maps local enriched template schema back to backend ResumeData structure, preserving master certifications.
    """
    personal = enriched.get("contact", {})
    personalInfo = {
        "name": personal.get("name", "CHINMAYA SHAH"),
        "title": "Backend Developer",
        "email": personal.get("email", "chinmayashah123335@gmail.com"),
        "phone": personal.get("phone", "+91 97242 00396"),
        "location": "India",
        "website": "",
        "linkedin": personal.get("linkedin", "linkedin.com/in/chinmaya-shah"),
        "github": personal.get("github", "github.com/Chinmaya-shah")
    }
    
    education_list = []
    for edu in enriched.get("education", []):
        education_list.append({
            "institution": edu.get("university", ""),
            "degree": edu.get("degree", ""),
            "years": edu.get("graduation_year", ""),
            "description": f"CGPA: {edu.get('cgpa', '')}"
        })
        
    projects_list = []
    for proj in enriched.get("projects", []):
        projects_list.append({
            "name": proj.get("name", ""),
            "role": proj.get("technologies", ""),  # 'role' maps to technologies in backend schema
            "years": "",
            "github": "",
            "website": "",
            "description": proj.get("bullets", [])
        })
        
    skills = enriched.get("skills", {})
    languages_str = skills.get("languages", "")
    if languages_str:
        languages = [lang.strip() for lang in languages_str.split(",")]
    else:
        languages = original.get("additional", {}).get("languages", [])
        
    technicalSkills = []
    if skills.get("frameworks"):
        technicalSkills.extend([f.strip() for f in skills.get("frameworks", "").split(",")])
    if skills.get("tools"):
        technicalSkills.extend([t.strip() for t in skills.get("tools", "").split(",")])
        
    additional = {
        "technicalSkills": technicalSkills,
        "languages": languages,
        "certificationsTraining": master_data.get("additional", {}).get("certificationsTraining", []),
        "awards": master_data.get("additional", {}).get("awards", [])
    }
    
    return {
        "personalInfo": personalInfo,
        "summary": enriched.get("summary", ""),
        "workExperience": original.get("workExperience", []),
        "education": education_list,
        "personalProjects": projects_list,
        "additional": additional,
        "sectionMeta": original.get("sectionMeta", []),
        "customSections": original.get("customSections", {})
    }

def resolve_direct_apply_url(url):
    """
    Follows redirects of a job URL to find the final direct apply page on the company career portal.
    Uses rotated browser headers, proxy support, exponential backoff, and graceful fallback.
    """
    if not url:
        return url
        
    proxies_env = os.getenv("SCRAPER_PROXIES")
    proxy_list = [p.strip() for p in proxies_env.split(",") if p.strip()] if proxies_env else []
    
    max_retries = 3
    for attempt in range(max_retries):
        headers = get_browser_headers()
        proxies = {}
        if proxy_list:
            selected_proxy = random.choice(proxy_list)
            proxies = {"http": selected_proxy, "https": selected_proxy}
            
        try:
            # Try HEAD request first for efficiency
            response = requests.head(url, headers=headers, proxies=proxies, allow_redirects=True, timeout=8)
            
            # If status indicates error or HEAD is rejected/forbidden, fallback to GET
            if response.status_code in (403, 404, 405, 501, 502) or response.status_code >= 400:
                response = requests.get(url, headers=headers, proxies=proxies, allow_redirects=True, timeout=8)
                
            # If rate limited (429), trigger backoff
            if response.status_code == 429:
                raise requests.exceptions.RequestException("Rate limited (429)")
                
            return response.url
            
        except Exception as e:
            # Calculate backoff with jitter
            backoff = (2 ** attempt) + random.uniform(1.0, 3.0)
            print(f"[WARNING] Redirect follow failed on attempt {attempt+1}/{max_retries} for {url}. Error: {e}. Retrying in {backoff:.2f}s...")
            if attempt < max_retries - 1:
                time.sleep(backoff)
            else:
                print(f"[WARNING] Exceeded redirect follow retries. Falling back to original URL: {url}")
                
    return url

def process_job_posting(job, master_resume_id, master_resume_data, processed_urls):
    """
    Processes a single job posting: resolves redirect, checks duplicates, uploads to backend,
    tails resume, generates DOCX/PDF, and sends WhatsApp notification.
    Returns True if successfully processed, False otherwise.
    """
    company = job.get('company', 'Unknown')
    title = job.get('title', 'Unknown')
    apply_link = job.get('job_url', '')
    description = job.get('description', '')
    site = job.get('site', 'Unknown')
    
    if not description or not apply_link:
        print(f"  -> Skipping job '{title}' at '{company}' (Missing description or link)")
        return False
        
    # Resolve direct company portal URL
    print(f"Resolving direct company portal URL for: {apply_link}...")
    resolved_link = resolve_direct_apply_url(apply_link)
    if resolved_link:
        print(f"Resolved to direct link: {resolved_link}")
        apply_link = resolved_link
        
    if apply_link in processed_urls:
        print(f"  -> Skipping job '{title}' at '{company}' (Already processed)")
        return False
        
    print(f"\n--- Processing Job from {site.upper()}: {title} at {company} ---")
    
    try:
        # 1. Upload JD to Resume Matcher
        print("Uploading Job Description to Resume Matcher...")
        jd_payload = {
            "job_descriptions": [description],
            "resume_id": master_resume_id
        }
        jd_res = requests.post(f"{API_BASE_URL}/jobs/upload", json=jd_payload, timeout=30)
        if jd_res.status_code != 200:
            print(f"Failed to upload job description: {jd_res.text}")
            return False
        job_id = jd_res.json()["job_id"][0]
        print(f"Job Description uploaded. ID: {job_id}")

        # 2. Trigger Advanced Tailoring (Improve Resume)
        print("Tailoring resume with Resume Matcher advanced refinement engine...")
        improve_payload = {
            "resume_id": master_resume_id,
            "job_id": job_id,
            "prompt_id": None
        }
        
        improve_data = None
        for attempt in range(3):
            improve_res = requests.post(f"{API_BASE_URL}/resumes/improve", json=improve_payload, timeout=60)
            if improve_res.status_code == 200:
                improve_data = improve_res.json()["data"]
                break
            
            print(f"  Attempt {attempt+1} failed (Status {improve_res.status_code}): {improve_res.text}")
            if attempt < 2:
                print("  Waiting 15 seconds for API cooldown before retrying...")
                time.sleep(15)
                
        if not improve_data:
            print("Failed to improve resume after multiple attempts. Skipping.")
            return False
        
        tailored_resume_id = improve_data["resume_id"]
        resume_preview = improve_data.get("resume_preview", {})
        cover_letter = improve_data.get("cover_letter", "")
        print(f"Resume tailored successfully. New Resume ID: {tailored_resume_id}")

        # Fetch GitHub projects
        github_projects_text = ""
        try:
            print("Fetching GitHub projects...")
            github_projects_text = fetch_github_projects(username="Chinmaya-shah")
        except Exception as gh_ex:
            print(f"[WARNING] Could not fetch GitHub projects: {gh_ex}")

        # Enrich the resume preview using tailor.py
        enriched_resume_preview = None
        suggested_project_feedback = ""
        try:
            print("Enriching tailored resume with GitHub projects and Google's XYZ formula...")
            enriched_data = enrich_and_format_resume(resume_preview, description, github_projects_text)
            if enriched_data and "enriched_resume" in enriched_data:
                print("Successfully enriched resume via tailor.py.")
                enriched_resume_preview = enriched_data["enriched_resume"]
                suggested_project_feedback = enriched_data.get("suggested_project_feedback", "")
                
                # Map the enriched_resume_preview back to ResumeData and update it in the backend database
                backend_update_payload = map_enriched_to_backend_schema(enriched_resume_preview, resume_preview, master_resume_data)
                
                print("Updating backend database with the enriched resume details...")
                update_res = requests.patch(f"{API_BASE_URL}/resumes/{tailored_resume_id}", json=backend_update_payload, timeout=30)
                if update_res.status_code == 200:
                    print("Backend resume updated successfully.")
                    # Refresh resume_preview with the updated data
                    resume_preview = update_res.json().get("data", {}).get("processed_resume") or resume_preview
                else:
                    print(f"[WARNING] Failed to update resume in backend: {update_res.text}")
            else:
                print("[WARNING] Enriched data was empty or invalid. Falling back to default backend tailoring.")
        except Exception as tailor_ex:
            print(f"[WARNING] Enrichment/Tailoring failed: {tailor_ex}")

        # 3. Final Verification and Copyedit Pass
        print("Running final verification and copyedit pass (spelling, grammar, repetitions) before downloading PDF/DOCX...")
        try:
            current_resume_preview = None
            if enriched_resume_preview:
                current_resume_preview = enriched_resume_preview
            else:
                current_resume_preview = map_backend_to_local_schema(resume_preview)
                
            if current_resume_preview:
                audited_resume = audit_and_correct_resume(current_resume_preview)
                
                # Map back to backend schema and update backend database to guarantee PDF uses it
                backend_update_payload = map_enriched_to_backend_schema(audited_resume, resume_preview, master_resume_data)
                print("Updating backend database with audited resume details before PDF/DOCX generation...")
                update_res = requests.patch(f"{API_BASE_URL}/resumes/{tailored_resume_id}", json=backend_update_payload, timeout=30)
                if update_res.status_code == 200:
                    print("Backend resume successfully updated with audited version.")
                    resume_preview = update_res.json().get("data", {}).get("processed_resume") or resume_preview
                    # Update enriched_resume_preview so DOCX also gets the audited version
                    enriched_resume_preview = audited_resume
                else:
                    print(f"[WARNING] Failed to update backend with audited resume: {update_res.text}")
        except Exception as audit_ex:
            print(f"[WARNING] Audit and correction pass failed: {audit_ex}")

        safe_company_name = "".join(c for c in company if c.isalnum() or c in (' ', '_', '-')).rstrip()

        # 4. Download Tailored PDF
        print("Downloading tailored PDF...")
        pdf_res = requests.get(
            f"{API_BASE_URL}/resumes/{tailored_resume_id}/pdf",
            params=PDF_SETTINGS,
            timeout=60
        )
        
        output_pdf_path = None
        if pdf_res.status_code == 200:
            output_pdf_filename = f"Chinmaya_Shah_Resume_{safe_company_name}.pdf"
            output_pdf_path = os.path.abspath(os.path.join(OUTPUT_DIR, output_pdf_filename))
            with open(output_pdf_path, "wb") as pdf_file:
                pdf_file.write(pdf_res.content)
            print(f"Saved PDF to: {output_pdf_path}")
        else:
            print(f"Failed to download PDF: {pdf_res.text}")

        # 5. Generate Tailored DOCX locally
        print("Generating tailored DOCX locally...")
        output_docx_path = None
        try:
            if enriched_resume_preview:
                mapped_resume_json = enriched_resume_preview
            else:
                mapped_resume_json = map_backend_to_local_schema(resume_preview)
                
            output_docx_filename = f"Chinmaya_Shah_Resume_{safe_company_name}.docx"
            output_docx_path = os.path.abspath(os.path.join(OUTPUT_DIR, output_docx_filename))
            create_tailored_docx(mapped_resume_json, output_docx_path)
        except Exception as docx_ex:
            print(f"[WARNING] Local DOCX generation failed: {docx_ex}")

        # 6. Save Project Suggestion as TXT file locally
        output_proj_path = None
        if suggested_project_feedback:
            print("Saving project suggestion locally...")
            try:
                output_proj_filename = f"Chinmaya_Shah_Project_Suggestion_{safe_company_name}.txt"
                output_proj_path = os.path.abspath(os.path.join(OUTPUT_DIR, output_proj_filename))
                with open(output_proj_path, "w", encoding="utf-8") as proj_file:
                    proj_file.write(suggested_project_feedback)
                print(f"Saved Project Suggestion to: {output_proj_path}")
            except Exception as proj_ex:
                print(f"[WARNING] Saving project suggestion file failed: {proj_ex}")

        # 7. Save Cover Letter as TXT file locally
        output_cl_path = None
        if cover_letter:
            print("Saving cover letter locally...")
            try:
                output_cl_filename = f"Chinmaya_Shah_Cover_Letter_{safe_company_name}.txt"
                output_cl_path = os.path.abspath(os.path.join(OUTPUT_DIR, output_cl_filename))
                with open(output_cl_path, "w", encoding="utf-8") as cl_file:
                    cl_file.write(cover_letter)
                print(f"Saved Cover Letter to: {output_cl_path}")
            except Exception as cl_ex:
                print(f"[WARNING] Saving cover letter file failed: {cl_ex}")

        # 8. Upload & Send WhatsApp Notification
        print("Uploading & Sending WhatsApp Notification...")
        send_whatsapp_notification(
            job_title=title,
            company=company,
            apply_link=apply_link,
            pdf_path=output_pdf_path,
            docx_path=output_docx_path,
            cover_letter=cover_letter,
            project_suggestion=suggested_project_feedback
        )
        processed_urls.add(apply_link)
        save_processed_url(apply_link)
        return True
        
    except Exception as ex:
        print(f"Error processing job: {ex}")
        return False

def main():
    print("=== Automated Job Applier & Resume Tailor V3 (Resume Matcher Integrated) ===")
    
    if not os.path.exists(OUTPUT_DIR):
        os.makedirs(OUTPUT_DIR)

    # 1. Wait for backend to be online before proceeding
    if not wait_for_backend(API_BASE_URL):
        print("[ERROR] Resume Matcher backend did not start in time. Exiting.")
        return

    # 2. Sync/Upload Master Resume (will wait for manual upload if missing)
    master_resume_id = get_or_upload_master_resume()
    if not master_resume_id:
        print("Failed to resolve Master Resume. Exiting.")
        return

    # Fetch master resume details to preserve fields like certifications
    print("Fetching master resume details for preservation...")
    master_resume_data = {}
    try:
        master_res = requests.get(f"{API_BASE_URL}/resumes", params={"resume_id": master_resume_id}, timeout=5)
        if master_res.status_code == 200:
            master_resume_data = master_res.json().get("data", {}).get("processed_resume", {}) or master_res.json().get("data", {}).get("processed_data", {})
            print("Successfully loaded master resume details.")
        else:
            print(f"[WARNING] Could not fetch master resume details: {master_res.text}")
    except Exception as master_ex:
        print(f"[WARNING] Error fetching master resume details: {master_ex}")

    search_term = "Junior Backend Developer"
    location = "India"
    
    # Platforms to cycle through sequentially to prevent IP blocking
    PLATFORMS = ["naukri", "linkedin", "indeed", "google", "glassdoor", "zip_recruiter"]
    
    # List of target tech companies
    TARGET_COMPANIES = [
        {"name": "Google", "type": "search"},
        {"name": "Meta", "type": "search"},
        {"name": "Amazon", "type": "search"},
        {"name": "Apple", "type": "search"},
        {"name": "Netflix", "type": "search"},
        {"name": "Microsoft", "type": "search"},
        {"name": "Salesforce", "type": "search"},
        {"name": "Adobe", "type": "search"},
        {"name": "Oracle", "type": "search"},
        {"name": "Cisco", "type": "search"},
        {"name": "Intel", "type": "search"},
        {"name": "Nvidia", "type": "search"},
        {"name": "AMD", "type": "search"},
        {"name": "IBM", "type": "search"},
        {"name": "SAP", "type": "search"},
        {"name": "OpenAI", "type": "search"},
        {"name": "Anthropic", "type": "greenhouse", "token": "anthropic"},
        {"name": "xAI", "type": "greenhouse", "token": "xai"},
        {"name": "Perplexity", "type": "search"},
        {"name": "Cohere", "type": "search"},
        {"name": "Mistral", "type": "search"},
        {"name": "Hugging Face", "type": "search"},
        {"name": "Atlassian", "type": "search"},
        {"name": "Uber", "type": "search"},
        {"name": "Airbnb", "type": "greenhouse", "token": "airbnb"},
        {"name": "LinkedIn", "type": "search"},
        {"name": "Dropbox", "type": "greenhouse", "token": "dropbox"},
        {"name": "Stripe", "type": "search"},
        {"name": "Databricks", "type": "greenhouse", "token": "databricks"},
        {"name": "Snowflake", "type": "search"},
        {"name": "Palantir", "type": "search"},
        {"name": "Cloudflare", "type": "greenhouse", "token": "cloudflare"},
        {"name": "PayPal", "type": "search"},
        {"name": "Figma", "type": "greenhouse", "token": "figma"},
        {"name": "Vercel", "type": "greenhouse", "token": "vercel"}
    ]
    
    # Load processed URLs from persistent storage to prevent re-applying/re-processing
    processed_urls = load_processed_urls()
    print(f"Loaded {len(processed_urls)} previously processed URLs.")
    target_company_index = 0
    
    # Infinite loop for continuous platform scraping
    while True:
        print("\n=== Starting Platform Search Cycle ===")
        for platform in PLATFORMS:
            # Task 1: General search on current platform
            print(f"\n[CYCLE - GENERAL] Checking platform: {platform.upper()}...")
            jobs = fetch_jobs(site_name=platform, search_term=search_term, location=location, results_wanted=10)
            
            if jobs:
                processed_any = False
                for job in jobs:
                    if not is_fresher_job(job.get("title", ""), job.get("description", "")):
                        print(f"Skipping non-fresher/senior job: {job.get('title')} at {job.get('company')}")
                        continue
                    if process_job_posting(job, master_resume_id, master_resume_data, processed_urls):
                        processed_any = True
                        break
                if not processed_any:
                    print(f"All jobs in search results on {platform} have already been processed.")
            else:
                print(f"No general jobs found on {platform} in this pass.")
                
            # Random jitter sleep 30 to 55s to prevent detection
            sleep_time = random.randint(30, 55)
            print(f"Sleeping for {sleep_time} seconds to prevent search platform bot detection...")
            time.sleep(sleep_time)
            
            # Task 2: Rotational targeted company search
            company_info = TARGET_COMPANIES[target_company_index]
            company_name = company_info["name"]
            company_type = company_info["type"]
            
            print(f"\n[CYCLE - TARGETED] Checking company: {company_name.upper()}...")
            
            target_jobs = []
            if company_type == "greenhouse":
                # Direct Greenhouse API call (bypasses aggregator IP blocking)
                board_token = company_info["token"]
                target_jobs = fetch_jobs(site_name=f"greenhouse:{board_token}", search_term=search_term, location=location, results_wanted=10)
                # Set company name to actual company name
                for tj in target_jobs:
                    tj["company"] = company_name
            else:
                # Targeted search on the current aggregator platform
                company_search_term = f"{search_term} {company_name}"
                target_jobs = fetch_jobs(site_name=platform, search_term=company_search_term, location=location, results_wanted=10)
                
            if target_jobs:
                processed_any = False
                for job in target_jobs:
                    if not is_fresher_job(job.get("title", ""), job.get("description", "")):
                        print(f"Skipping non-fresher/senior target job: {job.get('title')} at {job.get('company')}")
                        continue
                    if process_job_posting(job, master_resume_id, master_resume_data, processed_urls):
                        processed_any = True
                        break
                if not processed_any:
                    print(f"All target jobs for {company_name} in this pass have already been processed.")
            else:
                print(f"No targeted jobs found for {company_name} in this pass.")
                
            # Increment and rotate target company index
            target_company_index = (target_company_index + 1) % len(TARGET_COMPANIES)
            
            # Random jitter sleep 30 to 55s
            sleep_time = random.randint(30, 55)
            print(f"Sleeping for {sleep_time} seconds before next cycle step...")
            time.sleep(sleep_time)
            
        print("\n[LOOP END] Cycle completed for all platforms. Sleeping for 15 minutes before starting next cycle...")
        time.sleep(900)

if __name__ == "__main__":
    main()
