"""
Script séparé pour ouvrir des URLs dans une fenêtre pywebview avec stockage persistant.
Appelé en sous-processus pour permettre la persistance des cookies/sessions.
"""
import sys
import os
import webview
import requests
import ctypes
import platform
import re
import json
import time
import threading
from urllib.parse import urlparse, urljoin
from PIL import Image
from io import BytesIO
import base64

# Path to favicon cache (same as main app)
FAVICON_CACHE_FILE = os.path.join(os.path.dirname(__file__), "favicon_cache.json")

def load_favicon_from_cache(domain):
    """Load favicon from the main app's cache"""
    try:
        if os.path.exists(FAVICON_CACHE_FILE):
            with open(FAVICON_CACHE_FILE, 'r', encoding='utf-8') as f:
                cache = json.load(f)
            return cache.get(domain)
    except:
        pass
    return None

def save_favicon_to_cache(domain, data_uri):
    """Save favicon to the main app's cache"""
    try:
        cache = {}
        if os.path.exists(FAVICON_CACHE_FILE):
            with open(FAVICON_CACHE_FILE, 'r', encoding='utf-8') as f:
                cache = json.load(f)
        cache[domain] = data_uri
        with open(FAVICON_CACHE_FILE, 'w', encoding='utf-8') as f:
            json.dump(cache, f)
    except Exception as e:
        print(f"Error saving favicon cache: {e}")

