import urllib.request
import json
import sys

def search_github(q):
    url = f"https://api.github.com/search/repositories?q={q}"
    req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
    try:
        with urllib.request.urlopen(req) as response:
            data = json.loads(response.read().decode())
            print(f"--- GitHub: {q} ---")
            for item in data.get('items', [])[:2]:
                print(f"{item['full_name']}: {item['description']}")
    except Exception as e:
        print(f"Error {q}: {e}")

search_github("filepilot")
search_github("rush")
