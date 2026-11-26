# Fondation Arrawaj — Carte interactive des témoignages

Carte interactive de témoignages avec un tableau de bord éditorial et des ressources dans `images/`.

## Déploiement

Site statique : héberger `index.html` à la racine suffit.

- **Vercel** : importer le dépôt avec le preset « Other ».
- Configurez dans les variables Vercel, pour les environnements utilisés :
  - `ADMIN_USERNAME` et `ADMIN_PASSWORD` pour créer le compte administrateur principal au premier accès.
  - `ADMIN_GITHUB_TOKEN`, un jeton à accès limité avec lecture et écriture du contenu du dépôt.
  - `ADMIN_SESSION_SECRET`, une longue valeur aléatoire distincte du mot de passe.
  - `GITHUB_REPOSITORY` (`HoussamByoud92/arrawaj-map`) et `GITHUB_BRANCH` (`main`) si le dépôt ou la branche changent.
- Après modification des variables, redéployez Vercel. Ne mettez jamais ces secrets dans Git.
- Gardez `ADMIN_SESSION_SECRET` stable : il chiffre les données partagées. Le changer sans migration
  rend les comptes et le contenu existants illisibles.

## Dépendances externes (chargées en ligne)

- Fond de carte : Leaflet + CARTO
- Polices : Google Fonts
- Lecture des vidéos : YouTube ou fichiers vidéo importés

## Back-office

Open `/admin` on the same browser and origin as the public page. The dashboard manages
requests, approvals, testimonial text, and map visibility. You can keep a YouTube/direct
video URL or import a video file (up to 200 MB) when adding or editing a story. Submitted
request videos can be previewed and are carried into the story when accepted.

Photos imported in the story editor and images in custom sections are committed under `images/`.
CMS content and administrator accounts are stored encrypted in `data/site-content.json` and
`data/admin-users.json` through the GitHub Contents API. New users receive explicit permissions
for stories, page content, user management, and settings. Passwords are stored as scrypt hashes
inside the encrypted account file. The primary administrator can update their own display name
and password in their profile.

Section order is set in the page editor. Each custom section supports French and Arabic titles,
optional copy, and an image, a direct video URL, or a YouTube URL. Changes appear on the public
site when it refreshes its shared CMS copy.

Imported video files remain in browser IndexedDB; use a direct video URL or YouTube link when
the video must be available to all visitors. GitHub image uploads are limited to 3 MB per file.