def download_favicon(url, storage_dir):
    """Télécharge le favicon du site directement depuis le HTML et le convertit en ICO"""
    try:
        parsed = urlparse(url)
        domain = parsed.netloc
        base_url = f"{parsed.scheme}://{domain}"
        url_path = parsed.path
        icons_dir = os.path.join(storage_dir, 'site_icons')
        os.makedirs(icons_dir, exist_ok=True)
        
        safe_domain = domain.replace(':', '_').replace('.', '_')
        icon_path = os.path.join(icons_dir, f"{safe_domain}.ico")
        
        # Si l'icône existe déjà et est récente, la retourner
        if os.path.exists(icon_path) and os.path.getsize(icon_path) > 100:
            return icon_path
        
        headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        }
        
        # 0. FIRST: Check the main app's favicon cache
        cached_data = load_favicon_from_cache(domain)
        if cached_data and cached_data.startswith('data:image/'):
            try:
                # Extract base64 data and save as ICO
                parts = cached_data.split(',', 1)
                if len(parts) == 2:
                    img_data = base64.b64decode(parts[1])
                    img = Image.open(BytesIO(img_data))
                    if img.mode != 'RGBA':
                        img = img.convert('RGBA')
                    img.save(icon_path, format='ICO', sizes=[(16,16), (32,32), (48,48)])
                    print(f"Loaded favicon from cache for {domain}")
                    return icon_path
            except Exception as e:
                print(f"Error loading from cache: {e}")
        
        # 0.5 SPECIAL CASE: Pronote/index-education (protected favicons)
        if 'index-education' in domain or 'pronote' in url.lower():
            pronote_icon_url = 'https://demo.index-education.net/pronote/images/apple-touch-icon.png'
            try:
                response = requests.get(pronote_icon_url, headers=headers, timeout=5, verify=False)
                if response.status_code == 200 and len(response.content) > 500:
                    img = Image.open(BytesIO(response.content))
                    if img.mode != 'RGBA':
                        img = img.convert('RGBA')
                    img.save(icon_path, format='ICO', sizes=[(16,16), (32,32), (48,48)])
                    
                    # Also save to cache for main app
                    buffered = BytesIO()
                    img.save(buffered, format='PNG')
                    data_uri = 'data:image/png;base64,' + base64.b64encode(buffered.getvalue()).decode()
                    save_favicon_to_cache(domain, data_uri)
                    
                    print(f"Downloaded Pronote favicon for {domain}")
                    return icon_path
            except Exception as e:
                print(f"Pronote favicon error: {e}")
        
        # 1. D'abord essayer de parser le HTML pour trouver l'icône
        icon_urls_from_html = []
        try:
            response = requests.get(url, timeout=5, headers=headers, verify=False)
            if response.status_code == 200:
                html = response.text
                
                # Chercher les balises link avec rel contenant "icon"
                # Priorité: apple-touch-icon > icon > shortcut icon
                patterns = [
                    r'<link[^>]+rel=["\']apple-touch-icon["\'][^>]+href=["\']([^"\']+)["\']',
                    r'<link[^>]+href=["\']([^"\']+)["\'][^>]+rel=["\']apple-touch-icon["\']',
                    r'<link[^>]+rel=["\']icon["\'][^>]+href=["\']([^"\']+)["\']',
                    r'<link[^>]+href=["\']([^"\']+)["\'][^>]+rel=["\']icon["\']',
                    r'<link[^>]+rel=["\']shortcut icon["\'][^>]+href=["\']([^"\']+)["\']',
                    r'<link[^>]+href=["\']([^"\']+)["\'][^>]+rel=["\']shortcut icon["\']',
                ]
                
                for pattern in patterns:
                    matches = re.findall(pattern, html, re.IGNORECASE)
                    for match in matches:
                        if match and match not in icon_urls_from_html:
                            icon_urls_from_html.append(match)
        except:
            pass
        
        # 2. Construire la liste des URLs à essayer
        urls_to_try = []
        
        # Add icons found in HTML (resolved to absolute URLs)
        for icon_url in icon_urls_from_html:
            if icon_url.startswith('//'):
                resolved = 'https:' + icon_url
            elif icon_url.startswith('/'):
                resolved = base_url + icon_url
            elif icon_url.startswith('./'):
                path_base = '/'.join(url_path.split('/')[:-1]) if '/' in url_path else ''
                resolved = base_url + path_base + icon_url[1:]
            elif not icon_url.startswith('http'):
                resolved = urljoin(url, icon_url)
            else:
                resolved = icon_url
            urls_to_try.append(resolved)
        
        # Fallbacks - mettre favicon.ico en premier car souvent de meilleure qualité
        urls_to_try.insert(0, f"{base_url}/favicon.ico")
        urls_to_try.extend([
            f"{base_url}/favicon.png",
            f"{base_url}/apple-touch-icon.png",
        ])
        
        # Also try DuckDuckGo icons API
        urls_to_try.append(f"https://icons.duckduckgo.com/ip3/{domain}.ico")
        
        # 3. Télécharger la première icône valide
        for url_try in urls_to_try:
            try:
                response = requests.get(url_try, timeout=5, headers=headers, verify=False)
                if response.status_code == 200 and len(response.content) > 500:
                    content_type = response.headers.get('content-type', '')
                    if 'image' in content_type or url_try.endswith(('.ico', '.png', '.jpg')):
                        try:
                            img = Image.open(BytesIO(response.content))
                            
                            # Si c'est déjà un ICO avec une bonne taille, le garder tel quel
                            if img.format == 'ICO' and img.size[0] >= 32:
                                with open(icon_path, 'wb') as f:
                                    f.write(response.content)
                                # Also save to main app cache as PNG
                                try:
                                    png_img = img.copy()
                                    if png_img.mode != 'RGBA':
                                        png_img = png_img.convert('RGBA')
                                    buffered = BytesIO()
                                    png_img.save(buffered, format='PNG')
                                    data_uri = 'data:image/png;base64,' + base64.b64encode(buffered.getvalue()).decode()
                                    save_favicon_to_cache(domain, data_uri)
                                except:
                                    pass
                                return icon_path
                            
                            # Sinon, convertir en ICO avec plusieurs tailles
                            if img.mode != 'RGBA':
                                img = img.convert('RGBA')
                            
                            # S'assurer que l'image source est assez grande
                            if img.size[0] < 32:
                                img = img.resize((64, 64), Image.Resampling.LANCZOS)
                            
                            # Sauvegarder directement - PIL gère les tailles ICO
                            img.save(icon_path, format='ICO', sizes=[(16,16), (32,32), (48,48)])
                            
                            # Also save to main app cache
                            buffered = BytesIO()
                            img.save(buffered, format='PNG')
                            data_uri = 'data:image/png;base64,' + base64.b64encode(buffered.getvalue()).decode()
                            save_favicon_to_cache(domain, data_uri)
                            
                            return icon_path
                            
                        except Exception as e:
                            # Sauvegarder le fichier brut
                            with open(icon_path, 'wb') as f:
                                f.write(response.content)
                            return icon_path
            except:
                continue
        
        return None
    except:
        return None

