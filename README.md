# Coaching Session Records (PWA)

Track coaching session notes backed up to Google Drive.

## For the daily user (2 steps)

1. **Sign in with Google**
2. Tap **Continue** — the app creates a folder called *Coaching Session Records* in your Drive

That's it. No API keys, no technical setup.

## For the person who deploys (you, once)

See **[WINDOWS_SETUP.md](./WINDOWS_SETUP.md)** — about 15 minutes on Windows: Google Cloud (Drive API + one OAuth ID), build, upload to Cloudflare Pages.

You put **one value** in `.env` before building (`VITE_GOOGLE_CLIENT_ID`). End users never see that file.

```powershell
cd coaching-records-pwa
copy .env.example .env
notepad .env
npm install
npm run build
```

Upload the `dist/` folder to [Cloudflare Pages](https://pages.cloudflare.com) (Direct Upload).

## Features

- Session form: client name, date (DD/MM/YYYY), summary
- Auto-backup every 60 seconds while editing
- Success message when closing a record
- View saved sessions in plain language (not JSON)
