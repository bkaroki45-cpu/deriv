# Deploying Profitera Bot

This folder is the current Deriv App Builder Bot export. It is a standalone
React single-page application, so deploy its generated `dist/` folder as its
own static website rather than putting it behind Django's `/bot/` path.

The recommended production address is `https://bot.profiteraa.com`.

## Before deploying

1. In the Deriv Developer Dashboard, open the registered App Builder app and
   add `https://bot.profiteraa.com` as its redirect URI. Keep the App Builder
   app ID; it is distinct from the main Profitera dashboard's app ID.
2. On the build host, create `bot-app/.env.production` from
   `.env.production.example`, using the App Builder values. Do not commit that
   file. Values are embedded during the build, so changing them requires a
   rebuild.
3. If Google Drive Save/Load is wanted, set `GD_CLIENT_ID`, `GD_APP_ID`, and
   `GD_API_KEY`, and add `https://bot.profiteraa.com` to Google's authorised
   JavaScript origins. Leaving them blank only disables Drive; local XML
   import/export remains available.

## Build and publish

Use Node 22 or newer:

```powershell
cd bot-app
npm ci
npm run build
```

Publish every file inside `bot-app/dist/` to the document root of
`bot.profiteraa.com`. Configure the web server with an SPA fallback: requests
for routes such as `/bot-builder` must return `index.html`, while existing
static assets must be served unchanged.

For Nginx, the essential location is:

```nginx
root /var/www/profitera-bot;
index index.html;
location / {
    try_files $uri $uri/ /index.html;
}
```

After DNS, TLS, and the static site are live, add this to the environment used
by the main Profitera Django app and restart it:

```env
PROFITERA_BOT_URL=https://bot.profiteraa.com
```

Then `/automatic-trade/`, `/build-bot/`, and `/bot-builder/` open the current
Deriv Bot app. The Bot uses its own Deriv OAuth session and App Builder app ID;
do not copy Deriv access tokens from Django into browser storage.

## Acceptance check

1. Open `https://bot.profiteraa.com` in a private browser window.
2. Sign in to a Deriv **demo** account.
3. Import an XML strategy and confirm its blocks load.
4. Run a small demo strategy, then check its transaction/contract in Deriv.
5. Confirm the bot's journal, balance, and contract result agree with Deriv.

Only move to a real account after the demo checks match.
