import json
import os
import sys

# Ne pas importer pywebview - utilise PyQt5 à la place
import bottle
import threading
import pathlib
import platform
import subprocess
import webbrowser
import re
import requests
from PIL import Image
import base64
from io import BytesIO
import win32gui
import win32ui
import win32con
import mimetypes
import ctypes
from ctypes import wintypes
from urllib.parse import urlparse, urljoin

SHORTCUTS_FILE = "shortcuts.json"
THEME_FILE = "theme.json"
CUSTOM_THEMES_FILE = "custom_themes.json"
FOLDER_ORDER_FILE = "folder_order.json"
DASHBOARD_LAYOUT_FILE = "dashboard_layout.json"
SETTINGS_FILE = "settings.json"
FOLDER_ICONS_FILE = "folder_icons.json"
RECENT_HISTORY_FILE = "recent_history.json"

# Small transparent placeholder (1x1 GIF) used when no valid icon is available
DEFAULT_ICON = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw=='

# Default settings
DEFAULT_SETTINGS = {
    "openUrlsInApp": True,
    "urlWindowWidth": 1200,
    "urlWindowHeight": 800,
    "urlWindowMinWidth": 600,
    "urlWindowMinHeight": 400,
    "urlWindowFullscreen": False,
    "forceUrlWindowSettings": False,
    "confirmBeforeDelete": True,
    "showDescriptions": True,
    "animationsEnabled": True,
    "autoSaveInterval": 30,
    "maxRecentItems": 10,
    "defaultShortcutType": "auto",
    "debugMode": False
}

def load_settings():
    """Load application settings"""
    if os.path.exists(SETTINGS_FILE):
        try:
            with open(SETTINGS_FILE, "r", encoding="utf-8") as f:
                settings = json.load(f)
                # Merge with defaults to ensure all keys exist
                return {**DEFAULT_SETTINGS, **settings}
        except (json.JSONDecodeError, UnicodeDecodeError):
            return DEFAULT_SETTINGS.copy()
    return DEFAULT_SETTINGS.copy()

def save_settings(settings):
    """Save application settings"""
    with open(SETTINGS_FILE, "w", encoding="utf-8") as f:
        json.dump(settings, f, indent=2, ensure_ascii=False)

def is_url(path):
    """Check if a path is a URL"""
    if not path:
        return False
    # Check for common URL patterns
    url_pattern = re.compile(
        r'^(https?://|ftp://|file://)'  # Common protocols
        r'|^www\.'  # www prefix
        r'|^[a-zA-Z0-9-]+\.[a-zA-Z]{2,}'  # domain.tld pattern
    )
    return bool(url_pattern.match(path))

# Cache pour les favicons
FAVICON_CACHE_FILE = "favicon_cache.json"
favicon_cache = {}

def load_favicon_cache():
    """Load favicon cache from file"""
    global favicon_cache
    if os.path.exists(FAVICON_CACHE_FILE):
        try:
            with open(FAVICON_CACHE_FILE, "r", encoding="utf-8") as f:
                favicon_cache = json.load(f)
        except:
            favicon_cache = {}
    return favicon_cache

def save_favicon_cache():
    """Save favicon cache to file"""
    try:
        with open(FAVICON_CACHE_FILE, "w", encoding="utf-8") as f:
            json.dump(favicon_cache, f)
    except Exception as e:
        print(f"Error saving favicon cache: {e}")

def get_favicon_for_url(url):
    """Fetch favicon for a website URL - improved version that gets the REAL favicon"""
    global favicon_cache
    
    try:
        # Normalize URL
        if not url.startswith(('http://', 'https://')):
            url = 'https://' + url
        
        parsed = urlparse(url)
        domain = parsed.netloc or parsed.path.split('/')[0]
        base_url = f"{parsed.scheme}://{domain}"
        url_path = parsed.path
        
        # Check memory cache first
        if domain in favicon_cache:
            return favicon_cache[domain]
        
        # Reload cache from file in case it was updated externally
        load_favicon_cache()
        if domain in favicon_cache:
            return favicon_cache[domain]
        
        # Extract root domain (for subdomains like xxx.example.com -> example.com)
        domain_parts = domain.split('.')
        root_domain = '.'.join(domain_parts[-2:]) if len(domain_parts) > 2 else domain
        
        headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        }
        
        # SPECIAL CASE: Pronote (very common French school system)
        # These subdomains have protected favicons, so use the demo site icon
        if 'index-education' in domain or 'pronote' in url.lower():
            pronote_icon_url = 'https://demo.index-education.net/pronote/images/apple-touch-icon.png'
            try:
                response = requests.get(pronote_icon_url, headers=headers, timeout=5, verify=False)
                if response.status_code == 200 and len(response.content) > 500:
                    img = Image.open(BytesIO(response.content))
                    if img.mode != 'RGBA':
                        img = img.convert('RGBA')
                    buffered = BytesIO()
                    img.save(buffered, format="PNG")
                    data_uri = f"data:image/png;base64,{base64.b64encode(buffered.getvalue()).decode()}"
                    favicon_cache[domain] = data_uri
                    save_favicon_cache()
                    print(f"[OK] Got Pronote favicon for {domain}")
                    return data_uri
            except Exception as e:
                print(f"Pronote favicon error: {e}")
        
        # STEP 1: Try to get favicon by parsing the HTML of the website
        icon_urls_from_html = []
        try:
            response = requests.get(url, headers=headers, timeout=8, verify=False)
            if response.status_code == 200:
                html = response.text
                # Look for link tags with rel containing "icon"
                patterns = [
                    r'<link[^>]+rel=["\'](?:apple-touch-icon|icon|shortcut icon)["\'][^>]+href=["\']([^"\']+)["\']',
                    r'<link[^>]+href=["\']([^"\']+)["\'][^>]+rel=["\'](?:apple-touch-icon|icon|shortcut icon)["\']',
                ]
                for pattern in patterns:
                    matches = re.findall(pattern, html, re.IGNORECASE)
                    for match in matches:
                        if match and match not in icon_urls_from_html:
                            icon_urls_from_html.append(match)
        except:
            pass
        
        # Build list of URLs to try
        urls_to_try = []
        
        # If we found icon URLs in HTML, add them first (resolved to absolute URLs)
        for icon_url in icon_urls_from_html:
            if icon_url.startswith('//'):
                resolved = 'https:' + icon_url
            elif icon_url.startswith('/'):
                resolved = base_url + icon_url
            elif icon_url.startswith('./'):
                # Relative to current path
                path_base = '/'.join(url_path.split('/')[:-1]) if '/' in url_path else ''
                resolved = base_url + path_base + icon_url[1:]
            elif not icon_url.startswith('http'):
                resolved = base_url + '/' + icon_url
            else:
                resolved = icon_url
            urls_to_try.append(resolved)
        
        # Add common favicon locations for the domain
        urls_to_try.extend([
            f"{base_url}/favicon.ico",
            f"{base_url}/favicon.png",
            f"{base_url}/apple-touch-icon.png",
            f"{base_url}/apple-touch-icon-precomposed.png",
        ])
        
        # If there's a path (like /pronote/), also try favicons relative to that path
        if url_path and '/' in url_path:
            path_dir = '/'.join(url_path.split('/')[:-1])
            if path_dir:
                urls_to_try.extend([
                    f"{base_url}{path_dir}/favicon.ico",
                    f"{base_url}{path_dir}/images/favicon.ico",
                    f"{base_url}{path_dir}/images/apple-touch-icon.png",
                ])
        
        # If subdomain, also try root domain
        if root_domain != domain:
            root_base = f"https://www.{root_domain}"
            urls_to_try.extend([
                f"{root_base}/favicon.ico",
                f"{root_base}/favicon.png",
                f"{root_base}/apple-touch-icon.png",
            ])
        
        # Try each URL
        for fav_url in urls_to_try:
            try:
                response = requests.get(fav_url, headers=headers, timeout=5, verify=False)
                if response.status_code == 200 and len(response.content) > 200:
                    content_type = response.headers.get('content-type', '')
                    if 'image' in content_type or 'icon' in content_type or fav_url.endswith(('.ico', '.png', '.jpg', '.gif', '.svg')):
                        try:
                            img = Image.open(BytesIO(response.content))
                            # Ensure it's a real image (not a placeholder)
                            if img.size[0] >= 16 and img.size[1] >= 16:
                                if img.size[0] < 64:
                                    img = img.resize((64, 64), Image.Resampling.LANCZOS)
                                if img.mode != 'RGBA':
                                    img = img.convert('RGBA')
                                buffered = BytesIO()
                                img.save(buffered, format="PNG")
                                data_uri = f"data:image/png;base64,{base64.b64encode(buffered.getvalue()).decode()}"
                                favicon_cache[domain] = data_uri
                                save_favicon_cache()
                                print(f"[OK] Got favicon for {domain} from {fav_url}")
                                return data_uri
                        except Exception as e:
                            continue
            except:
                continue
        
        # STEP 2: Try DuckDuckGo instant answer API for icon
        try:
            ddg_url = f"https://icons.duckduckgo.com/ip3/{domain}.ico"
            response = requests.get(ddg_url, headers=headers, timeout=5)
            if response.status_code == 200 and len(response.content) > 500:
                img = Image.open(BytesIO(response.content))
                if img.size[0] >= 16:
                    if img.size[0] < 64:
                        img = img.resize((64, 64), Image.Resampling.LANCZOS)
                    if img.mode != 'RGBA':
                        img = img.convert('RGBA')
                    buffered = BytesIO()
                    img.save(buffered, format="PNG")
                    data_uri = f"data:image/png;base64,{base64.b64encode(buffered.getvalue()).decode()}"
                    favicon_cache[domain] = data_uri
                    save_favicon_cache()
                    print(f"[OK] Got favicon for {domain} from DuckDuckGo")
                    return data_uri
        except:
            pass
        
        # STEP 3: Last resort - use Google Favicons (but only accept if it's big enough)
        google_url = f"https://www.google.com/s2/favicons?domain={root_domain}&sz=128"
        try:
            response = requests.get(google_url, headers=headers, timeout=5)
            if response.status_code == 200 and len(response.content) > 500:
                img = Image.open(BytesIO(response.content))
                if img.size[0] >= 32:  # Google returns 16x16 for unknown sites
                    if img.mode != 'RGBA':
                        img = img.convert('RGBA')
                    buffered = BytesIO()
                    img.save(buffered, format="PNG")
                    data_uri = f"data:image/png;base64,{base64.b64encode(buffered.getvalue()).decode()}"
                    favicon_cache[domain] = data_uri
                    save_favicon_cache()
                    print(f"[OK] Got favicon for {domain} from Google")
                    return data_uri
        except:
            pass
        
        # Nothing found
        print(f"[MISS] No favicon found for {domain}")
        return None
        
    except Exception as e:
        print(f"Error fetching favicon for {url}: {e}")
        return None

