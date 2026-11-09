import os
import re
import ssl
import json
import time
import secrets
import smtplib
from email.message import EmailMessage

import certifi
from flask import Flask, jsonify, request, send_from_directory
from ai import chat_turn, load_catalog

app = Flask(__name__)


@app.route("/")
def home():
    return send_from_directory(".", "clinic.html")


# Only these files are public -- never serve the whole folder (.env holds the API key).
@app.route("/<any('catalogue.js','index.js','styles.css','3d.html','3d-engine.js','3d-app.js','hero.jpg'):name>")
def static_file(name):
    return send_from_directory(".", name)


@app.route("/api/catalog")
def catalog():
    return jsonify(list(load_catalog().values()))


@app.route("/api/chat", methods=["POST"])
def chat():
    data = request.get_json()
    return jsonify(chat_turn(data.get("message", ""), data.get("list", {}),
                             data.get("profile"), data.get("last_reply", ""), data.get("rooms")))

@app.route("/chat-test")
def chat_test():
    return send_from_directory(".", "chat_test.html")

@app.route("/api/quote", methods=["POST"])
def quote():
    data = request.get_json(silent=True) or {}
    contact = {k: one_line(data.get(k), 200) for k in ("name", "email", "clinic", "phone", "location")}
    notes = str(data.get("notes") or "").strip()[:2000]
    if not (contact["name"] and contact["clinic"] and EMAIL_RE.match(contact["email"])):
        return jsonify({"error": "Please enter your name, clinic name and a valid email."}), 400

    # Names and prices come from the catalogue, never from the browser
    catalog = load_catalog()
    items = data.get("list") if isinstance(data.get("list"), dict) else {}
    lines = []
    total = 0
    for item_id, qty in items.items():
        item = catalog.get(str(item_id))
        if not item:
            continue
        try:
            qty = max(1, min(999, int(qty)))  # same cap as the page (MAX_QTY)
        except (TypeError, ValueError):
            qty = 1
        cost = round(item["price"] * qty, 2)
        total += cost
        lines.append({"id": item_id, "name": item["name"], "qty": qty, "category": item.get("category") or "Other",
                      "unit_price": item["price"], "line_total": cost})
    if not lines:
        return jsonify({"error": "Your equipment list is empty."}), 400
    total = round(total, 2)
    lines.sort(key=lambda l: CATEGORIES.index(l["category"]) if l["category"] in CATEGORIES else len(CATEGORIES))
    groups = {}  # category -> its lines, in checklist order
    for l in lines:
        groups.setdefault(l["category"], []).append(l)
    profile = data.get("profile") if isinstance(data.get("profile"), dict) else {}
    profile = {one_line(k, 40): one_line(v, 200) for k, v in list(profile.items())[:10]}

    ref = "CF-" + time.strftime("%Y%m%d-%H%M%S") + "-" + secrets.token_hex(2)
    os.makedirs(QUOTES_DIR, exist_ok=True)
    with open(os.path.join(QUOTES_DIR, f"{ref}.json"), "w") as f:  # saved first, so nothing is lost if email fails
        json.dump({"ref": ref, **contact, "notes": notes, "profile": profile,
                   "items": lines, "estimated_total": total}, f, indent=2)

    money = lambda x: f"${x:,.2f}"
    email_text = (
        f"NEW CLINIC EQUIPMENT QUOTE REQUEST ({ref})\n\n"
        f"Clinic name: {contact['clinic']}\n"
        f"Contact: {contact['name']}\n"
        f"Email: {contact['email']}\n"
        f"Phone: {contact['phone'] or 'Not provided'}\n"
        f"Location: {contact['location'] or 'Not provided'}\n"
        + "".join(f"{k}: {v}\n" for k, v in profile.items())
        + "\nEQUIPMENT REQUEST\n"
        + "\n\n".join(
            f"{cat.upper()} ({money(sum(l['line_total'] for l in group))})\n"
            + "\n".join(f"- {l['name']} | Quantity: {l['qty']} | Unit price: {money(l['unit_price'])}"
                        f" | Line total: {money(l['line_total'])}" for l in group)
            for cat, group in groups.items())
        + f"\n\nIndicative subtotal: {money(total)} CAD (before tax, shipping and installation)\n"
        f"Additional notes: {notes or 'None'}\n\n"
        "Sample prices only. Final pricing must be confirmed by a sales representative.\n"
        f"Reply to this email to reach {contact['name']} directly."
    )
    try:
        emailed = send_email(f"New quote request: {contact['clinic']} ({ref})", email_text, contact["email"])
    except (smtplib.SMTPException, OSError) as e:
        print("Email error:", e, flush=True)
        return jsonify({"ref": ref, "error": f"Your request was saved ({ref}) but the email couldn't be sent. Please try again."}), 502
    return jsonify({"ref": ref, "emailed": emailed, "total": total})


# Saved copies of requests. On Vercel only /tmp is writable (and it is wiped between runs, so the email is the record).
QUOTES_DIR = os.getenv("QUOTES_DIR") or ("/tmp/quotes" if os.getenv("VERCEL") else "quotes")
# Same order as the page groups the list in (CATEGORIES in index.js).
CATEGORIES = ["Clinical Examination", "Medical Devices & Utilities", "Consumables & PPE", "IT & Administrative"]
EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


def one_line(value, limit):
    """Text from the browser: single line, trimmed, length-capped (keeps email headers safe)."""
    return " ".join(str(value or "").split())[:limit]


def send_email(subject, body, reply_to):
    """Email a request to MAIL_TO using the SMTP settings in .env. Returns False if they aren't set."""
    user, password = os.getenv("SMTP_USER"), (os.getenv("SMTP_PASSWORD") or "").replace(" ", "")
    if not (user and password):
        return False
    host, port = os.getenv("SMTP_HOST") or "smtp.gmail.com", int(os.getenv("SMTP_PORT") or 465)
    msg = EmailMessage()
    msg["Subject"], msg["From"], msg["To"], msg["Reply-To"] = subject, user, os.getenv("MAIL_TO") or user, reply_to
    msg.set_content(body)
    tls = ssl.create_default_context(cafile=certifi.where())  # python.org Python on macOS has no CA certs of its own
    ports = [port] + [p for p in (465, 587) if p != port]  # networks often block one mail port but not the other
    for p in ports:
        try:
            if p == 465:
                server = smtplib.SMTP_SSL(host, p, context=tls, timeout=10)
            else:
                server = smtplib.SMTP(host, p, timeout=10)
                server.starttls(context=tls)
            break
        except (ConnectionError, TimeoutError) as e:  # can't reach the server; a wrong password is not retried
            print(f"Email: can't reach {host}:{p} ({e})", flush=True)
            if p == ports[-1]:
                raise ConnectionError(f"{host} blocked on ports {ports}: a VPN, firewall or the network is stopping email") from e
    with server as s:
        s.login(user, password)
        s.send_message(msg)
    return True

if __name__ == "__main__":
    app.run(debug=True, port=5001)