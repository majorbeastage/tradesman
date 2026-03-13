# Dev server fails after every restart (spawn EPERM)

Windows security often blocks the bundler (esbuild) and causes **spawn EPERM**. Do the following **once**; the exclusion persists across restarts.

---

## 1. Add a permanent Windows Defender exclusion (one time)

1. Press **Win**, type **Windows Security**, open it.
2. **Virus & threat protection** → **Manage settings** (under "Virus & threat protection settings").
3. Scroll to **Exclusions** → **Add or remove exclusions** → **Add an exclusion** → **Folder**.
4. Add this folder (use your actual project path if different):  
   `c:\Users\snyde\tradesman-systems`
5. Click **Select Folder**. The exclusion is saved and stays after restart.

---

## 2. After each restart: start the dev server

**Option A – Double‑click (easiest)**  
- In File Explorer go to the `tradesman` folder.  
- Double‑click **`start-dev.ps1`**.  
- If PowerShell asks to allow scripts, choose “Run once” or “Yes”.  
- When you see “Local: http://localhost:5173”, open that in your browser.

**Option B – Terminal**  
```powershell
cd c:\Users\snyde\tradesman-systems\tradesman
npm run dev
```
Or:
```powershell
cd c:\Users\snyde\tradesman-systems\tradesman
.\start-dev.ps1
```

**Option C – Clear cache then start (if it still fails)**  
Double‑click **start-dev.ps1** (it clears the Vite cache first), or run:
```powershell
cd c:\Users\snyde\tradesman-systems\tradesman
.\start-dev.ps1
```

---

## 3. If it still fails every time

- Confirm the exclusion in Step 1 is still there (Windows Security → Exclusions).
- Add a second exclusion for:  
  `c:\Users\snyde\tradesman-systems\tradesman\node_modules`
- Run PowerShell or Command Prompt **as Administrator**, then run `npm run dev` from the `tradesman` folder.
- If you use another antivirus (McAfee, Norton, etc.), add the same folder exclusions there.
