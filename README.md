# Clinic.exe

An AI equipment planner for new clinics. A visitor describes their clinic to a chat assistant, which builds
an equipment list from the Valuemed sample catalogue, grouped into four checklist categories. Room equipment
appears in a live 3D model of the clinic. The visitor then reviews the list and sends a quote request,
which is emailed to the sales team.

## Project layout

```
app.py              Flask server: serves public/, plus /api/chat, /api/catalog and /api/quote (sends the email)
ai.py               The assistant: prompt, Groq call, and build_plan (picks equipment from the clinic profile)
requirements.txt    Python dependencies (also tells Vercel this is a Flask app)
vercel.json         Forces Vercel's Flask preset
public/             Everything the browser loads (Vercel serves this folder directly)
  index.html        Landing page and planner
  css/styles.css
  images/hero.jpg   Landing page photo (Unsplash)
  js/               Loaded in this order (see index.html); main.js starts the app
    catalogue.js    Product data, also read by ai.py
    core.js         Shared helpers and state: the list, undo/redo, toasts, categories, clinic profile
    list.js         Equipment list panel, quantities, product details, full-view / confirm popup
    viz.js          3D workspace (3d/ in an iframe), its full view and room switcher
    chat.js         AI assistant panel and the planner page
    pages.js        Step badges, contact details and sales handoff pages
    landing.js      Landing page
    main.js         Start-up
  3d/               Standalone 3D clinic planner (3d.html, 3d-engine.js, 3d-app.js)
tests/              Python checks (no real AI or email calls)
```

The front end uses plain scripts, so there is no build step. The files share one global scope, which is
why their order in `index.html` matters: `main.js` must load last.

## Run locally

```
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
.venv/bin/python app.py              # http://localhost:5001
```

Settings go in a `.env` file next to `app.py` (never committed):

| Variable | What it is |
|---|---|
| `GROQ_API_KEY` | Groq API key for the assistant |
| `MODEL` | Groq model, e.g. `openai/gpt-oss-20b` |
| `SMTP_HOST`, `SMTP_PORT` | Mail server, e.g. `smtp.gmail.com` and `465` |
| `SMTP_USER`, `SMTP_PASSWORD` | Account the request emails are sent from. For Gmail, use an App Password |
| `MAIL_TO` | Where requests go. Leave it empty to use `SMTP_USER`; separate several addresses with commas |

Without the SMTP settings, submissions are still saved to `quotes/`, but no email is sent.

## Tests

Run these from the project root:

```
.venv/bin/python -m tests.test_build_plan
.venv/bin/python -m tests.test_quote
.venv/bin/python -m tests.test_chat_retry
```

## Deploy (Vercel)

Push to GitHub, then add the same variables as `.env` in Vercel → Settings → Environment Variables and
redeploy. On Vercel, saved copies of requests go to `/tmp` and don't last, so the email is the record.