def get_shortcut_type(shortcut):
    """Determine the type of a shortcut: 'url', 'file', 'folder', or 'command'"""
    path = shortcut.get('path', '')
    explicit_type = shortcut.get('type')
    
    if explicit_type:
        return explicit_type
    
    if is_url(path):
        return 'url'
    elif os.path.isdir(path):
        return 'folder'
    elif os.path.isfile(path):
        return 'file'
    else:
        return 'command'

def load_shortcuts():
    if os.path.exists(SHORTCUTS_FILE):
        try:
            with open(SHORTCUTS_FILE, "r", encoding="utf-8") as f:
                return json.load(f)
        except json.JSONDecodeError:
            return []
    return []

def save_shortcuts(shortcuts):
    with open(SHORTCUTS_FILE, "w", encoding="utf-8") as f:
        json.dump(shortcuts, f, indent=2, ensure_ascii=False)

def load_theme():
    if os.path.exists(THEME_FILE):
        try:
            with open(THEME_FILE, "r", encoding="utf-8") as f:
                return json.load(f)
        except json.JSONDecodeError:
            return None
    return None

def save_theme(theme):
    with open(THEME_FILE, "w", encoding="utf-8") as f:
        json.dump(theme, f, indent=2, ensure_ascii=False)

def load_custom_themes():
    if os.path.exists(CUSTOM_THEMES_FILE):
        try:
            with open(CUSTOM_THEMES_FILE, "r", encoding="utf-8") as f:
                return json.load(f)
        except json.JSONDecodeError:
            return []
    return []

def save_custom_themes(themes):
    with open(CUSTOM_THEMES_FILE, "w", encoding="utf-8") as f:
        json.dump(themes, f, indent=2, ensure_ascii=False)

def load_folder_order():
    # Debug logs disabled for production
    if os.path.exists(FOLDER_ORDER_FILE):
        try:
            with open(FOLDER_ORDER_FILE, "r", encoding="utf-8") as f:
                data = json.load(f)
                return data
        except UnicodeDecodeError as e:
            # Recreate file on encoding error
            with open(FOLDER_ORDER_FILE, "w", encoding="utf-8") as f:
                json.dump({}, f)
            return {}
        except json.JSONDecodeError:
            return {}
    # Create file if not exists
    with open(FOLDER_ORDER_FILE, "w", encoding="utf-8") as f:
        json.dump({}, f)
    return {}

def save_folder_order(folder_order):
    with open(FOLDER_ORDER_FILE, "w", encoding="utf-8") as f:
        json.dump(folder_order, f, indent=2, ensure_ascii=False)

# Folder icons management
def load_folder_icons():
    """Load folder icons from file"""
    if os.path.exists(FOLDER_ICONS_FILE):
        try:
            with open(FOLDER_ICONS_FILE, "r", encoding="utf-8") as f:
                return json.load(f)
        except:
            return {}
    return {}

def save_folder_icons(folder_icons):
    """Save folder icons to file"""
    with open(FOLDER_ICONS_FILE, "w", encoding="utf-8") as f:
        json.dump(folder_icons, f, indent=2, ensure_ascii=False)

def load_dashboard_layout():
    """Load the dashboard layout configuration (legacy - root only)"""
    if os.path.exists(DASHBOARD_LAYOUT_FILE):
        try:
            with open(DASHBOARD_LAYOUT_FILE, "r", encoding="utf-8") as f:
                return json.load(f)
        except (json.JSONDecodeError, UnicodeDecodeError):
            return []
    return []

def save_dashboard_layout(layout):
    """Save the dashboard layout configuration (legacy - root only)"""
    with open(DASHBOARD_LAYOUT_FILE, "w", encoding="utf-8") as f:
        json.dump(layout, f, indent=2, ensure_ascii=False)

# New per-folder dashboard layouts
ALL_LAYOUTS_FILE = "all_dashboard_layouts.json"

def load_all_dashboard_layouts():
    """Load all dashboard layouts (per-folder)"""
    if os.path.exists(ALL_LAYOUTS_FILE):
        try:
            with open(ALL_LAYOUTS_FILE, "r", encoding="utf-8") as f:
                return json.load(f)
        except (json.JSONDecodeError, UnicodeDecodeError):
            return {}
    return {}

def save_all_dashboard_layouts(layouts):
    """Save all dashboard layouts (per-folder)"""
    with open(ALL_LAYOUTS_FILE, "w", encoding="utf-8") as f:
        json.dump(layouts, f, indent=2, ensure_ascii=False)

# Recent history management
def load_recent_history():
    """Load the list of recently opened shortcuts"""
    if os.path.exists(RECENT_HISTORY_FILE):
        try:
            with open(RECENT_HISTORY_FILE, "r", encoding="utf-8") as f:
                return json.load(f)
        except:
            return []
    return []

def save_recent_history(history):
    """Save the list of recently opened shortcuts"""
    with open(RECENT_HISTORY_FILE, "w", encoding="utf-8") as f:
        json.dump(history, f, indent=2, ensure_ascii=False)

