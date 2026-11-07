import os
import json
import time
from flask import Flask, jsonify, request, send_from_directory
from ai import chat_turn, load_catalog

app = Flask(__name__)


@app.route("/")
def home():
    return send_from_directory(".", "clinic.html")


@app.route("/api/catalog")
def catalog():
    return jsonify(list(load_catalog().values()))


@app.route("/api/chat", methods=["POST"])
def chat():
    data = request.get_json()
    new_list, reply, suggestions = chat_turn(data.get("message", ""), data.get("list", {}))
    return jsonify({"reply": reply, "list": new_list, "suggestions": suggestions})

@app.route("/chat-test")
def chat_test():
    return send_from_directory(".", "chat_test.html")

@app.route("/api/quote", methods=["POST"])
def quote():
    data = request.get_json()
    catalog = load_catalog()

    # Names and prices come from the catalogue, never from the browser
    lines = []
    total = 0
    for item_id, qty in data.get("list", {}).items():
        item = catalog.get(item_id)
        if not item:
            continue
        try:
            qty = max(1, min(20, int(qty)))
        except (TypeError, ValueError):
            qty = 1
        cost = item["price"] * qty
        total += cost
        lines.append({"id": item_id, "name": item["name"], "qty": qty,
                      "unit_price": item["price"], "line_total": cost})

    ref = "CF-" + time.strftime("%Y%m%d-%H%M%S")
    request_data = {
        "ref": ref,
        "name": data.get("name", ""),
        "email": data.get("email", ""),
        "clinic": data.get("clinic", ""),
        "notes": data.get("notes", ""),
        "items": lines,
        "estimated_total": total,
    }

    os.makedirs("quotes", exist_ok=True)
    with open(f"quotes/{ref}.json", "w") as f:
        json.dump(request_data, f, indent=2)

    email_text = (
        f"NEW CLINIC EQUIPMENT QUOTE REQUEST ({ref})\n\n"
        f"Clinic: {request_data['clinic']}\n"
        f"Contact: {request_data['name']} ({request_data['email']})\n\n"
        "EQUIPMENT\n"
        + "\n".join(f"- {l['name']} x{l['qty']} = ${l['line_total']}" for l in lines)
        + f"\n\nEstimated total: ${total}\n"
        f"Notes: {request_data['notes'] or 'None'}\n\n"
        "Sample prices only. Final pricing must be confirmed by a sales representative."
    )
    return jsonify({"ref": ref, "email_text": email_text, "total": total})

if __name__ == "__main__":
    app.run(debug=True, port=5001)