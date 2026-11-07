import os
import json
from dotenv import load_dotenv
from google import genai
from google.genai import types

load_dotenv()
client = genai.Client(api_key=os.getenv("GEMINI_API_KEY"))

with open("catalog_test.json") as f:
    catalog = json.load(f)

# The AI only sees id, name and tags. It never sees prices.
menu = [
    {"id": i["id"], "name": i["name"], "tags": i.get("tags", [])}
    for i in catalog
]

prompt = f"""You help doctors build an equipment list for a new clinic.
Pick ONLY items from the catalogue below, using their exact id.
Match the clinic type to the item tags.
Reply with JSON only, in this shape:
{{"items": [{{"id": "item id", "qty": 1}}]}}

Catalogue:
{json.dumps(menu)}

Clinic type: optometry clinic"""

response = client.models.generate_content(
    model=os.getenv("MODEL"),
    contents=prompt,
    config=types.GenerateContentConfig(response_mime_type="application/json"),
)
print(response.text)