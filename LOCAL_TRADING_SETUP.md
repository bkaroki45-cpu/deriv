# Start Profitera trading locally

The buttons on `http://127.0.0.1:8000/trade/` use these local applications:

| Interface | Local address |
| --- | --- |
| Digits | `http://127.0.0.1:3001/trade/digits/` |
| Rise/Fall | `http://127.0.0.1:3002/trade/rise-fall/` |
| Accumulators | `http://127.0.0.1:3003/trade/accumulators/` |
| Bot | `http://127.0.0.1:4003/` |

## First-time steps

1. In the Deriv Developer Dashboard, add the three trading URLs (Digits,
   Rise/Fall, and Accumulators) to the shared trading App Builder App ID. Add
   the Bot URL to the separate App Builder App ID used by `bot-app`. Each URL
   must match exactly, including its path and trailing slash where shown.
2. Open PowerShell in the project folder and run:

   ```powershell
   .\scripts\start-local-trading.ps1
   ```

3. In a second PowerShell window, start Django:

   ```powershell
   .\env\Scripts\python.exe manage.py runserver
   ```

4. Open `http://127.0.0.1:8000/trade/` and select a contract type.

The first startup may take about a minute while Next.js compiles. Use a Deriv
demo account first. Login does not work until the redirect URLs in step 1 have
been registered with Deriv.

## Production

For `profiteraa.com`, follow `TRADE_APPS_DEPLOYMENT.md` instead. The local URLs
are development-only defaults and disappear when `DEBUG=False`.
