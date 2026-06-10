import requests

def fetch_github_projects(username="Chinmaya-shah"):
    """
    Fetches public repositories for a given GitHub username.
    Returns a formatted string of projects and descriptions.
    """
    url = f"https://api.github.com/users/{username}/repos"
    print(f"Fetching GitHub projects for {username}...")
    try:
        response = requests.get(url, timeout=10)
        if response.status_code == 200:
            repos = response.json()
            project_list = []
            for repo in repos:
                # Filter out forks if you only want original projects
                if not repo['fork']:
                    name = repo['name']
                    desc = repo['description'] or "No description"
                    lang = repo['language'] or "Unknown"
                    url = repo['html_url']
                    project_list.append(f"Project Name: {name}\nDescription: {desc}\nTechnologies: {lang}\nLink: {url}\n")
            
            if not project_list:
                return "No public projects found."
            return "\n".join(project_list)
        else:
            print(f"Failed to fetch from GitHub: {response.status_code}")
            return "Could not fetch GitHub projects."
    except Exception as e:
        print(f"Error fetching GitHub projects: {e}")
        return "Could not fetch GitHub projects."

if __name__ == "__main__":
    projects = fetch_github_projects()
    print(projects)
