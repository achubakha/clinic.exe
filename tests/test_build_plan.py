"""Checks the budget logic in build_plan against the real catalogue (no AI calls).
Run from the project root: .venv/bin/python -m tests.test_build_plan"""
from ai import build_plan, load_catalog

cat = load_catalog()
cost = lambda lst: sum(cat[i]["price"] * q for i, q in lst.items())
base = {"clinic_type": "optometry", "rooms": 3, "services": []}

# No budget: every essential + recommended optometry item, per-room items x3.
full, reply, _ = build_plan(cat, {**base, "budget": 0})
assert full["5"] == 3 and full["14"] == 1, full          # diagnostic set per room, eye magnet shared
assert all(cat[i]["priority"] <= 2 for i in full)
recommended = cost(full)

# Budget below essentials: says so, never overspends, offers to raise it.
small, reply, sugg = build_plan(cat, {**base, "budget": 1000})
assert cost(small) <= 1000 and "below" in reply and sugg[0].startswith("Set budget to"), (reply, sugg)

# Budget between essentials and recommended: essentials all in, tells them the recommended cost.
essential = sum(cat[i]["price"] * q for i, q in full.items() if cat[i]["priority"] == 1)
mid, reply, _ = build_plan(cat, {**base, "budget": essential + 50})
assert all(mid.get(i) == q for i, q in full.items() if cat[i]["priority"] == 1)
assert cost(mid) <= essential + 50 and "recommended setup costs" in reply, reply

# Enough budget: full recommended list (plus optional extras that fit), says how much is left.
big, reply, _ = build_plan(cat, {**base, "budget": recommended + 1000})
assert all(big.get(i) == q for i, q in full.items()) and cost(big) <= recommended + 1000 and "left" in reply, reply

# Extra service pulls in its items; unknown service is reported.
wc, reply, _ = build_plan(cat, {**base, "budget": 0, "services": ["wound-care", "x-ray"]})
assert "7" in wc and "x-ray" in reply, reply
print("build_plan OK")
