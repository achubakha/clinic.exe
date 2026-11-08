import os
import json
from dotenv import load_dotenv
from groq import Groq

load_dotenv()
# ponytail: free tier is 8k tokens/min; retries absorb short bursts, paid tier if many users chat at once
client = Groq(api_key=os.getenv("GROQ_API_KEY"), max_retries=4)
MODEL = os.getenv("MODEL", "openai/gpt-oss-120b")

CATALOG_FILE = "catalogue.js"  # same file the browser loads, so there is one catalogue


def load_catalog():
    """catalogue.js is `const catalogue = [...JSON...];` -- read the JSON array out of it.
    Keys are string ids, because JSON object keys from the browser are strings."""
    with open(CATALOG_FILE) as f:
        text = f.read()
    items = json.loads(text[text.index("["):text.rindex("]") + 1])
    return {str(item["id"]): item for item in items}


def chat_turn(message, current_list):
    """current_list is a dict: item id -> quantity, e.g. {"slit": 1}"""
    catalog = load_catalog()
    menu = [
        {"id": i["id"], "name": i.get("short") or i["name"], "tags": i.get("tags", [])}
        for i in catalog.values()
    ]
    clinic_types = sorted({t for i in catalog.values() for t in i.get("tags", [])})
    prompt = f"""You are the ClinicFlow planning assistant. You help doctors build an equipment list for a new clinic.

Rules:
- Use ONLY items from the catalogue, with their exact id.
- Supported clinic types: {json.dumps(clinic_types)}
- When the user names a supported clinic type, add the items whose tags match it.
- If the user names a clinic type that is NOT supported, do not add anything. Reply: "We don't have the equipment for this clinic yet." Then mention the supported types.
- When the user asks to add, remove, or change the quantity of an item, do it.
- You ONLY talk about clinic equipment and this equipment list. If the user asks about anything else (weather, jokes, homework, news, and so on), do not answer it. Reply that you can only help with building a clinic equipment list, and ask what kind of clinic they are opening. Use no actions.
- Keep your reply short and in plain, simple language.
- Always give 2 to 3 suggestions: short things the user might tap next (under 6 words each), like "Show my list", "Add an item", or "I'm done".

Reply with JSON only, in this shape:
{{"reply": "your short message", "clinic_type": "matching supported clinic type or empty string", "actions": [{{"op": "add", "id": "item id", "qty": 1}}], "suggestions": ["short option", "short option"]}}
op can be "add", "remove", or "set_qty".

Catalogue: {json.dumps(menu, separators=(",", ":"))}
Current list (item id: quantity): {json.dumps(current_list)}
User message: {message}"""

    try:
        response = client.chat.completions.create(
            model=MODEL,
            messages=[{"role": "user", "content": prompt}],
            response_format={"type": "json_object"},
        )
        data = json.loads(response.choices[0].message.content)
    except Exception as e:
        print("AI error:", e, flush=True)
        return current_list, "Sorry, I couldn't process that right now. Please try again.", [], ""

    new_list = dict(current_list)
    for action in data.get("actions", []):
        item_id = str(action.get("id"))
        if item_id not in catalog:  # ignore anything not in the catalogue
            continue
        try:
            qty = max(1, min(20, int(action.get("qty", 1))))
        except (TypeError, ValueError):
            qty = 1
        op = action.get("op")
        if op == "add":
            new_list[item_id] = new_list.get(item_id, 0) + qty
        elif op == "set_qty":
            new_list[item_id] = qty
        elif op == "remove":
            new_list.pop(item_id, None)
    clinic_type = data.get("clinic_type") if data.get("clinic_type") in clinic_types else ""
    return new_list, data.get("reply", ""), data.get("suggestions", [])[:3], clinic_type