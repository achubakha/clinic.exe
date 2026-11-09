"""Broken JSON from the model is retried once; other errors are not. Run from the project root: .venv/bin/python -m tests.test_chat_retry"""
import json
from types import SimpleNamespace as NS
from unittest import mock

import ai

bad = Exception("Error code: 400 - {'error': {'code': 'json_validate_failed'}}")
reply = {"reply": "How many rooms?", "profile": {"clinic_type": "optometry", "rooms": None, "budget": None, "services": None},
         "actions": [], "suggestions": ["1 room", "2 rooms"]}
ok = NS(choices=[NS(message=NS(content=json.dumps(reply)))])
broken_text = NS(choices=[NS(message=NS(content='{"reply":"x"},{"actions":[]}'))])


def chat(*results):
    with mock.patch.object(ai.client.chat.completions, "create", side_effect=list(results)) as create:
        out = ai.chat_turn("optometry", {})
    return out, create.call_count


out, calls = chat(bad, ok)  # Groq rejects the JSON, second try works
assert calls == 2 and out["reply"] == "How many rooms?", out
out, calls = chat(broken_text, ok)  # JSON that Groq let through but doesn't parse
assert calls == 2 and out["reply"] == "How many rooms?", out
out, calls = chat(bad, bad)  # still broken: gives up after one retry
assert calls == 2 and out["reply"].startswith("Sorry"), out
out, calls = chat(Exception("Error code: 429 - rate_limit_exceeded"))  # other errors: no retry
assert calls == 1 and out["reply"].startswith("Sorry"), out
print("Chat retry checks passed")
