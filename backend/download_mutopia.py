# download_mutopia.py
import os
import requests
from bs4 import BeautifulSoup
from urllib.parse import urljoin
import zipfile
import io

BASE_URL = "http://www.mutopiaproject.org/ftp/"
OUTPUT_DIR = "mutopia_files"
visited_urls = set()

def scrape_and_download(url, current_path=""):
    """
    Recursively scrapes a URL, finds directories with both MIDI and LilyPond files,
    and downloads them.
    """
    if url in visited_urls:
        return
    
    visited_urls.add(url)
    print(f"Scraping: {url}")
    
    try:
        response = requests.get(url)
        response.raise_for_status()
        soup = BeautifulSoup(response.text, 'html.parser')

        links = [a['href'] for a in soup.find_all('a') if a.has_attr('href') and '?' not in a['href']]
        
        # --- CORRECTED LOGIC ---
        # 1. Check if the current directory page contains the files we need
        has_midi = any(link.endswith('.mid') for link in links)
        has_ly = any(link.endswith('.ly') for link in links)

        if has_midi and has_ly:
            print(f"  > Match found! Downloading files from {url}")
            local_dir = os.path.join(OUTPUT_DIR, current_path)
            os.makedirs(local_dir, exist_ok=True)
            
            # Download all relevant files from this directory
            for filename in links:
                if filename.endswith(('.mid', '.ly', '.ily', '.zip')):
                    file_url = urljoin(url, filename)
                    process_file(file_url, local_dir, filename)
        
        # 2. Separately, recurse into any subdirectories found on the page
        for dirname in links:
            if dirname.endswith('/') and dirname != '../':
                next_url = urljoin(url, dirname)
                if next_url.startswith(BASE_URL):
                    # Pass the correct new sub-path for the local directory
                    new_path = os.path.join(current_path, dirname)
                    scrape_and_download(next_url, new_path)
        # --- END OF CORRECTED LOGIC ---

    except requests.RequestException as e:
        print(f"Error fetching {url}: {e}")

def process_file(url, local_dir, filename):
    """
    Downloads a file. If it's a zip file, it extracts .ly/.ily files.
    Otherwise, it saves the file directly.
    """
    try:
        r = requests.get(url)
        r.raise_for_status()

        if filename.endswith(".zip"):
            print(f"    - Processing zip archive: {filename}")
            with zipfile.ZipFile(io.BytesIO(r.content)) as z:
                for member in z.namelist():
                    if member.endswith(('.ly', '.ily')):
                        z.extract(member, path=local_dir)
                        print(f"      - Extracted {member}")
        else: # It's a .ly, .ily, or .mid file
            with open(os.path.join(local_dir, filename), 'wb') as f:
                f.write(r.content)
            print(f"    - Downloaded {filename}")

    except requests.RequestException as e:
        print(f"    - Failed to download/process {filename}: {e}")
    except zipfile.BadZipFile:
        print(f"    - ERROR: Bad zip file encountered: {filename}")


if __name__ == "__main__":
    if not os.path.exists(OUTPUT_DIR):
        os.makedirs(OUTPUT_DIR)
    scrape_and_download(BASE_URL)
    print("\nDownload process complete.")