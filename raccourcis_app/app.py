import json
import os
import webview
import bottle
import threading
import pathlib
import platform
import subprocess
from PIL import Image
import base64
from io import BytesIO
import win32gui
import win32ui
import win32con
import mimetypes
import ctypes
from ctypes import wintypes

SHORTCUTS_FILE = "shortcuts.json"
THEME_FILE = "theme.json"
CUSTOM_THEMES_FILE = "custom_themes.json"

# Small transparent placeholder (1x1 GIF) used when no valid icon is available
DEFAULT_ICON = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw=='

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

class Api:
    def __init__(self):
        self.shortcuts = load_shortcuts()
        self.custom_themes = load_custom_themes()
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
                print(f"Erreur lors du rendu de l'icône pour {file_path}: {e}")
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
        """Extract and return icon as data URI for a given executable path"""
        try:
            if not file_path or not os.path.exists(file_path):
                return DEFAULT_ICON
            icon = self.get_file_icon(file_path)
            return icon if icon else DEFAULT_ICON
        except Exception as e:
            print(f"Erreur lors de l'extraction de l'icône pour {file_path}: {e}")
            return DEFAULT_ICON

    def getTheme(self):
        return load_theme()

    def saveTheme(self, theme):
        save_theme(theme)
        return True

    def getCustomThemes(self):
        return self.custom_themes

    def saveCustomTheme(self, theme):
        self.custom_themes.append(theme)
        save_custom_themes(self.custom_themes)
        return True

    def pickFile(self):
        try:
            result = webview.windows[0].create_file_dialog(
                webview.OPEN_DIALOG,
                allow_multiple=False
            )
            if result:
                file_path = result[0]
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
            result = webview.windows[0].create_file_dialog(
                webview.OPEN_DIALOG,
                allow_multiple=False,
                file_types=('Image Files (*.png;*.jpg;*.ico)', 'All files (*.*)')
            )
            if result:
                icon_path = result[0]
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
        shortcut = {
            'name': data.get('name', ''),
            'path': data.get('path', ''),
            'iconPath': data.get('iconPath') or data.get('path', ''),  # Use custom icon path or exe path
            'description': data.get('description', ''),
            'folder': data.get('folder', '')  # Add folder support
        }
        self.shortcuts.append(shortcut)
        save_shortcuts(self.shortcuts)
        return self.shortcuts

    def openShortcut(self, path):
        try:
            os.startfile(path)
            return True
        except Exception as e:
            print(f"Error opening file: {e}")
            return False

    def updateShortcut(self, index, data):
        try:
            if index < 0 or index >= len(self.shortcuts):
                return False
            # Store path for icon extraction
            shortcut = {
                'name': data.get('name', ''),
                'path': data.get('path', ''),
                'iconPath': data.get('iconPath') or data.get('path', ''),
                'description': data.get('description', ''),
                'folder': data.get('folder', '')  # Add folder support
            }
            self.shortcuts[index] = shortcut
            save_shortcuts(self.shortcuts)
            return True
        except Exception as e:
            print(f"Error updating shortcut: {e}")
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
            
            # Return default icon if not found
            print(f"Returning default icon for index {index}")
            bottle.response.content_type = 'image/gif'
            return base64.b64decode('R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==')
        except Exception as e:
            print(f"Error serving icon for index {index}: {e}")
            import traceback
            traceback.print_exc()
            bottle.response.content_type = 'image/gif'
            return base64.b64decode('R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==')

    @app.route('/<filepath:path>')
    def serve_static(filepath):
        return bottle.static_file(filepath, root='web')
    
    # Démarrer le serveur Bottle dans un thread
    server = threading.Thread(target=lambda: app.run(host='127.0.0.1', port=8080, quiet=True))
    server.daemon = True
    server.start()

    # Créer la fenêtre pywebview
    window = webview.create_window(
        'Gestionnaire de raccourcis',
        'http://127.0.0.1:8080',
        js_api=api,
        width=1000,
        height=800,
        min_size=(800, 600)
    )

    # Démarrer en mode debug
    webview.start(debug=True)