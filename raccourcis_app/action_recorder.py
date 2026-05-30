"""
Action Recorder - Version PyQt6 (stable pour Python 3.14)
Utilise PyQt6 WebEngine pour enregistrer les actions.
"""
import sys
import os
import json

RECORDER_JS = """
(function(){
    if(window.__ar)return;
    if(!document.body || !document.head){
        setTimeout(arguments.callee, 100);
        return;
    }
    window.__ar=1;
    var a=window.__arActions||[];
    
    function sel(e){
        if(!e||e===document.body)return'body';
        if(e.id)return'#'+e.id;
        if(e.className&&typeof e.className==='string'){
            var cls=e.className.trim().split(/\\s+/).filter(c=>c&&!c.includes(':')).slice(0,2);
            if(cls.length){var s='.'+cls.join('.');if(document.querySelectorAll(s).length===1)return s;}
        }
        var p=e.parentElement;if(!p)return e.tagName.toLowerCase();
        var c=Array.from(p.children).filter(x=>x.tagName===e.tagName),i=c.indexOf(e)+1;
        return sel(p)+'>'+e.tagName.toLowerCase()+(c.length>1?':nth-child('+i+')':'');
    }
    
    var css=document.createElement('style');
    css.textContent='.arhl{outline:3px solid #f60!important;outline-offset:2px!important}#arbar{position:fixed;top:0;left:0;right:0;height:50px;background:linear-gradient(135deg,#2d1b4e,#1a1a2e);display:flex;align-items:center;padding:0 15px;gap:12px;z-index:2147483647;font-family:-apple-system,BlinkMacSystemFont,sans-serif;box-shadow:0 2px 10px rgba(0,0,0,0.4)}#arbar *{color:#fff;font-size:13px}#arbar button{background:#333;border:1px solid #555;padding:8px 16px;border-radius:6px;cursor:pointer;transition:background 0.2s}#arbar button:hover{background:#444}.arG{background:#4a4!important}.arR{background:#a44!important}#arpnl{position:fixed;top:55px;right:10px;width:320px;max-height:calc(100vh - 70px);background:rgba(30,30,50,0.97);border-radius:10px;z-index:2147483646;overflow:auto;display:none;box-shadow:0 4px 20px rgba(0,0,0,0.4)}#arpnl.show{display:block}.arphead{padding:12px 15px;background:rgba(0,0,0,0.3);font-weight:600;display:flex;justify-content:space-between;align-items:center}.ari{background:rgba(255,255,255,0.08);margin:8px;padding:10px;border-radius:6px;font-size:12px;color:#ccc}.ari:hover{background:rgba(255,255,255,0.12)}.arid{color:#888;word-break:break-all;font-size:11px;margin-top:4px}.ardel{float:right;background:none;border:none;color:#888;cursor:pointer;padding:2px 6px}.ardel:hover{color:#f66}#armod{position:fixed;inset:0;background:rgba(0,0,0,0.7);z-index:2147483647;display:none;align-items:center;justify-content:center}#armod.show{display:flex}.armb{background:#2a2a3e;padding:20px;border-radius:12px;min-width:350px}.armb h3{margin:0 0 15px 0;color:#fff}.armb input{width:100%;padding:12px;margin:5px 0 15px 0;border:2px solid #f60;border-radius:8px;background:#1a1a2e;color:#fff;font-size:14px;box-sizing:border-box}.armb button{padding:10px 20px;margin:0 5px;border:none;border-radius:6px;cursor:pointer}.empty{text-align:center;padding:30px;color:#666}';
    document.head.appendChild(css);
    
    var styleAnim=document.createElement('style');
    styleAnim.textContent='@keyframes arpulse{0%,100%{opacity:1}50%{opacity:0.4}}';
    document.head.appendChild(styleAnim);
    
    var bar=document.createElement('div');bar.id='arbar';
    bar.innerHTML='<span style="display:flex;align-items:center;gap:8px"><span style="width:10px;height:10px;background:#f44;border-radius:50%;animation:arpulse 1s infinite"></span><b>REC</b></span><span id="arcnt" style="background:#f60;padding:4px 12px;border-radius:12px">'+a.length+' action(s)</span><button id="artgl">📋 Actions</button><button id="arwait">⏱️ Pause</button><span style="flex:1"></span><button id="arsav" class="arG">✅ Terminer</button><button id="arcan" class="arR">❌ Annuler</button>';
    document.body.appendChild(bar);
    document.body.style.marginTop='50px';
    
    var pnl=document.createElement('div');pnl.id='arpnl';
    pnl.innerHTML='<div class="arphead"><span>Actions</span><button id="arclear" style="background:none;border:none;color:#888;cursor:pointer">🗑️</button></div><div id="arlist"></div>';
    document.body.appendChild(pnl);
    
    var mod=document.createElement('div');mod.id='armod';
    mod.innerHTML='<div class="armb"><h3 id="armt">Texte</h3><div id="armchoices" style="display:none;margin-bottom:15px"></div><input id="armi" type="text"><div style="text-align:right"><button id="armca" style="background:#555;color:#fff">Annuler</button><button id="armok" style="background:#f60;color:#fff">OK</button></div></div>';
    document.body.appendChild(mod);
    
    var cb=null;
    function ask(t,v,fn){
        document.getElementById('armt').textContent=t;
        var inp=document.getElementById('armi');
        inp.style.display='block';
        document.getElementById('armchoices').style.display='none';
        document.getElementById('armok').style.display='inline-block';
        inp.value=v||'';
        mod.classList.add('show');
        inp.focus();
        inp.select();
        cb=fn;
    }
    
    function askChoice(t,choices,fn){
        document.getElementById('armt').textContent=t;
        document.getElementById('armi').style.display='none';
        document.getElementById('armok').style.display='none';
        var ch=document.getElementById('armchoices');
        ch.style.display='block';
        ch.innerHTML=choices.map(function(c){
            return'<button class="archoice" data-v="'+c.value+'" style="display:block;width:100%;padding:12px;margin:8px 0;background:#444;border:none;color:#fff;border-radius:6px;cursor:pointer;font-size:14px">'+c.label+'</button>';
        }).join('');
        ch.querySelectorAll('.archoice').forEach(function(btn){
            btn.onclick=function(){mod.classList.remove('show');fn(this.dataset.v);};
        });
        mod.classList.add('show');
        cb=fn;
    }
    
    document.getElementById('armok').onclick=function(){mod.classList.remove('show');if(cb)cb(document.getElementById('armi').value);};
    document.getElementById('armca').onclick=function(){mod.classList.remove('show');if(cb)cb(null);};
    document.getElementById('armi').onkeydown=function(e){if(e.key==='Enter')document.getElementById('armok').click();if(e.key==='Escape')document.getElementById('armca').click();};
    
    function upd(){
        document.getElementById('arcnt').textContent=a.length+' action(s)';
        var list=document.getElementById('arlist');
        if(!a.length){list.innerHTML='<div class="empty">Cliquez sur des éléments pour enregistrer</div>';return;}
        list.innerHTML=a.map(function(x,i){
            var t=x.type==='click'?'👆 Clic':x.type==='type'?'⌨️ Saisie':x.type==='wait'?'⏱️ Pause':x.type;
            var d=x.selector||(x.delay+'ms')||'';
            if(x.type==='type')d='"'+x.text+'" → '+x.selector;
            return'<div class="ari"><b>'+(i+1)+'. '+t+'</b><button class="ardel" data-i="'+i+'">×</button><div class="arid">'+d+'</div></div>';
        }).join('');
        list.querySelectorAll('.ardel').forEach(function(btn){btn.onclick=function(){a.splice(+this.dataset.i,1);upd();};});
        window.__arActions=a;
    }
    upd();
    
    function add(x){a.push(x);window.__arActions=a;upd();}
    
    var hov=null;
    document.addEventListener('mouseover',function(e){if(e.target.closest('#arbar,#arpnl,#armod'))return;if(hov)hov.classList.remove('arhl');hov=e.target;hov.classList.add('arhl');},true);
    document.addEventListener('mouseout',function(e){if(e.target.classList)e.target.classList.remove('arhl');},true);
    
    document.addEventListener('click',function(e){
        if(!e.isTrusted)return;if(e.target.closest('#arbar,#arpnl,#armod'))return;
        var el=e.target,s=sel(el),tag=el.tagName.toLowerCase();
        if((tag==='input'||tag==='textarea')&&el.type!=='submit'&&el.type!=='button'){
            e.preventDefault();e.stopPropagation();
            askChoice('Action sur ce champ?',[
                {label:'👆 Clic simple',value:'click'},
                {label:'⌨️ Saisir du texte',value:'type'}
            ],function(choice){
                if(choice==='click'){add({type:'click',selector:s});}
                else if(choice==='type'){ask('Texte à saisir:',el.value,function(t){if(t!==null){add({type:'type',selector:s,text:t,clear:true});el.value=t;el.dispatchEvent(new Event('input',{bubbles:true}));}});}
            });
            return;
        }
        if(tag==='select'){e.preventDefault();e.stopPropagation();ask('Valeur:',el.value,function(t){if(t!==null){add({type:'type',selector:s,text:t});el.value=t;}});return;}
        add({type:'click',selector:s});
    },true);
    
    document.getElementById('artgl').onclick=function(){pnl.classList.toggle('show');};
    document.getElementById('arclear').onclick=function(){a=[];window.__arActions=a;upd();};
    document.getElementById('arwait').onclick=function(){ask('Durée de la pause (ms):','1000',function(v){if(v!==null)add({type:'wait',delay:parseInt(v)||1000});});};
    document.getElementById('arsav').onclick=function(){window.__arDone='save';};
    document.getElementById('arcan').onclick=function(){window.__arDone='cancel';};
    
    console.log('[AR] Ready');
})();
"""

