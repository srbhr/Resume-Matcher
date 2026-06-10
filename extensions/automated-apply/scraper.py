import os
import random
import requests
import pandas as pd
from jobspy import scrape_jobs
from dotenv import load_dotenv
from markdownify import markdownify as md

load_dotenv()

# List of modern, realistic User-Agents to prevent bot detection
USER_AGENTS = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0) Gecko/20100101 Firefox/121.0",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0) Gecko/20100101 Firefox/122.0",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:109.0) Gecko/20100101 Firefox/121.0",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Safari/605.1.15",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.3 Safari/605.1.15"
]

def get_browser_headers():
    """
    Generates a full set of browser headers with a randomized User-Agent.
    """
    ua = random.choice(USER_AGENTS)
    headers = {
        "User-Agent": ua,
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7",
        "Accept-Language": "en-US,en;q=0.9",
        "Accept-Encoding": "gzip, deflate",
        "DNT": "1",
        "Connection": "keep-alive",
        "Upgrade-Insecure-Requests": "1"
    }
    return headers

def fetch_greenhouse_jobs(board_token, search_term="Backend Developer", location="India"):
    """
    Fetches job postings directly from Greenhouse's public board API.
    """
    print(f"Fetching Greenhouse jobs for board: '{board_token}' matching '{search_term}'...")
    url = f"https://boards-api.greenhouse.io/v1/boards/{board_token}/jobs?content=true"
    
    # Load proxies if configured
    proxies_env = os.getenv("SCRAPER_PROXIES")
    proxies = {}
    if proxies_env:
        proxy_list = [p.strip() for p in proxies_env.split(",") if p.strip()]
        if proxy_list:
            selected_proxy = random.choice(proxy_list)
            proxies = {"http": selected_proxy, "https": selected_proxy}
            print(f"Using proxy for Greenhouse API: {selected_proxy}")

    try:
        response = requests.get(url, headers=get_browser_headers(), proxies=proxies, timeout=10)
        if response.status_code != 200:
            print(f"[WARNING] Greenhouse API returned status {response.status_code} for board {board_token}")
            return []
            
        data = response.json()
        raw_jobs = data.get("jobs", [])
        
        # Parse search term into keywords
        keywords = [k.strip().lower() for k in search_term.replace(",", " ").split() if k.strip()]
        
        matched_jobs = []
        for rj in raw_jobs:
            title = rj.get("title", "")
            title_lower = title.lower()
            
            # Check if title matches all keywords (or at least one of the primary ones)
            # If search term has multiple words (e.g. "Backend Developer"), match both "backend" and "developer"
            # or "software engineer"
            is_match = False
            if keywords:
                # If there are keywords, require that the title matches at least one keyword (e.g. "backend" or "engineer" or "developer")
                # To be broad but relevant:
                primary_keywords = ["backend", "software", "engineer", "developer", "fullstack", "full-stack", "frontend"]
                title_keywords = [k for k in keywords if k in primary_keywords]
                if not title_keywords:
                    title_keywords = keywords # fallback to all keywords if none are in primary list
                
                is_match = any(tk in title_lower for tk in title_keywords)
            else:
                is_match = True
                
            if not is_match:
                continue
                
            loc_name = rj.get("location", {}).get("name", "")
            loc_lower = loc_name.lower()
            
            # Filter location if specified (e.g. "India" or "Remote")
            if location:
                loc_keywords = [lk.strip().lower() for lk in location.split(",") if lk.strip()]
                loc_match = any(lk in loc_lower for lk in loc_keywords) or "remote" in loc_lower
                if not loc_match:
                    continue
            
            # Map Greenhouse job to our unified schema
            job_url = rj.get("absolute_url", "")
            desc_html = rj.get("content", "")
            desc_md = md(desc_html).strip() if desc_html else ""
            
            matched_jobs.append({
                "id": f"gh-{rj.get('id')}",
                "site": f"greenhouse:{board_token}",
                "title": title,
                "company": board_token.capitalize(), # Will be overwritten by actual company mapping if needed
                "location": loc_name,
                "job_url": job_url,
                "description": desc_md
            })
            
        print(f"Greenhouse direct scan found {len(matched_jobs)} matching jobs for board '{board_token}'")
        return matched_jobs
        
    except Exception as e:
        print(f"[WARNING] Greenhouse scraping error for board {board_token}: {e}")
        return []