def set_window_icon(hwnd, icon_path):
    """Change l'icône de la fenêtre Windows via l'API Win32"""
    try:
        if not icon_path or not os.path.exists(icon_path):
            print(f"Icon path invalid: {icon_path}")
            return False
        
        # S'assurer que le chemin est absolu
        icon_path = os.path.abspath(icon_path)
        print(f"Setting icon from: {icon_path}")
        
        IMAGE_ICON = 1
        LR_LOADFROMFILE = 0x0010
        
        # Charger les icônes avec les bonnes tailles
        hicon_small = ctypes.windll.user32.LoadImageW(
            0, icon_path, IMAGE_ICON, 16, 16, LR_LOADFROMFILE
        )
        hicon_large = ctypes.windll.user32.LoadImageW(
            0, icon_path, IMAGE_ICON, 32, 32, LR_LOADFROMFILE
        )
        hicon_big = ctypes.windll.user32.LoadImageW(
            0, icon_path, IMAGE_ICON, 48, 48, LR_LOADFROMFILE
        )
        
        if not hicon_big:
            hicon_big = hicon_large
        
        print(f"Icons loaded: small={hicon_small}, large={hicon_large}, big={hicon_big}")
        
        if not hicon_small and not hicon_large:
            print("Failed to load any icon")
            return False
        
        WM_SETICON = 0x0080
        ICON_SMALL = 0
        ICON_BIG = 1
        
        success = False
        
        # Méthode 1: WM_SETICON (pour la barre de titre et parfois barre des tâches)
        if hicon_small:
            result = ctypes.windll.user32.SendMessageW(hwnd, WM_SETICON, ICON_SMALL, hicon_small)
            print(f"SendMessage ICON_SMALL result: {result}")
            success = True
        if hicon_big:
            result = ctypes.windll.user32.SendMessageW(hwnd, WM_SETICON, ICON_BIG, hicon_big)
            print(f"SendMessage ICON_BIG result: {result}")
            success = True
        
        # Méthode 2: SetClassLongPtrW (pour mettre à jour la classe de fenêtre)
        GCL_HICON = -14
        GCL_HICONSM = -34
        
        try:
            if hicon_big:
                ctypes.windll.user32.SetClassLongPtrW(hwnd, GCL_HICON, hicon_big)
            if hicon_small:
                ctypes.windll.user32.SetClassLongPtrW(hwnd, GCL_HICONSM, hicon_small)
        except Exception as e:
            print(f"SetClassLongPtrW failed: {e}")
        
        # Méthode 3: Forcer Windows à redessiner la fenêtre dans la barre des tâches
        # en la cachant puis la remontrant brièvement
        try:
            SW_HIDE = 0
            SW_SHOW = 5
            # On ne cache pas vraiment, juste invalider la zone
            ctypes.windll.user32.InvalidateRect(hwnd, None, True)
            ctypes.windll.user32.UpdateWindow(hwnd)
        except:
            pass
            
        return success
    except Exception as e:
        print(f"set_window_icon error: {e}")
        return False

def set_app_user_model_id(app_id: str):
    """Set the current process AppUserModelID (Windows) to influence taskbar grouping/icon."""
    try:
        if not app_id:
            return False
        shell32 = ctypes.windll.shell32
        # HRESULT SetCurrentProcessExplicitAppUserModelID(PCWSTR AppID);
        SetAppID = shell32.SetCurrentProcessExplicitAppUserModelID
        SetAppID.argtypes = [ctypes.c_wchar_p]
        SetAppID.restype = ctypes.c_uint
        res = SetAppID(app_id)
        return res == 0
    except Exception as e:
        print(f"set_app_user_model_id error: {e}")
        return False

