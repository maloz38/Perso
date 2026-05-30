import spotipy
from spotipy.oauth2 import SpotifyOAuth
import time

# --- ZONE A MODIFIER ---
CLIENT_ID = '75e2b9d25f614e94a056ab5651b94dd9'
CLIENT_SECRET = '5fec4a00e13440bf9f2b7ba90bef9503'
NOM_PLAYLIST = "bazzze"

# Liste de vos artistes (respectez les guillemets et virgules)
ARTISTES = [
#    "Ludwig von 88",
#    "Les sheriff",
#    "parabellum",
#    "tagada jones",
#    "Les ramoneur de menhirs",
#    "bérurier noir",
#    "noir désir",
#    "renaud",
#    "les garçons bouchers",
#    "gogol premier",
#    "oth",
#    "indochine",
#    "lomepal",
#    "la secte phonétik",
#    "banlieue rouge",
#    "manau",
#    "partenaire particulier",
#    "téléphone",
#    "gauvain sers",
#    "stromae"
#    "aldebert",
#    "orelsan",
#    "les inconnus",
#    "les fatals picards"
]
# -----------------------

# Connexion (Notez l'utilisation de 127.0.0.1 comme convenu)
sp = spotipy.Spotify(auth_manager=SpotifyOAuth(
    client_id=CLIENT_ID,
    client_secret=CLIENT_SECRET,
    redirect_uri="http://127.0.0.1:8888/callback",
    scope="playlist-modify-public playlist-modify-private"
))

user_id = sp.current_user()['id']
print(f"--- Connecté au compte : {user_id} ---")

# Gestion de la playlist (Création ou Récupération)
playlist_id = None
user_playlists = sp.current_user_playlists()
for playlist in user_playlists['items']:
    if playlist['name'] == NOM_PLAYLIST:
        playlist_id = playlist['id']
        break

if not playlist_id:
    print(f"Création de la playlist '{NOM_PLAYLIST}'...")
    playlist_created = sp.user_playlist_create(user_id, NOM_PLAYLIST)
    playlist_id = playlist_created['id']
else:
    print(f"Playlist '{NOM_PLAYLIST}' existante trouvée.")

# Boucle principale sur les artistes
for artiste_nom in ARTISTES:
    print(f"\nTraitement de l'artiste : {artiste_nom}")
    
    # 1. Recherche de l'artiste
    search = sp.search(q='artist:' + artiste_nom, type='artist', limit=1)
    if not search['artists']['items']:
        print(f"ERREUR : Artiste '{artiste_nom}' introuvable sur Spotify.")
        continue
    
    artist_id = search['artists']['items'][0]['id']
    
    # 2. Récupération de TOUS les albums (gestion de la pagination)
    albums = []
    results = sp.artist_albums(artist_id, album_type='album', limit=50) # 'album' évite les singles
    albums.extend(results['items'])
    
    while results['next']:
        results = sp.next(results)
        albums.extend(results['items'])
        
    print(f" -> {len(albums)} albums trouvés.")

    # 3. Récupération des titres
    track_uris = []
    for album in albums:
        # On récupère les pistes de chaque album
        tracks_in_album = sp.album_tracks(album['id'])
        for track in tracks_in_album['items']:
            track_uris.append(track['uri'])
            
    print(f" -> {len(track_uris)} titres prêts à l'ajout.")

    # 4. Ajout par paquets de 100 (Limitation technique Spotify)
    if track_uris:
        for i in range(0, len(track_uris), 100):
            batch = track_uris[i:i+100]
            try:
                sp.playlist_add_items(playlist_id, batch)
                print(f"    ... Ajout du lot {i}-{i+len(batch)}")
                time.sleep(0.2) # Petite pause sécurité
            except Exception as e:
                print(f"    Erreur sur un lot : {e}")
    else:
        print("    Aucun titre trouvé.")

print("\n--- TERMINE ! Tout est dans Spotify ---")