def fetch_naukri_jobs_stealth(search_term="Backend Developer", location="India", results_wanted=10):
    """
    Fetches job postings from Naukri.com using Playwright Stealth.
    Bypasses Cloudflare recaptcha blocks.
    """
    print(f"Scraping Naukri.com via Playwright Stealth for: {search_term} in {location}...")
    
    from playwright.sync_api import sync_playwright
    from playwright_stealth import Stealth
    
    # Map experience=0 for fresher
    # Format query for URL: e.g. "backend-developer-jobs-in-india?experience=0"
    query = search_term.lower().replace(" ", "-")
    loc_query = location.lower().replace(" ", "-")
    url = f"https://www.naukri.com/{query}-jobs-in-{loc_query}?experience=0"
    
    job_list = []
    
    try:
        with sync_playwright() as p:
            # Launch headless browser (using Chromium)
            headless_mode = os.getenv("SCRAPER_HEADLESS", "true").lower() == "true"
            browser = p.chromium.launch(headless=headless_mode)
            context = browser.new_context(
                viewport={"width": 1280, "height": 800},
                user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
            )
            page = context.new_page()
            
            # Apply stealth to browser context to bypass Cloudflare checks
            Stealth().apply_stealth_sync(page)
            
            # Navigate to URL
            print(f"Navigating to: {url}")
            page.goto(url, wait_until="load", timeout=30000)
            
            # Wait for content to hydrate
            page.wait_for_timeout(5000)
            
            print(f"Page title: {page.title()}")
            
            # Select job cards
            selectors = ["article.jobTuple", "div.srp-jobtuple", ".jobTuple", "article[data-job-id]", ".cust-job-tuple"]
            card_selector = None
            for sel in selectors:
                if page.locator(sel).count() > 0:
                    card_selector = sel
                    break
                    
            if not card_selector:
                print("[WARNING] Could not find any job card selectors on Naukri page. It might be blocked or layout changed.")
                browser.close()
                return []
                
            print(f"Extracting job cards using selector: '{card_selector}'")
            cards = page.locator(card_selector).all()
            
            for idx, card in enumerate(cards[:results_wanted]):
                try:
                    # Extract title
                    title_elem = card.locator("a.title")
                    if title_elem.count() == 0:
                        title_elem = card.locator(".title")
                    title = title_elem.inner_text().strip() if title_elem.count() > 0 else "Unknown Title"
                    job_url = title_elem.get_attribute("href") if title_elem.count() > 0 else ""
                    
                    # Extract company
                    company_elem = card.locator("a.comp-name")
                    if company_elem.count() == 0:
                        company_elem = card.locator(".comp-name")
                    if company_elem.count() == 0:
                        company_elem = card.locator(".subTitle")
                    company = company_elem.inner_text().strip() if company_elem.count() > 0 else "Unknown Company"
                    
                    # Extract location
                    loc_elem = card.locator("span.locWdth")
                    if loc_elem.count() == 0:
                        loc_elem = card.locator(".loc-wrap")
                    if loc_elem.count() == 0:
                        loc_elem = card.locator(".location")
                    loc = loc_elem.inner_text().strip() if loc_elem.count() > 0 else location
                    
                    # Extract description snippet
                    desc_elem = card.locator(".job-desc")
                    if desc_elem.count() == 0:
                        desc_elem = card.locator(".jobDescription")
                    if desc_elem.count() == 0:
                        desc_elem = card.locator(".job-description")
                    desc = desc_elem.inner_text().strip() if desc_elem.count() > 0 else ""
                    
                    # Extract job id
                    job_id = card.get_attribute("data-job-id") or f"nk-{idx}-{hash(job_url)}"
                    
                    job_list.append({
                        "id": job_id,
                        "site": "naukri",
                        "title": title,
                        "company": company,
                        "location": loc,
                        "job_url": job_url,
                        "description": desc
                    })
                except Exception as card_ex:
                    print(f"[WARNING] Skipping job card due to parsing error: {card_ex}")
                    
            browser.close()
            
    except Exception as ex:
        print(f"[ERROR] Playwright Naukri scraping failed: {ex}")
        
    print(f"Playwright stealth scraper found {len(job_list)} jobs on Naukri.com")
    return job_list

def fetch_jobs(site_name, search_term="Backend Developer", location="India", results_wanted=1):
    """
    Fetches job postings from a specific site (or list of sites).
    Supports Greenhouse board formats like 'greenhouse:board_token' directly.
    """
    # 1. Check if it's a Greenhouse API request
    if isinstance(site_name, str) and site_name.startswith("greenhouse:"):
        board_token = site_name.split(":", 1)[1]
        return fetch_greenhouse_jobs(board_token, search_term, location)
        
    # 2. Route Naukri requests to the stealth Playwright scraper
    if site_name == "naukri":
        return fetch_naukri_jobs_stealth(search_term, location, results_wanted)
        
    print(f"Scraping jobs from '{site_name}' for: {search_term} in {location}...")
    
    # Load proxies if configured in .env (comma-separated list)
    proxies_env = os.getenv("SCRAPER_PROXIES")
    proxies = [p.strip() for p in proxies_env.split(",")] if proxies_env else None
    if proxies:
        print(f"Using {len(proxies)} proxies for scraping...")
    
    # Wrap in list if single string
    sites = [site_name] if isinstance(site_name, str) else site_name
    
    try:
        jobs: pd.DataFrame = scrape_jobs(
            site_name=sites,
            search_term=search_term,
            location=location,
            results_wanted=results_wanted,
            country_indeed="india",
            linkedin_fetch_description=True,
            proxies=proxies
        )
    except Exception as e:
        print(f"[WARNING] Scraper encountered an error for {site_name}: {e}")
        return []
    
    print(f"Found {len(jobs)} jobs on {site_name}")
    
    # Return as a list of dictionaries for easier processing
    if jobs.empty:
        return []
    
    # Fill NaN values with empty string
    jobs = jobs.fillna("")
    
    job_list = []
    for _, row in jobs.iterrows():
        job_list.append({
            "id": row.get("id", ""),
            "site": row.get("site", ""),
            "title": row.get("title", ""),
            "company": row.get("company", ""),
            "location": row.get("location", ""),
            "job_url": row.get("job_url", ""),
            "description": row.get("description", "")
        })
        
    return job_list

if __name__ == "__main__":
    # Small test
    jobs = fetch_jobs(site_name="greenhouse:vercel", search_term="Engineer", location="Remote")
    for j in jobs[:2]:
        print(f"Title: {j['title']} | Company: {j['company']} | Link: {j['job_url']}")



