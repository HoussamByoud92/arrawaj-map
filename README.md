# Fondation Arrawaj — Carte interactive des témoignages

One-page autonome (HTML unique). Toutes les images (logo, photos clients, miniatures vidéo)
sont intégrées dans `index.html` — aucun fichier externe nécessaire.

## Déploiement

Site statique : héberger `index.html` à la racine suffit.

- **Vercel** : import du repo → framework preset « Other » → Deploy.
- Mise à jour : modifier `index.html`, puis `git commit` + `git push` (redéploiement automatique).
- Vercel runs `api/admin.js` to protect `/admin` with HTTP Basic authentication. Configure
  `ADMIN_USERNAME` and `ADMIN_PASSWORD` in the Vercel project’s Environment Variables for
  Production, Preview, and Development. Use the administrator credentials supplied privately;
  do not put them in source control. The admin endpoint fails closed until both values are set.

## Dépendances externes (chargées en ligne)

- Fond de carte : Leaflet + CARTO
- Polices : Google Fonts
- Lecture des vidéos : YouTube ou fichiers vidéo importés

## Back-office (prototype)

Open `/admin` on the same browser and origin as the public page. The dashboard manages
requests, approvals, testimonial text, and map visibility. You can keep a YouTube/direct
video URL or import a video file (up to 200 MB) when adding or editing a story. Submitted
request videos can be previewed and are carried into the story when accepted.

Imported videos are stored as blobs in IndexedDB on that browser and their IDs are kept in
`localStorage`. They work between the admin and public page on the same origin and browser,
but are not uploaded to shared hosting and are not visible to other visitors or devices.
The CMS itself also stores content in browser `localStorage`. Use a persistent shared API and
object storage before using the dashboard as a multi-user publishing system.
