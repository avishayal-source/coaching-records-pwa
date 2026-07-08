# Windows setup & first deployment

**You** do the technical setup once (~15 min). **Your user** only signs in with Google and taps Continue.

---

## What the user sees (simple)

| Step | Action |
|------|--------|
| 1 | Open the app link |
| 2 | **Sign in with Google** |
| 3 | **Continue** (creates *Coaching Session Records* folder in their Drive) |
| 4 | Use the app |

Optional: **Use a different folder name** — type a name, no folder picker.

---

## Part 1 — Your Windows setup (one time)

### 1. Install Node.js

Download LTS from [nodejs.org](https://nodejs.org), install, then verify:

```powershell
node --version
npm --version
```

### 2. Google Cloud (~10 minutes)

1. Open [Google Cloud Console](https://console.cloud.google.com/) → create a project
2. Enable **[Google Drive API](https://console.cloud.google.com/apis/library/drive.googleapis.com)** only (no Picker API needed)
3. **[OAuth consent screen](https://console.cloud.google.com/apis/credentials/consent)**: External → app name + your email → add the user's Gmail as **Test user**
4. **[Credentials](https://console.cloud.google.com/apis/credentials)** → **Create credentials** → **OAuth client ID** → **Web application**
   - Authorized JavaScript origins:
     - `http://localhost:5173` (for testing)
     - `https://YOUR-SITE.pages.dev` (add after deploy in step 4)
5. Copy the **Client ID** (ends with `.apps.googleusercontent.com`)

No API key. No project number. One credential only.

### 3. Build the app

```powershell
cd C:\Users\Avishay\projects\agents-mcp-intensive\coaching-records-pwa
copy .env.example .env
notepad .env
```

Paste your Client ID on the one line, save, then:

```powershell
npm install
npm run dev
```

Test at **http://localhost:5173**: sign in → Continue → create a test session.

Production build:

```powershell
npm run build
```

### 4. Deploy to the internet

1. [Cloudflare Pages](https://pages.cloudflare.com) → **Create** → **Direct Upload**
2. Upload everything inside the `dist/` folder
3. Note your URL, e.g. `https://coaching-records-abc.pages.dev`
4. Google Cloud → OAuth client → add that URL under **Authorized JavaScript origins**
5. Open the live URL on Windows and test sign-in + save again

### 5. Hand off to the user

Send them the HTTPS link. On iPhone later: Safari → open link → **Share → Add to Home Screen**.

---

## Checklist

- [ ] Drive API enabled  
- [ ] OAuth Web client created  
- [ ] User's Gmail is a **test user** on consent screen  
- [ ] `.env` has Client ID → `npm run build`  
- [ ] `dist/` uploaded to Cloudflare Pages  
- [ ] Live HTTPS URL added to OAuth origins  
- [ ] Tested sign-in + Continue + save session on live URL  

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| "App not ready" | Rebuild with `VITE_GOOGLE_CLIENT_ID` in `.env` |
| Sign-in blocked | Add user's Gmail as OAuth test user |
| Sign-in fails on live site | Add exact HTTPS URL to OAuth origins |
| Folder not created | Check Drive API is enabled; user must complete sign-in |

---

## Commands reference

```powershell
npm run dev      # local testing
npm run build    # production build → dist/
npm run preview  # preview production build locally
```