def add_to_recent_history(shortcut_name, shortcut_path):
    """Add a shortcut to the recent history"""
    import time
    history = load_recent_history()
    settings = load_settings()
    max_items = settings.get('maxRecentItems', 10)
    
    # Remove if already exists
    history = [h for h in history if h.get('name') != shortcut_name]
    
    # Add to the beginning
    history.insert(0, {
        'name': shortcut_name,
        'path': shortcut_path,
        'timestamp': int(time.time() * 1000)
    })
    
    # Limit the size
    history = history[:max_items]
    
    save_recent_history(history)
    return history

class Api:
    def __init__(self):
        self.shortcuts = load_shortcuts()
        self.custom_themes = load_custom_themes()
        self.window = None  # Will be set after window creation
        # Load favicon cache
        load_favicon_cache()
        # Migrate old shortcuts from base64 to path-based if needed
        try:
            changed = False
            for i, sc in enumerate(self.shortcuts):
                # If shortcut has 'icon' field but no 'iconPath', migrate
                if 'icon' in sc and 'iconPath' not in sc:
                    # Remove the icon field and use path as iconPath
                    path = sc.get('path', '')
                    if path:
                        sc['iconPath'] = path
                        del sc['icon']
                        changed = True
            
            if changed:
                save_shortcuts(self.shortcuts)
        except Exception as e:
            print(f"Error migrating shortcuts: {e}")

    def _path_to_data_uri(self, path):
        try:
            if not os.path.exists(path):
                return None
            mime, _ = mimetypes.guess_type(path)
            if not mime:
                mime = 'application/octet-stream'
            with open(path, 'rb') as f:
                data = base64.b64encode(f.read()).decode()
                return f"data:{mime};base64,{data}"
        except Exception as e:
            print(f"Error converting path to data uri: {e}")
            return None

    def get_file_icon(self, file_path):
        """Extract icon from file and convert to base64.
        We extract at a large size then downscale with a high-quality filter to reduce pixelation.
        """
        """Extract icon from file and convert to base64.
        Try multiple extraction strategies (Shell SHGetFileInfo, then ExtractIconEx) and
        render the HICON to a bitmap at a large size, then downscale to improve quality.
        """
        # Wrap everything in try/except to prevent crashes
        hicon = None
        screen_dc_handle = None
        hdc = None
        memdc = None
        bmp = None
        oldbmp = None
        
        try:
            # Check if this is an image file - load it directly with PIL
            ext = os.path.splitext(file_path)[1].lower()
            if ext in ['.png', '.jpg', '.jpeg', '.gif', '.bmp', '.ico', '.webp']:
                try:
                    img = Image.open(file_path)
                    # Convert to RGBA if needed
                    if img.mode != 'RGBA':
                        img = img.convert('RGBA')
                    # Resize if too large (max 256x256 for icons)
                    if img.width > 256 or img.height > 256:
                        img.thumbnail((256, 256), Image.Resampling.LANCZOS)
                    buffered = BytesIO()
                    img.save(buffered, format="PNG")
                    return f"data:image/png;base64,{base64.b64encode(buffered.getvalue()).decode()}"
                except Exception as e:
                    print(f"Error loading image file {file_path}: {e}")
                    # Fall through to icon extraction
            
            # Extract the LARGEST icon available (up to 256x256)
            # Then upscale smoothly to 512x512 if needed
            final_size = 256  # Most Windows icons max out at 256x256
            
            hicon = None
            icon_size = 256  # Try to get the largest size

            # Use PrivateExtractIcons to get high-resolution icons
            try:
                # PrivateExtractIconsW can extract icons at any size
                large_icons = (wintypes.HICON * 1)()
                small_icons = (wintypes.HICON * 1)()
                
                # Try to extract at 256x256 (largest common size in modern executables)
                result = ctypes.windll.user32.PrivateExtractIconsW(
                    str(file_path),  # filename
                    0,               # icon index
                    icon_size,       # desired width
                    icon_size,       # desired height
                    large_icons,     # output array
                    None,            # icon IDs (not needed)
                    1,               # number of icons
                    0                # flags
                )
                
                if result > 0 and large_icons[0]:
                    hicon = large_icons[0]
                    print(f"Extracted {icon_size}x{icon_size} icon using PrivateExtractIcons")
            except Exception as e:
                print(f"PrivateExtractIcons failed for {file_path}: {e}")
                hicon = None

            # Fallback 1: Try ExtractIconEx (gets 32x32 or 48x48)
            if not hicon:
                try:
                    large, small = win32gui.ExtractIconEx(file_path, 0)
                    if large:
                        hicon = large[0]
                        icon_size = 48  # Large icons are typically 48x48
                    elif small:
                        hicon = small[0]
                        icon_size = 32
                    if hicon:
                        print(f"Extracted {icon_size}x{icon_size} icon using ExtractIconEx")
                except Exception as e:
                    print(f"ExtractIconEx failed for {file_path}: {e}")
                    hicon = None

            # Fallback 2: SHGetFileInfo (system icon cache, typically 32x32)
            if not hicon:
                try:
                    class SHFILEINFO(ctypes.Structure):
                        _fields_ = [
                            ("hIcon", wintypes.HICON),
                            ("iIcon", ctypes.c_int),
                            ("dwAttributes", wintypes.DWORD),
                            ("szDisplayName", wintypes.WCHAR * 260),
                            ("szTypeName", wintypes.WCHAR * 80),
                        ]

                    SHGFI_ICON = 0x000000100
                    SHGFI_LARGEICON = 0x000000000
                    shfi = SHFILEINFO()
                    res = ctypes.windll.shell32.SHGetFileInfoW(str(file_path), 0, ctypes.byref(shfi), ctypes.sizeof(shfi), SHGFI_ICON | SHGFI_LARGEICON)
                    if res:
                        hicon = shfi.hIcon
                        icon_size = 32
                        print(f"Extracted {icon_size}x{icon_size} icon using SHGetFileInfo")
                except Exception as e:
                    print(f"SHGetFileInfo failed for {file_path}: {e}")
                    hicon = None

            if not hicon:
                print(f"No icon extracted for {file_path}")
                return ""

            # Render HICON into a DIB via win32 at the extracted size
            try:
                # Acquire screen DC handle so we can release it later
                screen_dc_handle = win32gui.GetDC(0)
                hdc = win32ui.CreateDCFromHandle(screen_dc_handle)
                memdc = hdc.CreateCompatibleDC()

                bmp = win32ui.CreateBitmap()
                bmp.CreateCompatibleBitmap(hdc, icon_size, icon_size)
                oldbmp = memdc.SelectObject(bmp)

                # Fill with white background to avoid fully transparent images
                brush = win32gui.GetStockObject(win32con.WHITE_BRUSH)
                win32gui.FillRect(memdc.GetSafeHdc(), (0, 0, icon_size, icon_size), brush)

                # Draw icon into the DC at its native size
                win32gui.DrawIconEx(memdc.GetSafeHdc(), 0, 0, hicon, icon_size, icon_size, 0, 0, 0x0003)

                # Get bitmap bits and convert to PIL image
                bmpstr = bmp.GetBitmapBits(True)
                img = Image.frombuffer('RGBA', (icon_size, icon_size), bmpstr, 'raw', 'BGRA', 0, 1)

                # Keep at native size (no upscaling to avoid pixelation)
                # Modern browsers will handle the display scaling smoothly

                # Convert to PNG and return (cleanup in finally block)
                buffered = BytesIO()
                img.save(buffered, format="PNG")
                return f"data:image/png;base64,{base64.b64encode(buffered.getvalue()).decode()}"
            except Exception as e:
                print(f"Error rendering icon for {file_path}: {e}")
                import traceback
                traceback.print_exc()
                return ""
        except Exception as e:
            print(f"Error getting icon for {file_path}: {e}")
            import traceback
            traceback.print_exc()
            return ""
        finally:
            # Final cleanup to ensure we don't leak resources
            try:
                if hicon:
                    win32gui.DestroyIcon(hicon)
            except Exception:
                pass
            try:
                if oldbmp and memdc:
                    memdc.SelectObject(oldbmp)
            except Exception:
                pass
            try:
                if bmp:
                    hbmp = int(bmp.GetHandle())
                    if hbmp:
                        win32gui.DeleteObject(hbmp)
            except Exception:
                pass
            try:
                if memdc:
                    memdc.DeleteDC()
            except Exception:
                pass
            try:
                if hdc:
                    hdc.DeleteDC()
            except Exception:
                pass
            try:
                if screen_dc_handle:
                    win32gui.ReleaseDC(0, screen_dc_handle)
            except Exception:
                pass

    def getShortcuts(self):
        try:
            # Return shortcuts with icon paths (not base64)
            return self.shortcuts
        except Exception as e:
            print(f"Erreur dans getShortcuts: {e}")
            return []
    
    def getIconForPath(self, file_path):
        """Extract and return icon as data URI for a given path or URL"""
        try:
            if not file_path:
                return DEFAULT_ICON
            
            # Check if it's a URL - fetch favicon
            if is_url(file_path):
                favicon = get_favicon_for_url(file_path)
                if favicon:
                    return favicon
                # Return a default web icon if favicon fetch fails
                return DEFAULT_ICON
            
            # Regular file path
            if not os.path.exists(file_path):
                return DEFAULT_ICON
            icon = self.get_file_icon(file_path)
            return icon if icon else DEFAULT_ICON
        except Exception as e:
            print(f"Error extracting icon for {file_path}: {e}")
            return DEFAULT_ICON
    
    def refreshFavicon(self, url):
        """Force refresh favicon for a URL (clear cache and re-fetch)"""
        global favicon_cache
        try:
            if not url.startswith(('http://', 'https://')):
                url = 'https://' + url
            parsed = urlparse(url)
            domain = parsed.netloc or parsed.path.split('/')[0]
            
            # Remove from cache
            if domain in favicon_cache:
                del favicon_cache[domain]
                save_favicon_cache()
            
            # Fetch fresh
            return get_favicon_for_url(url)
        except Exception as e:
            print(f"Error refreshing favicon: {e}")
            return DEFAULT_ICON

    def getTheme(self):
        return load_theme()

    def saveTheme(self, theme):
        save_theme(theme)
        # Update window title dynamically if changed
        if self.window:
            new_title = theme.get('appName', '') or 'Gestionnaire de raccourcis'
            try:
                self.window.set_title(new_title)
            except Exception as e:
                print(f"Could not update window title: {e}")
        return True

    def getCustomThemes(self):
        return self.custom_themes

    def saveCustomTheme(self, theme):
        self.custom_themes.append(theme)
        save_custom_themes(self.custom_themes)
        return True
    
    def deleteCustomTheme(self, index):
        """Delete a custom theme by index"""
        try:
            if 0 <= index < len(self.custom_themes):
                del self.custom_themes[index]
                save_custom_themes(self.custom_themes)
                return True
            return False
        except Exception as e:
            print(f"Error deleting custom theme: {e}")
            return False
    
    def renameCustomTheme(self, index, new_name):
        """Rename a custom theme by index"""
        try:
            if 0 <= index < len(self.custom_themes):
                self.custom_themes[index]['name'] = new_name
                save_custom_themes(self.custom_themes)
                return True
            return False
        except Exception as e:
            print(f"Error renaming custom theme: {e}")
            return False
    
    def getFolderOrder(self):
        """Get the folder order configuration"""
        return load_folder_order()
    
    def saveFolderOrder(self, folder_order):
        """Save the folder order configuration"""
        save_folder_order(folder_order)
        return True
    
    def saveItemsOrder(self, folder, items_order):
        """Save the order of items for a specific folder.
        folder: string (empty string for root)
        items_order: list of item identifiers in order
        """
        all_orders = load_folder_order()
        all_orders[folder] = items_order
        save_folder_order(all_orders)
        return True
    
    def getItemsOrder(self, folder):
        """Get the order of items for a specific folder"""
        all_orders = load_folder_order()
        return all_orders.get(folder, [])

    def getDashboardLayout(self):
        """Get the dashboard layout configuration (legacy - root only)"""
        return load_dashboard_layout()
    
    def saveDashboardLayout(self, layout):
        """Save the dashboard layout configuration (legacy - root only)"""
        save_dashboard_layout(layout)
        return True
    
    def getAllDashboardLayouts(self):
        """Get all dashboard layouts (per-folder)"""
        return load_all_dashboard_layouts()
    
    def saveAllDashboardLayouts(self, layouts):
        """Save all dashboard layouts (per-folder)"""
        save_all_dashboard_layouts(layouts)
        return True

    def getFolderIcons(self):
        """Get all folder icons"""
        return load_folder_icons()
    
    def saveFolderIcon(self, folderPath, iconData):
        """Save an icon for a specific folder"""
        icons = load_folder_icons()
        icons[folderPath] = iconData
        save_folder_icons(icons)
        return True
    
    def deleteFolderIcon(self, folderPath):
        """Delete an icon for a specific folder"""
        icons = load_folder_icons()
        if folderPath in icons:
            del icons[folderPath]
            save_folder_icons(icons)
        return True
    
    def renameFolderIcon(self, oldPath, newPath):
        """Rename a folder icon when folder is renamed"""
        icons = load_folder_icons()
        if oldPath in icons:
            icons[newPath] = icons[oldPath]
            del icons[oldPath]
            save_folder_icons(icons)
        return True

    def browseFile(self, file_types=None):
        """Open a file dialog to browse for a file with optional filter"""
        try:
            # Build file type tuples for the dialog
            if file_types:
                # file_types is a list like ['*.ico', '*.png', '*.jpg']
                file_types_str = ';'.join(file_types)
                dialog_file_types = (f'Images ({file_types_str})', file_types_str)
            else:
                dialog_file_types = ('All files (*.*)', '*.*')
            
            import tkinter as tk
            from tkinter import filedialog
            root = tk.Tk()
            root.withdraw()
            root.attributes('-topmost', True)
            result = filedialog.askopenfilename(
                filetypes=[dialog_file_types, ('All files', '*.*')]
            )
            root.destroy()
            return result if result else None
        except Exception as e:
            print(f"Error in browse file dialog: {e}")
            return None

    def pickFile(self):
        try:
            import tkinter as tk
            from tkinter import filedialog
            root = tk.Tk()
            root.withdraw()
            root.attributes('-topmost', True)
            result = filedialog.askopenfilename()
            root.destroy()
            if result:
                file_path = result
                # Don't extract icon here, just return the path
                return {
                    'path': file_path,
                    'iconPath': file_path  # Store exe path for icon extraction
                }
            return None
        except Exception as e:
            print(f"Error in file dialog: {e}")
            return None

    def pickIcon(self):
        """Pick a custom icon file and return its path and preview data"""
        try:
            import tkinter as tk
            from tkinter import filedialog
            root = tk.Tk()
            root.withdraw()
            root.attributes('-topmost', True)
            result = filedialog.askopenfilename(
                filetypes=[('Image Files', '*.png;*.jpg;*.ico'), ('All files', '*.*')]
            )
            root.destroy()
            if result:
                icon_path = result
                # Return both the path and preview data
                icon_data = self.get_file_icon(icon_path)
                return {
                    'iconPath': icon_path,
                    'preview': icon_data
                }
            return None
        except Exception as e:
            print(f"Error in pickIcon: {e}")
            return None

    def addShortcut(self, data):
        # Store the executable path for icon extraction, not the base64
        path = data.get('path', '')
        # Support both old 'folder' and new 'folders' format
        folders = data.get('folders')
        if folders is None:
            folder = data.get('folder', '')
            folders = [folder] if folder else ['']
        shortcut = {
            'name': data.get('name', ''),
            'path': path,
            'iconPath': data.get('iconPath') or path,  # Use custom icon path or exe path
            'description': data.get('description', ''),
            'folders': folders,  # Multi-folder support
            'type': data.get('type') or get_shortcut_type({'path': path}),  # Auto-detect type
            'openInApp': data.get('openInApp', True)  # For URLs: open in app window
        }
        self.shortcuts.append(shortcut)
        save_shortcuts(self.shortcuts)
        return self.shortcuts

    def openShortcut(self, path, openInApp=None, name=None):
        """Open a shortcut. For URLs, can open in app window or browser."""
        try:
            settings = load_settings()
            
            # Record in recent history
            if name:
                add_to_recent_history(name, path)
            
            # Find the shortcut to get automation actions
            shortcut = None
            if name:
                shortcut = next((s for s in self.shortcuts if s.get('name') == name), None)
            
            if is_url(path):
                # Normalize URL
                if not path.startswith(('http://', 'https://', 'ftp://', 'file://')):
                    path = 'https://' + path
                
                # Determine if we should open in app
                should_open_in_app = openInApp if openInApp is not None else settings.get('openUrlsInApp', True)
                
                if should_open_in_app:
                    # Open in a new pywebview window (pass automation actions)
                    automation_actions = shortcut.get('automationActions', []) if shortcut else []
                    return self._open_url_in_window(path, settings, name, automation_actions)
                else:
                    # Open in default browser
                    webbrowser.open(path)
                    return {'success': True, 'method': 'browser'}
            else:
                # Regular file/folder - use START command to truly detach the process
                if path.lower().endswith('.exe'):
                    # Use cmd /c start to launch completely detached
                    work_dir = os.path.dirname(path) if os.path.isfile(path) else None
                    subprocess.Popen(
                        f'cmd /c start "" "{path}"',
                        shell=True,
                        cwd=work_dir,
                        creationflags=subprocess.CREATE_NO_WINDOW
                    )
                else:
                    # For folders and other files, use startfile
                    os.startfile(path)
                return {'success': True, 'method': 'startfile'}
        except Exception as e:
            print(f"Error opening shortcut: {e}")
            return {'success': False, 'error': str(e)}
    
    def _open_url_in_window(self, url, settings, name=None, automation_actions=None):
        """Open a URL in a new pywebview window with persistent storage"""
        try:
            # Load theme to get per-theme URL window settings
            theme = load_theme()
            
            # Check if we should force global settings or use theme settings
            force_global = settings.get('forceUrlWindowSettings', False)
            
            if force_global:
                # Use global settings
                width = settings.get('urlWindowWidth', 1200)
                height = settings.get('urlWindowHeight', 800)
                fullscreen = settings.get('urlWindowFullscreen', False)
            else:
                # Use theme settings if available, fallback to global
                width = theme.get('themeUrlWindowWidth', settings.get('urlWindowWidth', 1200))
                height = theme.get('themeUrlWindowHeight', settings.get('urlWindowHeight', 800))
                fullscreen = theme.get('themeUrlWindowFullscreen', settings.get('urlWindowFullscreen', False))
            
            min_width = settings.get('urlWindowMinWidth', 600)
            min_height = settings.get('urlWindowMinHeight', 400)
            
            # Encoder les actions d'automatisation en base64
            automation_arg = ''
            if automation_actions:
                import base64 as b64
                automation_json = json.dumps(automation_actions)
                automation_arg = b64.b64encode(automation_json.encode('utf-8')).decode('utf-8')
            
            # Use separate Python subprocess for persistent storage
            script_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'url_window.py')

            # Prepare command (arguments passed via shortcut)
            args = [
                '"' + script_path + '"',
                '"' + url + '"',
                str(width),
                str(height),
                str(min_width),
                str(min_height),
                str(fullscreen),
                '"' + (name or '') + '"',
                '"' + automation_arg + '"'
            ]

            # On Windows, create .lnk in Start Menu pointing to python.exe + args
            try:
                if platform.system().lower() == 'windows':
                    try:
                        from windows_shortcuts import create_shortcut
                    except Exception:
                        create_shortcut = None

                    # Generate AppID based on domain for consistency
                    parsed = urlparse(url)
                    safe_domain = (parsed.netloc or 'site').replace(':', '_').replace('.', '_')
                    appid = f"Perso.Raccourci.{safe_domain}"

                    # Reconstituer la argument string (escape inner quotes)
                    argstr = ' '.join(args) + ' "' + appid + '"'

                    # Chercher une icÃ´ne dÃ©jÃ  tÃ©lÃ©chargÃ©e
                    app_dir = os.path.dirname(os.path.abspath(__file__))
                    icon_path = os.path.join(app_dir, 'webview_data', 'site_icons', f"{safe_domain}.ico")
                    if not os.path.exists(icon_path):
                        icon_path = ''

                    if create_shortcut:
                        lnk_name = name or safe_domain
                        exe_dir = os.path.dirname(sys.executable)
                        pythonw = os.path.join(exe_dir, 'pythonw.exe')
                        work_dir = os.path.dirname(os.path.abspath(__file__))

                        # If pythonw exists, use it so no console appears. Otherwise create a VBS wrapper
                        if os.path.exists(pythonw):
                            target = pythonw
                            lnk_path = create_shortcut(lnk_name, target, argstr, icon_path, work_dir, appid)
                        else:
                            # Create a small VBS that runs the desired command hidden via wscript
                            try:
                                from windows_shortcuts import get_start_menu_dir
                                start_dir = get_start_menu_dir() or work_dir
                            except Exception:
                                start_dir = work_dir

                            vbs_name = re.sub(r"[\\/:*?\"<>|]", "", lnk_name) if lnk_name else 'launcher'
                            vbs_path = os.path.join(start_dir, f"{vbs_name}_launcher.vbs")
                            # Build the command to run: use sys.executable and the args string
                            full_cmd = '"' + sys.executable + '" ' + argstr
                            vbs_content = f'Set WshShell = CreateObject("WScript.Shell")\nWshShell.Run "{full_cmd}", 0, False\n'
                            try:
                                with open(vbs_path, 'w', encoding='utf-8') as f:
                                    f.write(vbs_content)
                                wscript = os.path.join(os.environ.get('WINDIR', r'C:\Windows'), 'System32', 'wscript.exe')
                                if not os.path.exists(wscript):
                                    wscript = 'wscript.exe'
                                # Shortcut target is wscript.exe and argument is the vbs path
                                lnk_path = create_shortcut(lnk_name, wscript, '"' + vbs_path + '"', icon_path, work_dir)
                            except Exception as e:
                                print(f"Failed to create VBS wrapper: {e}")

                        # Lancer le raccourci via shell (ouvre la cible)
                        try:
                            os.startfile(lnk_path)
                            return {'success': True, 'method': 'shortcut', 'lnk': lnk_path}
                        except Exception as e:
                            print(f"Failed to launch shortcut {lnk_path}: {e}")

            except Exception as e:
                print(f"Windows shortcut fallback failed: {e}")

            # Fallback: launch script directly with cmd /c start to fully detach
            cmd = [
                sys.executable,
                script_path,
                url,
                str(width),
                str(height),
                str(min_width),
                str(min_height),
                str(fullscreen),
                name or ''  # Passer le nom du raccourci
            ]
            # Use cmd /c start to truly detach the process
            cmd_str = ' '.join(f'"{c}"' for c in cmd)
            subprocess.Popen(
                f'cmd /c start "" {cmd_str}',
                shell=True,
                creationflags=subprocess.CREATE_NO_WINDOW
            )
            return {'success': True, 'method': 'window', 'url': url}
        except Exception as e:
            print(f"Error opening URL in window: {e}")
            # Fallback to browser
            webbrowser.open(url)
            return {'success': True, 'method': 'browser_fallback', 'error': str(e)}

    def getSettings(self):
        """Get application settings"""
        return load_settings()
    
    def saveSettings(self, settings):
        """Save application settings"""
        try:
            save_settings(settings)
            return True
        except Exception as e:
            print(f"Error saving settings: {e}")
            return False
    
    def openDevTools(self):
        """Open browser developer tools (only in debug mode)"""
        settings = load_settings()
        if settings.get('debugMode', False):
            if self.window:
                try:
                    # pywebview >= 4.0
                    self.window.evaluate_js('console.log("DevTools requested")')
                    # Try to open dev tools - this works with EdgeChromium
                    import ctypes
                    # Send F12 to the window
                    hwnd = ctypes.windll.user32.GetForegroundWindow()
                    VK_F12 = 0x7B
                    WM_KEYDOWN = 0x0100
                    WM_KEYUP = 0x0101
                    ctypes.windll.user32.PostMessageW(hwnd, WM_KEYDOWN, VK_F12, 0)
                    ctypes.windll.user32.PostMessageW(hwnd, WM_KEYUP, VK_F12, 0)
                    return True
                except Exception as e:
                    print(f"Error opening DevTools: {e}")
                    return False
        return False
    
    def getRecentHistory(self):
        """Get the list of recently opened shortcuts"""
        return load_recent_history()
    
    def clearRecentHistory(self):
        """Clear the recent history"""
        save_recent_history([])
        return True
    
    def getShortcutType(self, path):
        """Get the type of a path (url, file, folder, command)"""
        return get_shortcut_type({'path': path})

    def openSelectorPicker(self, url, previous_actions=None):
        """Open a URL in a special window for CSS selector picking.
        Runs in a thread to avoid blocking the UI."""
        print(f"[SelectorPicker] openSelectorPicker called with URL: {url}", file=sys.stderr)
        print(f"[SelectorPicker] Previous actions count: {len(previous_actions) if previous_actions else 0}", file=sys.stderr)
        sys.stderr.flush()
        
        try:
            if not url.startswith(('http://', 'https://')):
                url = 'https://' + url
            
            # Get the path to selector_picker.py
            script_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'selector_picker.py')
            
            # Prepare arguments
            args = [sys.executable, script_path, url]
            
            # Add previous actions if present
            if previous_actions and len(previous_actions) > 0:
                actions_json = json.dumps(previous_actions, ensure_ascii=True)
                args.append(actions_json)
                print(f"[SelectorPicker] Actions count: {len(previous_actions)}", file=sys.stderr)
                for i, act in enumerate(previous_actions):
                    print(f"[SelectorPicker] Action {i}: {act.get('type')} {act.get('selector', '')[:50]}", file=sys.stderr)
            
            print(f"[SelectorPicker] Script path: {script_path}", file=sys.stderr)
            print(f"[SelectorPicker] Python: {sys.executable}", file=sys.stderr)
            sys.stderr.flush()
            
            # Create result holder
            result = {'success': False, 'error': 'Process not started'}
            
            def run_subprocess():
                nonlocal result
                try:
                    # Use CREATE_NEW_CONSOLE on Windows so the picker window is visible
                    creationflags = 0
                    if platform.system().lower() == 'windows':
                        creationflags = subprocess.CREATE_NEW_CONSOLE
                    
                    print(f"[SelectorPicker] Launching subprocess...", file=sys.stderr)
                    sys.stderr.flush()
                    
                    process = subprocess.Popen(
                        args,
                        stdout=subprocess.PIPE,
                        stderr=subprocess.PIPE,
                        text=True,
                        encoding='utf-8',
                        errors='replace',
                        creationflags=creationflags
                    )
                    
                    print(f"[SelectorPicker] Subprocess PID: {process.pid}", file=sys.stderr)
                    sys.stderr.flush()
                    
                    # Wait for process with timeout
                    stdout, stderr = process.communicate(timeout=300)
                    
                    print(f"[SelectorPicker] Process finished, returncode: {process.returncode}", file=sys.stderr)
                    
                    # Log relevant stderr
                    if stderr:
                        for line in stderr.split('\n'):
                            if '[SelectorPicker]' in line:
                                print(f"  {line}", file=sys.stderr)
                    
                    if process.returncode == 0 and stdout:
                        selector = stdout.strip()
                        print(f"[SelectorPicker] SUCCESS - selector: {selector}", file=sys.stderr)
                        result = {'success': True, 'selector': selector}
                    else:
                        print(f"[SelectorPicker] FAILED - returncode={process.returncode}", file=sys.stderr)
                        result = {'success': False, 'error': 'No element selected'}
                    
                    sys.stderr.flush()
                    
                except subprocess.TimeoutExpired:
                    process.kill()
                    print(f"[SelectorPicker] TIMEOUT", file=sys.stderr)
                    result = {'success': False, 'error': 'Timeout - window closed'}
                except Exception as e:
                    print(f"[SelectorPicker] EXCEPTION: {e}", file=sys.stderr)
                    import traceback
                    traceback.print_exc(file=sys.stderr)
                    result = {'success': False, 'error': str(e)}
            
            # Run in thread to not block the UI initially, but we still wait for result
            # This ensures the JS caller gets the result back
            thread = threading.Thread(target=run_subprocess)
            thread.start()
            thread.join(timeout=310)  # Wait for thread to complete
            
            if thread.is_alive():
                print(f"[SelectorPicker] Thread still running after timeout", file=sys.stderr)
                return {'success': False, 'error': 'Timeout'}
            
            return result
                
        except Exception as e:
            print(f"[SelectorPicker] EXCEPTION in main: {e}", file=sys.stderr)
            import traceback
            traceback.print_exc(file=sys.stderr)
            return {'success': False, 'error': str(e)}

    def openActionRecorder(self, url, existing_actions=None):
        """Open Action Recorder to interactively record automation actions.
        Returns the recorded actions as a list."""
        print(f"[ActionRecorder] openActionRecorder called with URL: {url}", file=sys.stderr)
        sys.stderr.flush()
        
        try:
            if not url.startswith(('http://', 'https://')):
                url = 'https://' + url
            
            script_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'action_recorder.py')
            python_exe = r"D:\malo\truc_technique\.taf\code\Python\python.exe"
            args = [python_exe, script_path, url]
            
            if existing_actions and len(existing_actions) > 0:
                args.append(json.dumps(existing_actions, ensure_ascii=True))
            
            print(f"[ActionRecorder] Launching: {args}", file=sys.stderr)
            sys.stderr.flush()
            
            # Créer des flags pour un processus complètement séparé
            creationflags = subprocess.CREATE_NEW_PROCESS_GROUP | subprocess.DETACHED_PROCESS
            
            # Lancer le processus
            process = subprocess.Popen(
                args,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True,
                encoding='utf-8',
                errors='replace',
                creationflags=creationflags
            )
            
            stdout, stderr = process.communicate(timeout=600)
            
            print(f"[ActionRecorder] returncode: {process.returncode}", file=sys.stderr)
            print(f"[ActionRecorder] stderr: {stderr[:500] if stderr else 'none'}", file=sys.stderr)
            print(f"[ActionRecorder] stdout: {stdout[:200] if stdout else 'none'}", file=sys.stderr)
            sys.stderr.flush()
            
            if process.returncode == 0 and stdout:
                stdout = stdout.strip()
                if stdout and stdout != 'CANCELLED':
                    try:
                        actions = json.loads(stdout)
                        print(f"[ActionRecorder] SUCCESS - {len(actions)} actions", file=sys.stderr)
                        return {'success': True, 'actions': actions}
                    except json.JSONDecodeError as e:
                        print(f"[ActionRecorder] JSON error: {e}", file=sys.stderr)
                        return {'success': False, 'actions': [], 'error': 'Invalid response'}
            
            return {'success': False, 'actions': [], 'error': 'Cancelled'}
                
        except Exception as e:
            print(f"[ActionRecorder] EXCEPTION: {e}", file=sys.stderr)
            import traceback
            traceback.print_exc(file=sys.stderr)
            return {'success': False, 'actions': [], 'error': str(e)}

    def updateShortcut(self, index, data):
        try:
            if index < 0 or index >= len(self.shortcuts):
                return False
            path = data.get('path', '')
            # Support both old 'folder' and new 'folders' format
            folders = data.get('folders')
            if folders is None:
                folder = data.get('folder', '')
                folders = [folder] if folder else ['']
            # Store path for icon extraction
            shortcut = {
                'name': data.get('name', ''),
                'path': path,
                'iconPath': data.get('iconPath') or path,
                'description': data.get('description', ''),
                'folders': folders,  # Multi-folder support
                'customOrder': data.get('customOrder'),  # Preserve custom order
                'lastOpened': data.get('lastOpened', 0),  # Preserve last opened timestamp
                'type': data.get('type') or get_shortcut_type({'path': path}),  # Auto-detect type
                'openInApp': data.get('openInApp')  # None = default, True = app, False = browser
            }
            self.shortcuts[index] = shortcut
            save_shortcuts(self.shortcuts)
            return True
        except Exception as e:
            print(f"Error updating shortcut: {e}")
            return False

    def saveShortcutsList(self, shortcuts_data):
        try:
            # Reconstruct the list to ensure data integrity
            new_shortcuts = []
            for data in shortcuts_data:
                path = data.get('path', '')
                # Support both old 'folder' and new 'folders' format
                folders = data.get('folders')
                if folders is None:
                    folder = data.get('folder', '')
                    folders = [folder] if folder else ['']
                shortcut = {
                    'name': data.get('name', ''),
                    'path': path,
                    'iconPath': data.get('iconPath') or path,
                    'description': data.get('description', ''),
                    'folders': folders,
                    'customOrder': data.get('customOrder'),
                    'lastOpened': data.get('lastOpened', 0),
                    'type': data.get('type') or get_shortcut_type({'path': path}),
                    'openInApp': data.get('openInApp')  # None = default
                }
                new_shortcuts.append(shortcut)
            
            self.shortcuts = new_shortcuts
            save_shortcuts(self.shortcuts)
            return True
        except Exception as e:
            print(f"Error saving all shortcuts: {e}")
            return False

    def deleteShortcut(self, index):
        try:
            if index < 0 or index >= len(self.shortcuts):
                return False
            del self.shortcuts[index]
            save_shortcuts(self.shortcuts)
            return True
        except Exception as e:
            print(f"Error deleting shortcut: {e}")
            return False

