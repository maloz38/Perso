"""
Script pour selectionner un element CSS sur un site web.
Ouvre une fenetre avec le site et permet de cliquer sur un element pour obtenir son selecteur CSS.
Utilise les donnees de navigation persistantes (cookies, sessions) pour acceder aux sites avec authentification.
"""
import sys
import os
import json

# Disable pywebview accessibility to prevent recursion errors on Windows
os.environ['PYWEBVIEW_ACCESSIBILITY'] = 'false'
os.environ['PYWEBVIEW_LOG'] = 'warning'

import webview

def get_selector_picker_js(previous_actions=None):
    """Genere le script JS complet avec les actions precedentes integrees"""
    
    actions_json = json.dumps(previous_actions or [])
    
    return """
(function() {
    // Configuration
    const previousActions = """ + actions_json + """;
    const hasActions = previousActions && previousActions.length > 0;
    
    console.log('[SelectorPicker] Script loaded, hasActions:', hasActions, 'count:', previousActions.length);
    
    // Skip if selection mode already active
    if (document.getElementById('selector-picker-toolbar')) {
        console.log('[SelectorPicker] Toolbar already exists, skipping');
        return;
    }
    
    // === UTILITY FUNCTIONS ===
    function sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
    
    async function waitForBody() {
        let attempts = 0;
        while (!document.body && attempts < 200) {
            await sleep(50);
            attempts++;
        }
        if (!document.body) {
            console.error('[SelectorPicker] Body never appeared');
            return false;
        }
        attempts = 0;
        while (document.body.children.length === 0 && attempts < 100) {
            await sleep(50);
            attempts++;
        }
        console.log('[SelectorPicker] Body ready with', document.body.children.length, 'children');
        return true;
    }
    
    async function waitForElement(selector, timeout) {
        const start = Date.now();
        while (Date.now() - start < timeout) {
            const el = document.querySelector(selector);
            if (el) return el;
            await sleep(100);
        }
        return null;
    }
    
    // === EXECUTE PREVIOUS ACTIONS ===
    async function executeActions() {
        console.log('[SelectorPicker] Executing', previousActions.length, 'actions...');
        
        for (let i = 0; i < previousActions.length; i++) {
            const action = previousActions[i];
            console.log('[SelectorPicker] Action', i+1, ':', action.type, action.selector || '');
            
            try {
                switch(action.type) {
                    case 'wait':
                        await sleep(action.delay || 1000);
                        break;
                        
                    case 'waitForElement':
                        await waitForElement(action.selector, action.timeout || 10000);
                        break;
                        
                    case 'click':
                        const clickEl = document.querySelector(action.selector);
                        if (clickEl) {
                            console.log('[SelectorPicker] Clicking:', action.selector);
                            clickEl.click();
                            // If this is the last action, wait a bit then init selector
                            if (i === previousActions.length - 1) {
                                await sleep(500);
                            } else {
                                await sleep(800);
                            }
                        } else {
                            console.warn('[SelectorPicker] Element not found:', action.selector);
                        }
                        break;
                        
                    case 'submit':
                        const submitEl = document.querySelector(action.selector);
                        if (submitEl) {
                            if (submitEl.form) submitEl.form.submit();
                            else submitEl.click();
                            await sleep(800);
                        }
                        break;
                        
                    case 'type':
                        const typeEl = document.querySelector(action.selector);
                        if (typeEl) {
                            if (action.clear) typeEl.value = '';
                            typeEl.value = action.text || '';
                            typeEl.dispatchEvent(new Event('input', { bubbles: true }));
                            typeEl.dispatchEvent(new Event('change', { bubbles: true }));
                        }
                        break;
                        
                    case 'keyboard':
                        document.activeElement.dispatchEvent(new KeyboardEvent('keydown', {
                            key: action.key,
                            ctrlKey: (action.modifiers || []).includes('ctrl'),
                            shiftKey: (action.modifiers || []).includes('shift'),
                            altKey: (action.modifiers || []).includes('alt'),
                            bubbles: true
                        }));
                        break;
                        
                    case 'script':
                        eval(action.script);
                        break;
                }
            } catch(e) {
                console.error('[SelectorPicker] Action error:', e);
            }
        }
        console.log('[SelectorPicker] All actions executed');
    }
    
    // === SELECTION MODE ===
    function initSelectorPicker() {
        if (document.getElementById('selector-picker-toolbar')) {
            console.log('[SelectorPicker] Toolbar already exists');
            return;
        }
        
        console.log('[SelectorPicker] Initializing selection toolbar...');
        
        // Styles
        const style = document.createElement('style');
        style.id = 'selector-picker-styles';
        style.textContent = `
            .selector-picker-highlight {
                outline: 3px solid #ff6600 !important;
                outline-offset: 2px !important;
                background-color: rgba(255, 102, 0, 0.1) !important;
                cursor: crosshair !important;
            }
            .selector-picker-selected {
                outline: 3px solid #00cc00 !important;
                outline-offset: 2px !important;
                background-color: rgba(0, 204, 0, 0.2) !important;
            }
            #selector-picker-toolbar {
                position: fixed !important;
                top: 0 !important;
                left: 0 !important;
                right: 0 !important;
                background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%) !important;
                color: white !important;
                padding: 12px 20px !important;
                z-index: 2147483647 !important;
                display: flex !important;
                align-items: center !important;
                justify-content: space-between !important;
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif !important;
                font-size: 14px !important;
                box-shadow: 0 4px 20px rgba(0,0,0,0.4) !important;
                gap: 15px !important;
            }
            #selector-picker-toolbar * {
                font-family: inherit !important;
                box-sizing: border-box !important;
            }
            #selector-picker-current {
                flex: 1 !important;
                font-family: 'Consolas', 'Monaco', monospace !important;
                font-size: 13px !important;
                background: rgba(255,255,255,0.1) !important;
                padding: 8px 12px !important;
                border-radius: 6px !important;
                color: #4fc3f7 !important;
                overflow: hidden !important;
                text-overflow: ellipsis !important;
                white-space: nowrap !important;
                min-width: 200px !important;
            }
            #selector-picker-toolbar button {
                padding: 8px 16px !important;
                border: none !important;
                border-radius: 6px !important;
                cursor: pointer !important;
                font-size: 13px !important;
                font-weight: 500 !important;
                transition: all 0.2s !important;
            }
            #selector-picker-confirm {
                background: #4caf50 !important;
                color: white !important;
            }
            #selector-picker-confirm:hover {
                background: #45a049 !important;
            }
            #selector-picker-confirm:disabled {
                background: #666 !important;
                cursor: not-allowed !important;
            }
            #selector-picker-cancel {
                background: #f44336 !important;
                color: white !important;
            }
            #selector-picker-cancel:hover {
                background: #da190b !important;
            }
            body {
                margin-top: 60px !important;
            }
        `;
        document.head.appendChild(style);
        
        // Créer la toolbar
        const toolbar = document.createElement('div');
        toolbar.id = 'selector-picker-toolbar';
        toolbar.innerHTML = `
            <span><strong>Selection Mode</strong> - Click on an element</span>
            <span id="selector-picker-current">Hover over an element...</span>
            <button id="selector-picker-confirm" disabled>Confirm</button>
            <button id="selector-picker-cancel">Cancel</button>
        `;
        document.body.insertBefore(toolbar, document.body.firstChild);
        
        let currentElement = null;
        let selectedSelector = null;
        
        // Générer un sélecteur CSS unique pour un élément
        function generateSelector(el) {
            if (!el || el === document.body || el === document.documentElement) {
                return null;
            }
            
            // Essayer l'ID d'abord
            if (el.id && !el.id.includes(':') && !el.id.includes(' ')) {
                return '#' + CSS.escape(el.id);
            }
            
            // Essayer les attributs uniques
            const uniqueAttrs = ['data-testid', 'data-cy', 'data-test', 'name', 'aria-label'];
            for (const attr of uniqueAttrs) {
                const value = el.getAttribute(attr);
                if (value && !value.includes(' ')) {
                    const selector = el.tagName.toLowerCase() + '[' + attr + '="' + value + '"]';
                    if (document.querySelectorAll(selector).length === 1) {
                        return selector;
                    }
                }
            }
            
            // Utiliser les classes
            if (el.className && typeof el.className === 'string') {
                const classes = el.className.trim().split(/\\s+/).filter(c => 
                    c && !c.includes(':') && !c.startsWith('selector-picker')
                );
                if (classes.length > 0) {
                    const classSelector = el.tagName.toLowerCase() + '.' + classes.map(c => CSS.escape(c)).join('.');
                    if (document.querySelectorAll(classSelector).length === 1) {
                        return classSelector;
                    }
                    for (const cls of classes) {
                        const simpleSelector = el.tagName.toLowerCase() + '.' + CSS.escape(cls);
                        if (document.querySelectorAll(simpleSelector).length === 1) {
                            return simpleSelector;
                        }
                    }
                }
            }
            
            // Construire un chemin avec nth-child
            const path = [];
            let current = el;
            while (current && current !== document.body) {
                let selector = current.tagName.toLowerCase();
                
                if (current.id && !current.id.includes(':')) {
                    path.unshift('#' + CSS.escape(current.id));
                    break;
                }
                
                const parent = current.parentElement;
                if (parent) {
                    const siblings = Array.from(parent.children).filter(c => c.tagName === current.tagName);
                    if (siblings.length > 1) {
                        const index = siblings.indexOf(current) + 1;
                        selector += ':nth-of-type(' + index + ')';
                    }
                }
                
                path.unshift(selector);
                current = parent;
            }
            
            return path.join(' > ');
        }
        
        // Gérer le survol
        function handleMouseOver(e) {
            if (e.target.closest('#selector-picker-toolbar')) return;
            
            e.preventDefault();
            e.stopPropagation();
            
            if (currentElement && currentElement !== e.target) {
                currentElement.classList.remove('selector-picker-highlight');
            }
            
            currentElement = e.target;
            currentElement.classList.add('selector-picker-highlight');
            
            const selector = generateSelector(currentElement);
            document.getElementById('selector-picker-current').textContent = selector || '(element)';
        }
        
        // Gérer le clic
        function handleClick(e) {
            if (e.target.closest('#selector-picker-toolbar')) return;
            
            e.preventDefault();
            e.stopPropagation();
            
            if (currentElement) {
                currentElement.classList.remove('selector-picker-highlight');
                currentElement.classList.add('selector-picker-selected');
                selectedSelector = generateSelector(currentElement);
                document.getElementById('selector-picker-current').textContent = selectedSelector || '(element)';
                document.getElementById('selector-picker-confirm').disabled = false;
            }
        }
        
        // Confirmer la sélection
        document.getElementById('selector-picker-confirm').addEventListener('click', function() {
            if (selectedSelector && window.pywebview && window.pywebview.api) {
                window.pywebview.api.confirmSelector(selectedSelector);
            }
        });
        
        // Annuler
        document.getElementById('selector-picker-cancel').addEventListener('click', function() {
            if (window.pywebview && window.pywebview.api) {
                window.pywebview.api.cancelSelector();
            }
        });
        
        // Ajouter les event listeners
        document.addEventListener('mouseover', handleMouseOver, true);
        document.addEventListener('click', handleClick, true);
        
        // Désactiver les liens
        document.addEventListener('click', function(e) {
            if (!e.target.closest('#selector-picker-toolbar')) {
                e.preventDefault();
            }
        }, true);
    }
    
    // === MAIN ===
    async function main() {
        console.log('[SelectorPicker] Starting main...');
        
        // Wait for body
        const bodyReady = await waitForBody();
        if (!bodyReady) {
            console.error('[SelectorPicker] Body not ready, aborting');
            return;
        }
        
        // Execute previous actions if any
        if (hasActions) {
            console.log('[SelectorPicker] Will execute', previousActions.length, 'actions');
            await executeActions();
            // After actions, init selector mode (if still on same page)
            // If actions caused navigation, this script is destroyed and on_loaded will reinject
        }
        
        // Initialize selector mode
        console.log('[SelectorPicker] Initializing selector mode...');
        initSelectorPicker();
    }
    
    // Run
    main().catch(e => console.error('[SelectorPicker] Main error:', e));
})();
"""