def execute_automation_actions(window, actions):
    """Execute automation actions on the webpage"""
    if not actions:
        return
    
    def run_actions():
        time.sleep(1)  # Attendre que la page soit bien chargée
        
        for i, action in enumerate(actions):
            action_type = action.get('type', '')
            print(f"Executing action {i+1}/{len(actions)}: {action_type}")
            
            try:
                if action_type == 'wait':
                    # Attendre X millisecondes
                    delay = action.get('delay', 1000) / 1000
                    time.sleep(delay)
                    
                elif action_type == 'waitForElement':
                    # Attendre qu'un élément apparaisse
                    selector = action.get('selector', '')
                    timeout = action.get('timeout', 10000) / 1000
                    start = time.time()
                    while time.time() - start < timeout:
                        result = window.evaluate_js(f'document.querySelector("{selector}") !== null')
                        if result:
                            print(f"  Element found: {selector}")
                            break
                        time.sleep(0.2)
                    else:
                        print(f"  Timeout waiting for: {selector}")
                        
                elif action_type == 'click':
                    # Cliquer sur un élément
                    selector = action.get('selector', '')
                    js = f'''
                    (function() {{
                        var el = document.querySelector("{selector}");
                        if (el) {{
                            el.click();
                            return true;
                        }}
                        return false;
                    }})()
                    '''
                    result = window.evaluate_js(js)
                    print(f"  Click on {selector}: {'success' if result else 'element not found'}")
                    
                elif action_type == 'type':
                    # Taper du texte dans un champ
                    selector = action.get('selector', '')
                    text = action.get('text', '')
                    clear = action.get('clear', False)
                    js = f'''
                    (function() {{
                        var el = document.querySelector("{selector}");
                        if (el) {{
                            el.focus();
                            if ({str(clear).lower()}) el.value = '';
                            el.value += "{text}";
                            el.dispatchEvent(new Event('input', {{ bubbles: true }}));
                            el.dispatchEvent(new Event('change', {{ bubbles: true }}));
                            return true;
                        }}
                        return false;
                    }})()
                    '''
                    result = window.evaluate_js(js)
                    print(f"  Type in {selector}: {'success' if result else 'element not found'}")
                    
                elif action_type == 'keyboard':
                    # Simuler une touche
                    key = action.get('key', '')
                    modifiers = action.get('modifiers', [])  # ['ctrl', 'shift', 'alt']
                    js = f'''
                    (function() {{
                        var event = new KeyboardEvent('keydown', {{
                            key: '{key}',
                            code: 'Key{key.upper() if len(key) == 1 else key}',
                            keyCode: {ord(key.upper()) if len(key) == 1 else 13 if key == 'Enter' else 27 if key == 'Escape' else 9 if key == 'Tab' else 0},
                            ctrlKey: {str('ctrl' in modifiers).lower()},
                            shiftKey: {str('shift' in modifiers).lower()},
                            altKey: {str('alt' in modifiers).lower()},
                            bubbles: true
                        }});
                        document.activeElement.dispatchEvent(event);
                        return true;
                    }})()
                    '''
                    window.evaluate_js(js)
                    print(f"  Keyboard: {key}")
                    
                elif action_type == 'submit':
                    # Soumettre un formulaire
                    selector = action.get('selector', 'form')
                    js = f'''
                    (function() {{
                        var form = document.querySelector("{selector}");
                        if (form) {{
                            form.submit();
                            return true;
                        }}
                        // Sinon essayer de cliquer sur le bouton submit
                        var btn = document.querySelector('button[type="submit"], input[type="submit"]');
                        if (btn) {{
                            btn.click();
                            return true;
                        }}
                        return false;
                    }})()
                    '''
                    window.evaluate_js(js)
                    print(f"  Submit form: {selector}")
                    
                elif action_type == 'script':
                    # Exécuter du JavaScript personnalisé
                    script = action.get('script', '')
                    if script:
                        window.evaluate_js(script)
                        print(f"  Custom script executed")
                        
                # Petit délai entre les actions
                time.sleep(0.1)
                
            except Exception as e:
                print(f"  Error executing action: {e}")
    
    # Exécuter dans un thread séparé pour ne pas bloquer
    thread = threading.Thread(target=run_actions, daemon=True)
    thread.start()

