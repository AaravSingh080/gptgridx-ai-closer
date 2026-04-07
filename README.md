# GPTGRIDX Premium Chatbot Project

You currently have **two backend options** in this repo:

1. `server.js` (simple demo backend)
   - endpoints: `/health`, `/chat`
   - easiest for quick UI testing

2. `src/server.js` (advanced Closer backend)
   - endpoints: `/health`, `/api/chat`, `/api/faq-buttons`, `/api/reload-knowledge`
   - includes stage logic, knowledge file loading, Twilio SMS and Google Sheets integrations

## File placement (important)

### A) In your local VS Code project (Node backend)
Keep these files in your project folder:
- `server.js` or `src/server.js`
- `.env`
- `package.json`
- `knowledge/` (if using advanced backend)

### B) In Shopify theme code
Only put UI files in Shopify:
- snippet: chatbot HTML/CSS (`.liquid` snippet)
- asset: chatbot JS
- include snippet + JS from `theme.liquid`

Do **not** put Node `server.js` in Shopify.

## Why Twilio/Sheets tokens were missing before
The short `.env.example` only matched the simple `server.js`. 
Now `.env.example` includes optional Twilio + Google Sheets variables for `src/server.js` as well.

## Run (simple mode)
```bash
npm install
cp .env.example .env
npm run dev
```
Open: `http://localhost:3000`

## Which backend should you use now?
- If you're still building UI quickly: use `server.js`
- If you want lead alerts + Sheets + richer GPTGRIDX logic: switch to `src/server.js`

## Google Sheets without Google Cloud billing (Option A)

Use Google Apps Script webhook with the advanced backend:

1. Create a Google Sheet.
2. Open Extensions -> Apps Script and add a `doPost(e)` handler that appends incoming JSON to rows.
3. Deploy as Web App and copy URL.
4. Put URL in `.env`:

```
GOOGLE_APPS_SCRIPT_WEBHOOK_URL=https://script.google.com/macros/s/.../exec
```

When this variable is set, `src/server.js` logs leads through the webhook and skips service-account Sheets logging.