class SelectorPickerApi:
    def __init__(self):
        self.selected_selector = None
        self.window = None
        self.previous_actions = []
    
    def confirmSelector(self, selector):
        print(f"[SelectorPicker] confirmSelector called: {selector}", file=sys.stderr)
        self.selected_selector = selector
        if self.window:
            self.window.destroy()
    
    def cancelSelector(self):
        print("[SelectorPicker] cancelSelector called", file=sys.stderr)
        self.selected_selector = None
        if self.window:
            self.window.destroy()


def main():
    if len(sys.argv) < 2:
        print("Usage: python selector_picker.py <url> [previous_actions_json]", file=sys.stderr)
        sys.exit(1)
    
    url = sys.argv[1]
    print(f"[SelectorPicker] Starting with URL: {url}", file=sys.stderr)
    
    # Get previous actions if provided
    previous_actions = []
    if len(sys.argv) >= 3:
        try:
            previous_actions = json.loads(sys.argv[2])
            print(f"[SelectorPicker] Received {len(previous_actions)} previous actions", file=sys.stderr)
        except json.JSONDecodeError as e:
            print(f"[SelectorPicker] Error parsing actions: {e}", file=sys.stderr)
    
    # Configure persistent storage
    app_dir = os.path.dirname(os.path.abspath(__file__))
    storage_dir = os.path.join(app_dir, 'webview_data')
    browser_storage = os.path.join(storage_dir, 'browser_storage')
    os.makedirs(browser_storage, exist_ok=True)
    
    # Load debug mode from settings
    settings_file = os.path.join(app_dir, 'settings.json')
    debug_mode = False
    if os.path.exists(settings_file):
        try:
            with open(settings_file, 'r', encoding='utf-8') as f:
                settings = json.load(f)
                debug_mode = settings.get('debugMode', False)
        except:
            pass
    
    api = SelectorPickerApi()
    api.previous_actions = previous_actions
    
    window = webview.create_window(
        'CSS Selector Picker - Click an element',
        url,
        width=1200,
        height=800,
        js_api=api
    )
    
    api.window = window
    
    def monitor_and_inject():
        """Continuously monitor page and inject script when needed"""
        import time
        first_run = True
        
        time.sleep(2)  # Initial wait
        
        while True:
            try:
                # Check if window still exists
                if not window or api.selected_selector is not None:
                    break
                
                # Check if toolbar exists
                has_toolbar = window.evaluate_js(
                    "document.getElementById('selector-picker-toolbar') !== null"
                )
                
                if not has_toolbar:
                    print(f"[SelectorPicker] Toolbar missing, injecting... (first={first_run})", file=sys.stderr)
                    sys.stderr.flush()
                    
                    # Inject appropriate script
                    if first_run:
                        script = get_selector_picker_js(previous_actions)
                        first_run = False
                    else:
                        # After navigation, don't re-run actions
                        script = get_selector_picker_js([])
                    
                    window.evaluate_js(script)
                    time.sleep(2)  # Wait for script to initialize
                else:
                    time.sleep(0.5)  # Check less frequently if toolbar exists
                    
            except Exception as e:
                # Window might be destroyed or navigating
                print(f"[SelectorPicker] Monitor error: {e}", file=sys.stderr)
                time.sleep(1)
    
    print("[SelectorPicker] Starting webview...", file=sys.stderr)
    sys.stderr.flush()
    
    webview.start(
        func=monitor_and_inject,
        private_mode=False,
        storage_path=browser_storage,
        debug=debug_mode
    )
    
    print(f"[SelectorPicker] Webview closed, selector: {api.selected_selector}", file=sys.stderr)
    
    if api.selected_selector:
        print(api.selected_selector)
        sys.exit(0)
    else:
        sys.exit(1)


if __name__ == '__main__':
    main()