if __name__ == '__main__':
    api = Api()

    # Configuration de Bottle pour servir les fichiers statiques
    app = bottle.Bottle()
    
    # ==================== API HTTP ROUTES ====================
    @app.route('/api/getTheme')
    def api_get_theme():
        bottle.response.content_type = 'application/json'
        return json.dumps(api.getTheme())
    
    @app.route('/api/getShortcuts')
    def api_get_shortcuts():
        bottle.response.content_type = 'application/json'
        return json.dumps(api.getShortcuts())
    
    @app.route('/api/getSettings')
    def api_get_settings():
        bottle.response.content_type = 'application/json'
        return json.dumps(api.getSettings())
    
    @app.route('/api/getFolderOrder')
    def api_get_folder_order():
        bottle.response.content_type = 'application/json'
        return json.dumps(api.getFolderOrder())
    
    @app.route('/api/getFolderIcons')
    def api_get_folder_icons():
        bottle.response.content_type = 'application/json'
        return json.dumps(api.getFolderIcons())
    
    @app.route('/api/getDashboardLayout')
    def api_get_dashboard_layout():
        bottle.response.content_type = 'application/json'
        return json.dumps(api.getDashboardLayout())
    
    @app.route('/api/getRecentHistory')
    def api_get_recent_history():
        bottle.response.content_type = 'application/json'
        return json.dumps(api.getRecentHistory())
    
    @app.route('/api/getCustomThemes')
    def api_get_custom_themes():
        bottle.response.content_type = 'application/json'
        return json.dumps(api.getCustomThemes())
    
    @app.post('/api/saveTheme')
    def api_save_theme():
        data = bottle.request.json
        bottle.response.content_type = 'application/json'
        return json.dumps(api.saveTheme(data))
    
    @app.post('/api/addShortcut')
    def api_add_shortcut():
        data = bottle.request.json
        bottle.response.content_type = 'application/json'
        return json.dumps(api.addShortcut(data))
    
    @app.post('/api/updateShortcut')
    def api_update_shortcut():
        data = bottle.request.json
        index = data.get('index')
        shortcut_data = data.get('data')
        bottle.response.content_type = 'application/json'
        return json.dumps(api.updateShortcut(index, shortcut_data))
    
    @app.post('/api/deleteShortcut')
    def api_delete_shortcut():
        data = bottle.request.json
        index = data.get('index')
        bottle.response.content_type = 'application/json'
        return json.dumps(api.deleteShortcut(index))
    
    @app.post('/api/saveFolderOrder')
    def api_save_folder_order():
        data = bottle.request.json
        bottle.response.content_type = 'application/json'
        return json.dumps(api.saveFolderOrder(data))
    
    @app.post('/api/saveFolderIcons')
    def api_save_folder_icons():
        data = bottle.request.json
        bottle.response.content_type = 'application/json'
        return json.dumps(api.saveFolderIcons(data))
    
    @app.post('/api/saveDashboardLayout')
    def api_save_dashboard_layout():
        data = bottle.request.json
        bottle.response.content_type = 'application/json'
        return json.dumps(api.saveDashboardLayout(data))
    
    @app.post('/api/saveSettings')
    def api_save_settings():
        data = bottle.request.json
        bottle.response.content_type = 'application/json'
        return json.dumps(api.saveSettings(data))
    
    @app.post('/api/openShortcut')
    def api_open_shortcut():
        data = bottle.request.json
        path = data.get('path')
        in_app = data.get('inApp')
        name = data.get('name')
        bottle.response.content_type = 'application/json'
        return json.dumps(api.openShortcut(path, in_app, name))
    
    @app.route('/api/getIconForPath')
    def api_get_icon_for_path():
        path = bottle.request.query.get('path', '')
        bottle.response.content_type = 'application/json'
        return json.dumps(api.getIconForPath(path))
    
    @app.route('/api/browseFile')
    def api_browse_file():
        file_types = bottle.request.query.get('fileTypes', '')
        if file_types:
            file_types = file_types.split(',')
        else:
            file_types = None
        bottle.response.content_type = 'application/json'
        return json.dumps(api.browseFile(file_types))
    
    @app.route('/api/pickFile')
    def api_pick_file():
        bottle.response.content_type = 'application/json'
        return json.dumps(api.pickFile())
    
    @app.route('/api/pickIcon')
    def api_pick_icon():
        bottle.response.content_type = 'application/json'
        return json.dumps(api.pickIcon())
    
    @app.post('/api/saveCustomTheme')
    def api_save_custom_theme():
        data = bottle.request.json
        name = data.get('name')
        theme = data.get('theme')
        bottle.response.content_type = 'application/json'
        return json.dumps(api.saveCustomTheme(name, theme))
    
    @app.post('/api/deleteCustomTheme')
    def api_delete_custom_theme():
        data = bottle.request.json
        name = data.get('name')
        bottle.response.content_type = 'application/json'
        return json.dumps(api.deleteCustomTheme(name))
    
    @app.post('/api/addToRecentHistory')
    def api_add_to_recent_history():
        data = bottle.request.json
        shortcut = data.get('shortcut')
        bottle.response.content_type = 'application/json'
        return json.dumps(api.addToRecentHistory(shortcut))
    
    @app.post('/api/clearRecentHistory')
    def api_clear_recent_history():
        bottle.response.content_type = 'application/json'
        return json.dumps(api.clearRecentHistory())
    
    # ==================== END API ROUTES ====================
    
    @app.route('/')
    def home():
        return bottle.static_file('index.html', root='web')
    
    @app.route('/icon/<index:int>')
    def serve_icon(index):
        """Serve icon as PNG image for a shortcut by index"""
        try:
            print(f"Serving icon for index {index}")
            if 0 <= index < len(api.shortcuts):
                shortcut = api.shortcuts[index]
                icon_path = shortcut.get('iconPath') or shortcut.get('path')
                print(f"Icon path: {icon_path}")
                
                # Check if it's a URL - use favicon
                if is_url(icon_path) or is_url(shortcut.get('path', '')):
                    url = shortcut.get('path', '')
                    favicon = get_favicon_for_url(url)
                    if favicon and favicon.startswith('data:image/'):
                        # Extract base64 data
                        parts = favicon.split(',', 1)
                        if len(parts) == 2:
                            mime_type = 'image/png' if 'png' in parts[0] else 'image/x-icon'
                            png_bytes = base64.b64decode(parts[1])
                            bottle.response.content_type = mime_type
                            bottle.response.set_header('Cache-Control', 'public, max-age=3600')
                            print(f"Successfully served favicon for {url}")
                            return png_bytes
                
                # Regular file path
                if icon_path and os.path.exists(icon_path):
                    # Extract icon and convert to PNG bytes
                    try:
                        icon_data_uri = api.get_file_icon(icon_path)
                        if icon_data_uri and icon_data_uri.startswith('data:image/png;base64,'):
                            # Extract base64 data and decode
                            base64_data = icon_data_uri.split(',', 1)[1]
                            png_bytes = base64.b64decode(base64_data)
                            
                            # Serve as PNG image
                            bottle.response.content_type = 'image/png'
                            bottle.response.set_header('Cache-Control', 'public, max-age=3600')
                            print(f"Successfully served icon for {icon_path}")
                            return png_bytes
                    except Exception as e:
                        print(f"Error extracting icon from {icon_path}: {e}")
                        import traceback
                        traceback.print_exc()
            
            # Return 404 if not found - this triggers the onerror handler in frontend
            print(f"No icon found for index {index}")
            bottle.response.status = 404
            return ''
        except Exception as e:
            print(f"Error serving icon for index {index}: {e}")
            import traceback
            traceback.print_exc()
            bottle.response.status = 404
            return ''

    @app.route('/favicon.ico')
    def serve_favicon():
        """Serve app favicon"""
        # Return a simple 1x1 transparent gif to avoid 404
        bottle.response.content_type = 'image/x-icon'
        return base64.b64decode('AAABAAEAEBAAAAEAIABoBAAAFgAAACgAAAAQAAAAIAAAAAEAIAAAAAAAAAQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA==')

    @app.route('/file/<filepath:path>')
    def serve_local_file(filepath):
        """Serve a local file (for background images)"""
        try:
            import urllib.parse
            decoded_path = urllib.parse.unquote(filepath)
            if os.path.exists(decoded_path) and os.path.isfile(decoded_path):
                # DÃ©terminer le type MIME
                ext = os.path.splitext(decoded_path)[1].lower()
                mime_types = {
                    '.png': 'image/png',
                    '.jpg': 'image/jpeg',
                    '.jpeg': 'image/jpeg',
                    '.gif': 'image/gif',
                    '.bmp': 'image/bmp',
                    '.webp': 'image/webp',
                    '.ico': 'image/x-icon'
                }
                content_type = mime_types.get(ext, 'application/octet-stream')
                bottle.response.content_type = content_type
                bottle.response.set_header('Cache-Control', 'public, max-age=3600')
                with open(decoded_path, 'rb') as f:
                    return f.read()
            else:
                bottle.response.status = 404
                return 'File not found'
        except Exception as e:
            print(f"Error serving file {filepath}: {e}")
            bottle.response.status = 500
            return str(e)

    @app.route('/<filepath:path>')
    def serve_static(filepath):
        return bottle.static_file(filepath, root='web')
    
    # Trouver un port disponible
    import time
    import socket
    
    def find_free_port():
        for port in range(8080, 8100):
            try:
                sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
                sock.settimeout(1)
                result = sock.connect_ex(('127.0.0.1', port))
                sock.close()
                if result != 0:  # Port libre
                    return port
            except:
                pass
        return 8080
    
    server_port = 8080
    print(f"Starting server on port {server_port}")
    server_url = f'http://127.0.0.1:{server_port}'
    
    # Lancer le serveur dans un thread
    def run_server():
        try:
            app.run(host='127.0.0.1', port=server_port, quiet=True)
        except Exception as e:
            print(f"Server error: {e}")
    
    server_thread = threading.Thread(target=run_server)
    server_thread.daemon = True
    server_thread.start()
    
    import time
    time.sleep(0.5)
    print(f"Server started on port {server_port}")

    # Charger les paramÃ¨tres de fenÃªtre depuis le thÃ¨me
    theme = load_theme() or {}
    window_title = theme.get('appName', '') or 'Gestionnaire de raccourcis'
    window_width = theme.get('windowWidth', 1000)
    window_height = theme.get('windowHeight', 800)
    min_width = theme.get('windowMinWidth', 0) or 0
    min_height = theme.get('windowMinHeight', 0) or 0
    start_fullscreen = theme.get('startFullscreen', False)
    start_screen = theme.get('startScreen', 0)

    # URL du serveur local
    server_url = f'http://127.0.0.1:{server_port}'

    def set_main_window_icon():
        """DÃ©finir l'icÃ´ne de la fenÃªtre principale aprÃ¨s crÃ©ation"""
        try:
            import time
            time.sleep(0.5)  # Attendre que la fenÃªtre soit crÃ©Ã©e
            
            # RÃ©cupÃ©rer le chemin de l'icÃ´ne depuis le thÃ¨me
            icon_path = theme.get('appIconPath', '')
            if not icon_path or not os.path.exists(icon_path):
                # IcÃ´ne par dÃ©faut
                icon_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'img', 'fini.png')
            
            if not os.path.exists(icon_path):
                return
            
            # Convertir en ICO si nÃ©cessaire
            ico_path = icon_path
            if not icon_path.lower().endswith('.ico'):
                ico_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'img', 'app_icon.ico')
                try:
                    img = Image.open(icon_path)
                    img = img.convert('RGBA')
                    img.save(ico_path, format='ICO', sizes=[(256, 256), (48, 48), (32, 32), (16, 16)])
                except Exception as e:
                    print(f"Error converting icon: {e}")
                    return
            
            # Trouver la fenÃªtre
            hwnd = None
            def enum_callback(h, results):
                if win32gui.IsWindowVisible(h):
                    title = win32gui.GetWindowText(h)
                    if title == window_title or 'Gestionnaire' in title:
                        results.append(h)
                return True
            
            windows_found = []
            win32gui.EnumWindows(enum_callback, windows_found)
            
            if windows_found:
                hwnd = windows_found[0]
                
                # Charger l'icÃ´ne
                try:
                    icon_flags = win32con.LR_LOADFROMFILE | win32con.LR_DEFAULTSIZE
                    hicon_big = win32gui.LoadImage(0, ico_path, win32con.IMAGE_ICON, 32, 32, icon_flags)
                    hicon_small = win32gui.LoadImage(0, ico_path, win32con.IMAGE_ICON, 16, 16, icon_flags)
                    
                    # Appliquer l'icÃ´ne
                    win32gui.SendMessage(hwnd, win32con.WM_SETICON, win32con.ICON_BIG, hicon_big)
                    win32gui.SendMessage(hwnd, win32con.WM_SETICON, win32con.ICON_SMALL, hicon_small)
                except Exception as e:
                    pass  # Silently ignore icon errors
        except Exception as e:
            pass  # Silently ignore icon errors
    
    # Lancer la fenêtre PyQt5 avec QWebEngineView
    print("Lancement de la fenêtre...")
    from PyQt5.QtWidgets import QApplication, QMainWindow
    from PyQt5.QtWebEngineWidgets import QWebEngineView
    from PyQt5.QtCore import QUrl
    from PyQt5.QtGui import QIcon
    
    qt_app = QApplication(sys.argv)
    
    main_window = QMainWindow()
    main_window.setWindowTitle(window_title)
    main_window.resize(window_width, window_height)
    
    if min_width > 0 and min_height > 0:
        main_window.setMinimumSize(min_width, min_height)
    
    # Icône de l'app
    icon_path = theme.get('appIconPath', '')
    if not icon_path or not os.path.exists(icon_path):
        icon_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'img', 'fini.png')
    if os.path.exists(icon_path):
        main_window.setWindowIcon(QIcon(icon_path))
    
    # WebView
    web_view = QWebEngineView()
    web_view.setUrl(QUrl(server_url))
    main_window.setCentralWidget(web_view)
    
    if start_fullscreen:
        main_window.showMaximized()
    else:
        main_window.show()
    
    sys.exit(qt_app.exec_())

