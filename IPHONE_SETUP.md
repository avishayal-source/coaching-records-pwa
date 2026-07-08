# iPhone setup — web app (PWA)

Use the **same app** as on Windows: open a link in **Safari**, sign in with Google, save sessions to Drive. Optionally **Add to Home Screen** so it opens like an app.

---

## Overview

| Who | What |
|-----|------|
| **You (once)** | Deploy to HTTPS (Cloudflare Pages), add URL to Google OAuth |
| **iPhone user** | Open link in Safari → Sign in → Continue → (optional) Add to Home Screen |

---

## Part 1 — Deploy to the internet (on your Windows PC)

### Step 1: Confirm `.env` has your Google Client ID

```powershell
cd C:\Users\Avishay\projects\agents-mcp-intensive\coaching-records-pwa
notepad .env
```

**Expect:** one line like `VITE_GOOGLE_CLIENT_ID=....apps.googleusercontent.com`

---

### Step 2: Production build

```powershell
npm install
npm run build
```

**Expect:** folder `dist/` with `index.html`, `assets/`, `apple-touch-icon.png`, service worker files.

**Optional — preview before deploy:**

```powershell
npm run preview
```

Open the URL shown (usually `http://localhost:4173`) and test sign-in.

---

### Step 3: Deploy to Cloudflare Pages

**Option A — Connect GitHub (recommended, auto-updates on push)**

1. Open [Cloudflare Pages](https://dash.cloudflare.com/?to=/:account/pages)
2. **Create application** → **Connect to Git**
3. Select repo: **avishayal-source/coaching-records-pwa**
4. Build settings:
   - **Framework preset:** None (or Vite)
   - **Build command:** `npm run build`
   - **Build output directory:** `dist`
5. **Environment variables** (Production):
   - Name: `VITE_GOOGLE_CLIENT_ID`
   - Value: your Client ID (same as `.env`)
6. **Save and Deploy**

**Expect:** after 1–3 minutes, a URL like `https://coaching-records-pwa.pages.dev`

**Option B — Manual upload (one-time)**

1. [Cloudflare Pages](https://pages.cloudflare.com) → **Create** → **Direct Upload**
2. Upload **all files inside** `dist/` (not the `dist` folder itself)
3. Note the HTTPS URL

---

### Step 4: Add live URL to Google OAuth

1. [Google Cloud Credentials](https://console.cloud.google.com/apis/credentials)
2. Open your **OAuth 2.0 Client ID** (Web application)
3. **Authorized JavaScript origins** → add your **exact** live URL, e.g.:
   ```
   https://coaching-records-pwa.pages.dev
   ```
   (no trailing slash)
4. Keep `http://localhost:5173` for local dev
5. **Save**

**Expect:** changes apply within a few minutes.

---

### Step 5: Test on Windows in the browser

1. Open your **HTTPS** Pages URL (not localhost)
2. **Sign in with Google** → **Continue** → create a test session → **Save**

**Expect:** same behavior as local dev; session appears in Drive and in the sidebar.

If sign-in fails, the live URL is usually missing from OAuth origins (Step 4).

---

## Part 2 — Install on iPhone

### Step 6: Open the app in Safari

**Do:** On iPhone, open **Safari** (not Chrome) and go to your Pages URL.

**Expect:** landing page **Coaching Session Records** with **Sign in with Google**.

**Tip:** First time, complete sign-in **in Safari** before adding to Home Screen.

---

### Step 7: Sign in and set up backup folder

**Do:**

1. Tap **Sign in with Google**
2. Choose the Google account (must be a **Test user** if OAuth app is still in Testing)
3. Approve access
4. Tap **Continue** on “Almost ready”

**Expect:**

- Home screen **Coaching Sessions**
- Path: `Google Drive / Coaching Session Records`
- Sidebar with saved sessions (empty at first)

---

### Step 8: Add to Home Screen (optional but recommended)

**Do:**

1. Tap the **Share** button (square with arrow up)
2. Scroll → **Add to Home Screen**
3. Name: **Sessions** (or keep default)
4. Tap **Add**

**Expect:**

- Icon on home screen (blue notes icon)
- Opens **full screen** without Safari address bar (standalone PWA)
- Same sign-in and data as in Safari

---

### Step 9: Daily use on iPhone

| Action | How |
|--------|-----|
| New session | **+ New** or **New session record** |
| Auto-save | Every ~60 seconds after you open **Session summary** |
| Save now | Tap **Save** |
| Open old session | Sidebar → client name → date |
| Close session | **Close record** → **Save & close** |

**Expect:** files in Google Drive under `Coaching Session Records / FirstName_LastName / YYYY-MM-DD.json`

---

## Checklist

- [ ] `npm run build` succeeds with `VITE_GOOGLE_CLIENT_ID` set  
- [ ] App deployed to **HTTPS** on Cloudflare Pages  
- [ ] Live URL in Google OAuth **Authorized JavaScript origins**  
- [ ] Sign-in + save tested on live URL (desktop)  
- [ ] Sign-in + save tested on iPhone Safari  
- [ ] (Optional) Added to Home Screen  

---

## Troubleshooting (iPhone)

| Problem | Fix |
|---------|-----|
| Sign-in blocked | Add iPhone user’s Gmail as OAuth **Test user** |
| Sign-in works on PC, fails on phone | Add exact `https://....pages.dev` to OAuth origins |
| “App not ready” on live site | Set `VITE_GOOGLE_CLIENT_ID` in Cloudflare build env and redeploy |
| Google popup closes / error | Use **Safari**; disable content blockers for the site |
| Home Screen icon generic | Redeploy latest build (includes `apple-touch-icon.png`) |
| Backup failed | Check cell/Wi‑Fi; sign out and sign in again |

---

## Updating the app later

**GitHub + Cloudflare:** push to `main` → Cloudflare rebuilds automatically.

**Manual upload:** `npm run build` → upload new `dist/` to Pages.

Users may need to close the Home Screen app and reopen to get updates (service worker auto-updates).
