# Lyra — Lecteur de musique Fluent pour Windows 11

Lecteur de musique local au design Windows 11 (Fluent) : thème adaptatif
à la pochette, bibliothèque indexée en SQLite, scan incrémental automatique.

## Fonctions (v1.0.0)

- **Thème adaptatif** : l'interface prend la couleur dominante de la pochette
  en cours (contraste vérifié, transition douce, retour au neutre sinon).
- **Clair / Sombre / Système** avec thème de fenêtre natif synchronisé.
- **Bibliothèque** : Titres, Albums, Artistes, Playlists, Favoris, Récents,
  recherche globale.
- **Scan automatique** : les dossiers choisis sont rescanés à chaque ouverture
  (incrémental : seul le nouveau est lu) et surveillés en direct. Un fichier
  déposé pendant que Lyra tourne est indexé immédiatement.
- **Filtres réglables** : durée minimale (60 s par défaut) et taille minimale
  (100 Ko par défaut) ; écran « Fichiers ignorés » avec ajout forcé en un clic.
- **Écran Lecture en cours** plein écran : pochette, file d'attente.
- **Égaliseur** 5 bandes (Web Audio), aléatoire, répétition, glisser-déposer.
- Formats : MP3, FLAC, M4A, OGG, OPUS, WAV. Index SQLite, pochettes extraites.

## Build local

```powershell
# Prérequis : Rust (stable) + WebView2 (inclus dans Windows 11)
cargo install tauri-cli --version "^2" --locked
./scripts/gen-icon.ps1
cargo tauri dev    # développement
cargo tauri build  # .exe + installateur NSIS signé
```

## Build automatique (GitHub Actions)

Le workflow `.github/workflows/build.yml` compile, signe et publie :

- à chaque push sur `main` → artefact `lyra-windows` (exe + installateur) ;
- à chaque tag `v*` → **Release GitHub** avec les exécutables signés.

### Signature (recommandé : une seule fois)

Créez le certificat **une fois** puis ajoutez-le aux secrets du dépôt
(`Settings → Secrets → Actions`) pour que la signature reste identique :

```powershell
$cert = New-SelfSignedCertificate -Type CodeSigningCert -Subject "CN=Lyra, O=Lyra" -KeyUsage DigitalSignature -CertStoreLocation "Cert:\CurrentUser\My"
$pwd2 = ConvertTo-SecureString -String "VOTRE_MOT_DE_PASSE" -Force -AsPlainText
Export-PfxCertificate -Cert $cert -FilePath lyra.pfx -Password $pwd2
$b64 = [Convert]::ToBase64String([IO.File]::ReadAllBytes("lyra.pfx"))
Set-Content -Path lyra-pfx-base64.txt -Value $b64
# Secrets : LYRA_PFX_BASE64 (contenu de lyra-pfx-base64.txt) et LYRA_PFX_PASSWORD
```

> ⚠️ Un certificat auto-signé n'enlève pas l'avertissement SmartScreen
> (« éditeur inconnu »). Pour la distribution : partagez le code source de ce
> dépôt public, vérifiez le SHA256 du fichier et passez par
> « Informations complémentaires → Exécuter quand même ».
> Pour une signature reconnue par SmartScreen : Azure Trusted Signing (~10 $/mois)
> ou certificat OV/EV (200–400 $/an).

## Utiliser la Release

Deux fichiers sont publiés pour chaque version :

- `lyra.exe` : version portable, aucune installation (Windows 11 inclut WebView2).
- `Lyra_1.0.0_x64-setup.exe` : installateur NSIS (menu Démarrer, désinstallateur).
- `lyra-codesign.cer` : certificat public utilisé pour signer (voir ci-dessous).

Pour que Windows reconnaisse l'éditeur du fichier signé, installez le certificat
public : double-clic sur `lyra-codesign.cer` → « Installer le certificat » →
« Autorités de certification racines de confiance ». À ne faire que si vous faites
confiance au fichier téléchargé depuis cette Release.
## Roadmap

Contrôles médias système (SMTC), paroles synchronisées (LRC), crossfade,
effet Mica, icône zone de notification, multi-langue.

Licence : MIT.
