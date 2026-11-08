import os
import json
import math
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
    with open(CATALOG_FILE, encoding="utf-8") as f:
        text = f.read()
    items = json.loads(text[text.index("["):text.rindex("]") + 1])
    return {str(item["id"]): item for item in items}


def clean_profile(raw, clinic_types):
    """The AI proposes the profile; only keep values of the right type and range."""
    raw = raw if isinstance(raw, dict) else {}
    def num(v, lo, hi):
        try:
            v = float(v)
        except (TypeError, ValueError):
            return None
        return v if lo <= v <= hi else None
    rooms = num(raw.get("rooms"), 1, 50)
    # "Optometry Clinic" / "family practice" -> "optometry" / "family-practice"
    ctype = str(raw.get("clinic_type") or "").strip().lower().replace(" ", "-").removesuffix("-clinic")
    services = raw.get("services")
    return {
        "clinic_type": ctype if ctype in clinic_types else None,
        "rooms": int(rooms) if rooms else None,
        "budget": num(raw.get("budget"), 0, 10_000_000),  # 0 = no budget limit
        "services": [str(x).strip().lower().replace(" ", "-")[:40] for x in services][:5] if isinstance(services, list) else None,
    }


def build_plan(catalog, profile):
    """Build the equipment list from the clinic profile, most important items first.

    Recommended setup = every essential (priority 1) and recommended (priority 2) item for the
    clinic type and extra services; per-room items get one per room. With a budget, the list is
    filled in priority order (cheapest first within a priority) and the reply says what is missing.
    Returns (list, reply, suggestions)."""
    tag = lambda t: str(t).strip().lower().replace(" ", "-")
    clinic_types = {t for i in catalog.values() for t in i.get("tags", [])}
    services = [tag(x) for x in profile["services"]]
    wanted = {profile["clinic_type"]} | {s for s in services if s in clinic_types}
    unknown = [x for x, s in zip(profile["services"], services) if s not in clinic_types]
    rooms, budget = profile["rooms"], profile["budget"]

    cands = []
    for item_id, i in catalog.items():
        if wanted & set(i.get("tags", [])):
            qty = rooms if i.get("per_room") else 1
            cands.append((i.get("priority", 2), i["price"] * qty, item_id, qty))
    cands.sort()
    essential = sum(c for p, c, _, _ in cands if p == 1)
    recommended = sum(c for p, c, _, _ in cands if p <= 2)

    new_list, spent, left_out = {}, 0.0, []
    need = {item_id: qty for _, _, item_id, qty in cands}
    for prio, cost, item_id, qty in cands:
        if not budget:  # no limit: take the recommended setup
            if prio <= 2:
                new_list[item_id] = qty
                spent += cost
            else:
                left_out.append(item_id)
            continue
        price = catalog[item_id]["price"]
        fit = min(qty, int((budget - spent) // price))  # per-room items may get fewer than one per room
        if fit >= 1:
            new_list[item_id] = fit
            spent += fit * price
        if fit < qty and prio <= 2:
            left_out.append(item_id)

    m = lambda x: f"${x:,.2f}"
    up = lambda x: f"${math.ceil(x):,}"
    extra = [s.replace("-", " ") for s in services if s in clinic_types and s != profile["clinic_type"]]
    who = f"a {rooms}-room {profile['clinic_type'].replace('-', ' ')} clinic" + (f" with {' and '.join(extra)}" if extra else "")
    label = lambda i: (catalog[i].get("short") or catalog[i]["name"]) + (f" ({new_list[i]} of {need[i]})" if i in new_list else "")
    names = lambda ids: ", ".join(label(i) for i in ids[:4]) + (f" (+{len(ids) - 4} more)" if len(ids) > 4 else "")
    top_missing = [f"Add {catalog[i].get('short') or catalog[i]['name']}" for i in left_out[:1]]

    if not budget:
        reply = f"Your recommended list for {who} is ready: {len(new_list)} items, {m(spent)}."
        if left_out:
            reply += f" Optional extras not added: {names(left_out)}."
        suggestions = top_missing + ["Show my list", "I'm done"]
    elif budget < essential:
        missing = [i for i in left_out if catalog[i].get("priority") == 1]
        reply = (f"Your budget of {m(budget)} is below the {m(essential)} needed for the essential equipment for {who} "
                 f"(the full recommended setup is {m(recommended)}). I added the most important items that fit, {m(spent)} in total. "
                 f"Still missing essentials: {names(missing)}.")
        suggestions = [f"Set budget to {up(essential)}", f"Set budget to {up(recommended)}", "Show my list"]
    elif budget < recommended:
        reply = (f"Your budget of {m(budget)} covers all the essential equipment for {who}, but the full recommended setup costs "
                 f"{m(recommended)}. I added the essentials and the most important extras that fit, {m(spent)} in total. "
                 f"Left out: {names(left_out)}.")
        suggestions = [f"Set budget to {up(recommended)}"] + top_missing + ["Show my list"]
    else:
        reply = (f"Your recommended list for {who} is ready: {len(new_list)} items, {m(spent)}, "
                 f"within your {m(budget)} budget ({m(budget - spent)} left).")
        suggestions = ["Show my list", "I'm done"]
    if unknown:
        reply += f" We don't have catalogue equipment for {', '.join(unknown)} yet."
    return new_list, reply + " You can change anything on the list.", suggestions[:3]


def chat_turn(message, current_list, profile=None, last_reply=""):
    """current_list: item id -> quantity, e.g. {"14": 1}.
    profile: what we know about the clinic so far (clinic_type, rooms, budget, services).
    Returns a dict for the API response."""
    catalog = load_catalog()
    menu = [
        {"id": i["id"], "name": i.get("short") or i["name"], "price": i["price"], "tags": i.get("tags", [])}
        for i in catalog.values()
    ]
    clinic_types = sorted({t for i in catalog.values() for t in i.get("tags", [])})
    profile = clean_profile(profile, clinic_types)
    prompt = f"""You are the ClinicFlow planning assistant. You help doctors build an equipment list for a new clinic.

Interview first. Before building the list, learn these four things, ONE question per reply, in this order, skipping any already known in the profile:
1. clinic_type: what the practice does. Must be one of: {json.dumps(clinic_types)}
2. rooms: how many exam/treatment rooms (a number).
3. budget: the equipment budget in CAD (a number). If they have no budget or skip, use 0.
4. services: extra services they offer beyond the main practice (e.g. wound care, ECG, minor surgery, physiotherapy). A list of short names. If none or they skip, use [].
A value of null in the profile means not asked yet. If the user gives several answers at once, take them all. If the user says to skip or "just build it", use rooms 1, budget 0, services [].

When all four are known, the system builds the equipment list automatically from the profile. Do NOT add items yourself for that; just return the profile.

Other rules:
- Use ONLY items from the catalogue, with their exact id.
- If the user names a clinic type that is NOT supported, add nothing. Reply: "We don't have the equipment for this clinic yet." Then mention the supported types.
- When the user asks to add, remove, or change the quantity of an item, do it. If they change the clinic type, rooms, budget or services later, update the profile; the list is rebuilt automatically.
- You ONLY talk about clinic equipment, this clinic plan and this equipment list. For anything else (weather, jokes, homework, news), do not answer; say you can only help plan clinic equipment, then repeat the question from your previous message if it asked one, otherwise offer to adjust the list. Use no actions.
- Keep your reply short and in plain, simple language.
- Always give 2 to 3 suggestions: short tappable answers to your question (under 6 words each), e.g. "2 rooms", "No budget limit", "No extra services", "Show my list", "I'm done".

Reply with JSON only, in this shape:
{{"reply": "your short message", "profile": {{"clinic_type": "...", "rooms": 2, "budget": 5000, "services": ["..."]}}, "actions": [{{"op": "add", "id": 14, "qty": 1}}], "suggestions": ["short option", "short option"]}}
In "profile", return all four fields, keeping known values and using null for unknown ones. op can be "add", "remove", or "set_qty".

Catalogue: {json.dumps(menu, separators=(",", ":"))}
Profile so far: {json.dumps(profile)}
Current list (item id: quantity): {json.dumps(current_list)}
Your previous message: {json.dumps(last_reply[:500])}
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
        return {"reply": "Sorry, I couldn't process that right now. Please try again.",
                "list": current_list, "suggestions": [], "profile": profile}

    new_list = dict(current_list)
    for action in data.get("actions", []):
        item_id = str(action.get("id"))
        if item_id not in catalog:  # ignore anything not in the catalogue
            continue
        try:
            qty = max(1, min(50, int(action.get("qty", 1))))
        except (TypeError, ValueError):
            qty = 1
        op = action.get("op")
        if op == "add":
            new_list[item_id] = new_list.get(item_id, 0) + qty
        elif op == "set_qty":
            new_list[item_id] = qty
        elif op == "remove":
            new_list.pop(item_id, None)

    # Keep known answers if the AI forgot to repeat them.
    new_profile = {k: v if v is not None else profile[k]
                   for k, v in clean_profile(data.get("profile"), clinic_types).items()}
    reply = data.get("reply", "")
    suggestions = data.get("suggestions", [])[:3]
    # Profile complete and new (or changed): build the list from it instead of trusting the AI's picks.
    if None not in new_profile.values() and (not current_list or new_profile != profile):
        new_list, reply, suggestions = build_plan(catalog, new_profile)
    # The model's arithmetic isn't trusted: check the budget here.
    total = round(sum(catalog[i]["price"] * q for i, q in new_list.items() if i in catalog), 2)
    if new_profile["budget"] and total > new_profile["budget"]:
        reply += f"\n\nNote: this list totals ${total:,.2f}, which is over your ${new_profile['budget']:,.0f} budget. Ask me to trim it if you like."
    return {"reply": reply, "list": new_list, "suggestions": suggestions,
            "profile": new_profile, "total": total}
