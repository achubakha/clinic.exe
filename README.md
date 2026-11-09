# Clinic.exe: an AI equipment planner for new clinics

Clinic.exe turns "I'm opening a clinic" into a complete, priced equipment list, a 3D layout of the rooms and a
quote request for the sales team, all from one conversation.

| | |
|---|---|
| **Source code** | https://github.com/achubakha/clinic.exe |
| **Slides** | https://docs.google.com/presentation/d/1jXPcHtzHY57eCmKzD-BVRG9OVMNH3IJb/edit?slide=id.p4#slide=id.p4 |
| **Demo video** |[ https://drive.google.com/file/d/1TcThVqyIrKoKGhQV35aaevt3mCt5jLOX/view?usp=drive_link](https://drive.google.com/file/d/1maK9_LXDUiYBauVWA5pD6J-2drwEk3A6/view) |

---

## The problem

Opening a clinic means buying dozens of items, from exam stools and diagnostic sets to sharps containers and
sterilization supplies. Buyers usually piece the list together from catalogues and memory. That makes it easy
to miss essentials, overshoot the budget, or end up with a list the supplier's sales team can't quote from
quickly.

## What Clinic.exe does

1. **Asks about the clinic.** An AI assistant asks one short question at a time: the type of practice, the
   number of rooms, the budget and any extra services.
2. **Builds the equipment list.** It picks products from the catalogue: essential items first, then
   recommended ones, with per-room items scaled to the number of rooms. If the budget is too small, it
   says what's missing and offers a budget that would cover it.
3. **Organises the list into a checklist.** Every product falls into one of four categories: Clinical
   Examination, Medical Devices & Utilities, Consumables & PPE, and IT & Administrative. A full view shows the
   whole list by category, so gaps are easy to spot.
4. **Shows the clinic in 3D.** Room equipment such as chairs, stools, beds, carts and monitors appears in a
   live 3D model of the clinic, room by room and floor by floor. Each piece can be dragged into place.
5. **Lets you change anything.** You can ask the assistant ("remove the eye magnet", "add a crash cart") or
   edit directly: change quantities, remove items, and undo or redo changes.
6. **Sends the quote request.** The buyer confirms the list and adds contact details, and the request is
   emailed to the sales team. It can also be copied or opened as an email draft.

Supported clinic types: family practice, urgent care, dental, optometry, dermatology, cardiology,
gynecology, wound care, long-term care and physiotherapy.

## How to access it

The app runs in any modern browser, on desktop or phone, and needs no account. Start it as described in
[Run it locally](#run-it-locally), then:

1. Open **http://localhost:5001** and click **Get started**.
2. Tell the assistant about your clinic, or tap a suggestion. For example:
   *"I'm opening an optometry clinic with 3 rooms and a $20,000 budget, no extra services."*
3. The equipment list and the 3D clinic appear once the assistant has built the list.
   - **Full view** above the list shows the list by category.
   - **Full view** on the 3D panel opens the room planner.
4. Click **Finalize list**, confirm the list, and enter contact details (test details are fine).
5. On the **Sales handoff** page, click **Submission** to email the request, or **Copy request** or
   **Open email draft**.

> This is a demo. It uses a 66-product sample of Valuemed's catalogue, and prices are illustrative, not a quote.

## How it works

```
Browser (HTML, CSS, JavaScript; WebGL 3D)
   │  /api/chat      the assistant's turn: extract the clinic profile, apply list edits
   │  /api/quote     re-price the list from the catalogue, then email the request
   ▼
Flask server (Python, on Vercel) ──► Groq LLM (gpt-oss)        conversation
                                 └─► SMTP (e.g. Gmail)          quote request email
```

Some design choices:

- **The AI talks; rules decide.** The language model interviews the user and turns requests into actions.
  The equipment list is then built by fixed rules (priority, rooms, budget), so the result is predictable and
  never goes over budget.
- **Prices never come from the AI or the browser.** The server re-reads every name and price from the
  catalogue before the quote request is sent.
- **One catalogue file** (`data/catalogue.js`) is used by both the browser and the server.

## Tech stack

Python · Flask · Groq API (gpt-oss) · plain JavaScript (no framework or build step) · custom WebGL 3D
engine · Vercel

## Project structure

```
app.py              Flask server: pages, /api/chat, /api/catalog, /api/quote (email)
ai.py               The assistant: prompt, Groq call, and the rules that build the list
data/catalogue.js   Product catalogue, shared by the server and the browser
public/             Everything else the browser loads (Vercel serves this folder directly)
  index.html        Landing page and planner
  css/  images/
  js/               core, list, viz (3D), chat, pages, landing, main (loaded in that order)
  3d/               3D clinic planner
tests/              Python checks (no real AI or email calls)
requirements.txt    Python dependencies
vercel.json         Vercel settings (Flask)
```

## Run it locally

Requires Python 3.10 or newer.

```
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
.venv/bin/python app.py              # then open http://localhost:5001
```

Create a `.env` file next to `app.py`. It is never committed.

| Variable | Purpose |
|---|---|
| `GROQ_API_KEY` | Groq API key for the assistant (free at console.groq.com) |
| `MODEL` | Groq model, e.g. `openai/gpt-oss-20b` |
| `SMTP_HOST`, `SMTP_PORT` | Mail server, e.g. `smtp.gmail.com` and `465` |
| `SMTP_USER`, `SMTP_PASSWORD` | The account the emails are sent from (for Gmail, use an App Password) |
| `MAIL_TO` | Where requests are delivered. If empty, they go to `SMTP_USER` |

Without the email settings, the app still works and saves requests to `quotes/` instead of emailing them.

Tests, run from the project root:

```
.venv/bin/python -m tests.test_build_plan
.venv/bin/python -m tests.test_quote
.venv/bin/python -m tests.test_chat_retry
```

## Limitations and next steps

- The catalogue is a 66-product sample. The IT & Administrative category has no products yet.
- Prices are illustrative. A real deployment would pull live prices and stock from the supplier.
- On Vercel, saved copies of requests are temporary, so the email is the record.

## Team

Anna Chubakha
Qin Wang
Samuel Olabode
Tristan Ta
