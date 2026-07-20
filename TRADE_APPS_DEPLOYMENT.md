# Profitera contract trading interfaces

The Digits, Rise/Fall, and Accumulators exports are independent Deriv App
Builder applications. They are combined in Profitera through one route:
`/trade/`, which provides a common contract selector and launches each static
application below it.

| App | Source folder | Production URL | Static build folder |
| --- | --- | --- | --- |
| Digits | `digits-app` | `https://profiteraa.com/trade/digits/` | `digits-app/out/` |
| Rise/Fall | `rise-fall-app` | `https://profiteraa.com/trade/rise-fall/` | `rise-fall-app/out/` |
| Accumulators | `accumulators-app` | `https://profiteraa.com/trade/accumulators/` | `accumulators-app/out/` |

## Required Deriv configuration

For each app, use the **same approved Partner/App ID** if Deriv has approved
your markup arrangement for that ID. In Deriv's developer dashboard, register
the matching production URL above as a redirect URI. This is the only reliable
way for attribution/markup to be associated with the trades. A `3%` label or a
`PROFITERA_MARKUP_PERCENT` setting in Django does not levy or earn a Deriv
markup.

Copy each `.env.production.example` to `.env.production`, fill in the approved
App ID and any Deriv-provided referral value, then build it with Node 22+:

```powershell
cd digits-app # or rise-fall-app / accumulators-app
npm install
npm run build
```

Upload the contents of each generated `out/` folder to the matching server
directory. Configure the web server to serve the files under those exact route
prefixes and fall back to the application `index.html` for client routes such
as `/trade/digits/reports/`.

Finally configure the main Django environment and restart it:

```env
PROFITERA_DIGITS_URL=https://profiteraa.com/trade/digits/
PROFITERA_RISE_FALL_URL=https://profiteraa.com/trade/rise-fall/
PROFITERA_ACCUMULATORS_URL=https://profiteraa.com/trade/accumulators/
```

## Verification sequence

1. Visit `/trade/` and open each contract family.
2. Log into a Deriv **demo** account in each app.
3. Confirm its available markets and proposal terms come from Deriv.
4. Buy one small demo contract of each available type.
5. Compare the contract ID, buy price, payout/profit/loss, and final settlement
   with Deriv before allowing real-account use.