def main():
    if len(sys.argv) < 2:
        sys.exit(1)
    
    url = sys.argv[1]
    width = int(sys.argv[2]) if len(sys.argv) > 2 else 1200
    height = int(sys.argv[3]) if len(sys.argv) > 3 else 800
    min_width = int(sys.argv[4]) if len(sys.argv) > 4 else 600
    min_height = int(sys.argv[5]) if len(sys.argv) > 5 else 400
    fullscreen = sys.argv[6].lower() == 'true' if len(sys.argv) > 6 else False
    shortcut_name = sys.argv[7] if len(sys.argv) > 7 and sys.argv[7] else None
    # Actions d'automatisation (JSON encodé en base64)
    automation_actions = []
    if len(sys.argv) > 8 and sys.argv[8]:
        try:
            import base64
            automation_json = base64.b64decode(sys.argv[8]).decode('utf-8')
            automation_actions = json.loads(automation_json)
            print(f"Automation actions loaded: {len(automation_actions)} actions")
        except Exception as e:
            print(f"Failed to parse automation actions: {e}")
    
    if not url.startswith(('http://', 'https://')):
        url = 'https://' + url
    
    parsed = urlparse(url)
    domain = parsed.netloc or url[:50]
    # Utiliser le nom du raccourci si fourni, sinon le domaine
    title = shortcut_name if shortcut_name else domain
    
    app_dir = os.path.dirname(os.path.abspath(__file__))
    storage_dir = os.path.join(app_dir, 'webview_data')
    browser_storage = os.path.join(storage_dir, 'browser_storage')
    os.makedirs(browser_storage, exist_ok=True)
    
    # Télécharger le favicon AVANT de créer la fenêtre
    icon_path = download_favicon(url, storage_dir)
    
    # Définir un AppUserModelID unique pour ce site (AVANT la création de la fenêtre)
    # Cela permet à Windows d'afficher la bonne icône dans la barre des tâches
    safe_domain = domain.replace('.', '_').replace(':', '_').replace('/', '_')
    app_id = f"RaccourcisApp.{safe_domain}"
    
    try:
        if platform.system().lower() == 'windows':
            set_app_user_model_id(app_id)
    except Exception as e:
        print(f"Failed to set AppUserModelID: {e}")
    
    window_params = {
        'title': title,
        'url': url,
        'width': width,
        'height': height,
        'maximized': fullscreen  # Maximisé au lieu de fullscreen pour garder la barre des tâches
    }
    
    if min_width > 0 and min_height > 0:
        window_params['min_size'] = (min_width, min_height)
    
    window = webview.create_window(**window_params)
    
    def on_shown():
        """Appelé quand la fenêtre est affichée - meilleur moment pour changer l'icône"""
        try:
            if not icon_path:
                return
                
            import time
            import threading
            
            def apply_icon():
                for attempt in range(5):  # Essayer 5 fois
                    time.sleep(0.3 + attempt * 0.2)  # Délai croissant
                    
                    hwnd = None
                    
                    # Méthode 1: FindWindowW avec le titre
                    current_title = window.title
                    hwnd = ctypes.windll.user32.FindWindowW(None, current_title)
                    
                    if not hwnd:
                        hwnd = ctypes.windll.user32.FindWindowW(None, title)
                    
                    if not hwnd:
                        # Méthode 2: Énumérer les fenêtres par PID
                        import os as os_module
                        current_pid = os_module.getpid()
                        
                        EnumWindows = ctypes.windll.user32.EnumWindows
                        EnumWindowsProc = ctypes.WINFUNCTYPE(ctypes.c_bool, ctypes.c_int, ctypes.c_int)
                        GetWindowThreadProcessId = ctypes.windll.user32.GetWindowThreadProcessId
                        IsWindowVisible = ctypes.windll.user32.IsWindowVisible
                        
                        found_hwnd = []
                        
                        def enum_callback(hwnd_item, lParam):
                            pid = ctypes.c_ulong()
                            GetWindowThreadProcessId(hwnd_item, ctypes.byref(pid))
                            if pid.value == current_pid and IsWindowVisible(hwnd_item):
                                found_hwnd.append(hwnd_item)
                            return True
                        
                        EnumWindows(EnumWindowsProc(enum_callback), 0)
                        
                        if found_hwnd:
                            hwnd = found_hwnd[0]
                    
                    if hwnd:
                        result = set_window_icon(hwnd, icon_path)
                        if result:
                            print(f"✅ Icône appliquée (tentative {attempt + 1})")
                            return
                
                print("⚠️ Impossible d'appliquer l'icône après 5 tentatives")
            
            # Lancer dans un thread pour ne pas bloquer
            threading.Thread(target=apply_icon, daemon=True).start()
            
        except Exception as e:
            print(f"Error setting icon: {e}")
    
    def toggle_fullscreen():
        """Bascule le mode plein écran (sans barres)"""
        window.toggle_fullscreen()
    
    window.events.shown += on_shown
    
    # Injecter un script JavaScript pour capturer F11
    def on_loaded():
        """Injecte le script de capture F11 une fois la page chargée"""
        js_code = """
        document.addEventListener('keydown', function(e) {
            if (e.key === 'F11') {
                e.preventDefault();
                pywebview.api.toggle_fullscreen();
            }
        });
        """
        window.evaluate_js(js_code)
        
        # Exécuter les actions d'automatisation si définies
        if automation_actions:
            execute_automation_actions(window, automation_actions)
    
    window.events.loaded += on_loaded
    
    # Créer une classe API pour exposer les fonctions à JavaScript
    class Api:
        def toggle_fullscreen(self):
            toggle_fullscreen()
    
    api = Api()
    window.expose(api.toggle_fullscreen)
    
    # Charger les paramètres pour le mode debug
    settings_file = os.path.join(os.path.dirname(__file__), 'settings.json')
    debug_mode = False
    if os.path.exists(settings_file):
        try:
            with open(settings_file, 'r', encoding='utf-8') as f:
                settings = json.load(f)
                debug_mode = settings.get('debugMode', False)
        except:
            pass
    
    webview.start(
        private_mode=False,
        storage_path=browser_storage,
        debug=debug_mode
    )

if __name__ == '__main__':
    main()