def main():
    if len(sys.argv) < 2:
        print("Usage: python action_recorder.py <url>", file=sys.stderr)
        sys.exit(1)
    
    url = sys.argv[1]
    if not url.startswith(('http://', 'https://')):
        url = 'https://' + url
    
    print(f"[AR] URL: {url}", file=sys.stderr)
    sys.stderr.flush()
    
    app_dir = os.path.dirname(os.path.abspath(__file__))
    user_data_dir = os.path.join(app_dir, 'webview_data', 'qt_browser_data')
    os.makedirs(user_data_dir, exist_ok=True)
    
    from PyQt6.QtWidgets import QApplication
    from PyQt6.QtWebEngineWidgets import QWebEngineView
    from PyQt6.QtWebEngineCore import QWebEngineProfile, QWebEnginePage
    from PyQt6.QtCore import QUrl, QTimer
    
    app = QApplication(sys.argv)
    
    # Créer un profil persistant
    profile = QWebEngineProfile("ActionRecorder", app)
    profile.setPersistentStoragePath(user_data_dir)
    profile.setPersistentCookiesPolicy(QWebEngineProfile.PersistentCookiesPolicy.AllowPersistentCookies)
    
    page = QWebEnginePage(profile)
    browser = QWebEngineView()
    browser.setPage(page)
    browser.setWindowTitle("🔴 Action Recorder")
    browser.resize(1200, 800)
    
    recorded_actions = []
    done_status = [None]  # Liste pour permettre la modification dans les callbacks
    last_url = [None]
    
    def inject_recorder():
        nonlocal recorded_actions
        # Passer les actions depuis Python vers JS
        js_init = f"window.__arActions = {json.dumps(recorded_actions)};"
        page.runJavaScript(js_init)
        page.runJavaScript(RECORDER_JS)
        print(f"[AR] Injected with {len(recorded_actions)} actions", file=sys.stderr)
        sys.stderr.flush()
    
    def save_actions(result):
        nonlocal recorded_actions
        if result and len(result) > len(recorded_actions):
            recorded_actions = result
            print(f"[AR] Saved {len(recorded_actions)} actions", file=sys.stderr)
    
    def check_done(result):
        if result in ['save', 'cancel']:
            done_status[0] = result
            save_final_and_close()
    
    def save_final_and_close():
        def on_final_save(result):
            nonlocal recorded_actions
            if result and len(result) > len(recorded_actions):
                recorded_actions = result
            app.quit()
        page.runJavaScript("window.__arActions || []", on_final_save)
    
    def check_bar(result):
        if not result:
            print("[AR] Bar missing, reinjecting", file=sys.stderr)
            inject_recorder()
    
    def monitor():
        if done_status[0]:
            return
        
        # Sauvegarder les actions
        page.runJavaScript("window.__arActions || []", save_actions)
        
        # Vérifier si l'URL a changé
        current_url = page.url().toString()
        if current_url != last_url[0]:
            if last_url[0]:
                print(f"[AR] Page changed to {current_url[:50]}", file=sys.stderr)
                # Réinjecter après un délai
                QTimer.singleShot(1500, inject_recorder)
            last_url[0] = current_url
        
        # Vérifier si la barre existe
        page.runJavaScript("document.getElementById('arbar') !== null", check_bar)
        
        # Vérifier si terminé
        page.runJavaScript("window.__arDone || ''", check_done)
    
    def on_load_finished(ok):
        if ok:
            QTimer.singleShot(500, inject_recorder)
    
    page.loadFinished.connect(on_load_finished)
    
    # Timer pour le monitoring
    timer = QTimer()
    timer.timeout.connect(monitor)
    timer.start(300)
    
    # Charger l'URL
    browser.setUrl(QUrl(url))
    browser.show()
    
    print("[AR] Starting browser...", file=sys.stderr)
    sys.stderr.flush()
    
    # Exécuter l'application
    app.exec()
    
    print(f"[AR] Done. Status={done_status[0]}, Actions={len(recorded_actions)}", file=sys.stderr)
    sys.stderr.flush()
    
    if done_status[0] == 'cancel' or done_status[0] is None:
        print("CANCELLED")
        sys.exit(1)
    else:
        print(json.dumps(recorded_actions))
        sys.exit(0)


if __name__ == '__main__':
    main()
