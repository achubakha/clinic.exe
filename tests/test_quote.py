"""Checks the "Submission" email flow with a fake mail server. Run from the project root: .venv/bin/python -m tests.test_quote"""
import os
import smtplib
from unittest import mock

from app import app
from ai import load_catalog

item_id, item = next(iter(load_catalog().items()))
client = app.test_client()
good = {"name": "Sam Lee", "email": "sam@example.com", "clinic": "Example Dental",
        "list": {item_id: 50}, "profile": {"Practice": "Dental", "Rooms": "3"}, "notes": "Line one\nLine two"}
smtp_env = {"SMTP_USER": "owner@gmail.com", "SMTP_PASSWORD": "abcd efgh ijkl mnop", "MAIL_TO": "", "SMTP_PORT": "465"}


def post(body):
    res = client.post("/api/quote", json=body)
    data = res.get_json()
    if data.get("ref"):
        os.remove(f"quotes/{data['ref']}.json")  # proves it was saved, and cleans up
    return res.status_code, data


# 1. Configured: one email to the owner, priced from the catalogue, reply goes to the customer.
with mock.patch.dict(os.environ, smtp_env), mock.patch("smtplib.SMTP_SSL") as smtp:
    status, data = post({**good, "list": {item_id: 50, "not-a-real-id": 3}})
    server = smtp.return_value.__enter__.return_value
    msg = server.send_message.call_args.args[0]
assert status == 200 and data["emailed"] is True, data
server.login.assert_called_once_with("owner@gmail.com", "abcdefghijklmnop")  # spaces from Google's display removed
assert msg["To"] == "owner@gmail.com" and msg["Reply-To"] == "sam@example.com"
assert msg["Subject"].startswith("New quote request: Example Dental (CF-")
body = msg.get_content()
assert item["name"] in body and "Quantity: 50" in body and "not-a-real-id" not in body
assert item["category"].upper() in body and f"${item['price'] * 50:,.2f}" in body and "Line one\nLine two" in body and "Practice: Dental" in body

# 2. Not configured yet: still saved, page told email isn't set up.
with mock.patch.dict(os.environ, {"SMTP_USER": "", "SMTP_PASSWORD": ""}):
    status, data = post(good)
assert status == 200 and data["emailed"] is False, data

# 3. Mail server down: error with the reference (request is still saved).
with mock.patch.dict(os.environ, smtp_env), mock.patch("smtplib.SMTP_SSL", side_effect=smtplib.SMTPAuthenticationError(535, b"bad")):
    status, data = post(good)
assert status == 502 and data["ref"] in data["error"], data

# 3b. Port 465 blocked (the "Connection refused" case): falls back to 587 with STARTTLS.
with mock.patch.dict(os.environ, smtp_env), mock.patch("smtplib.SMTP_SSL", side_effect=ConnectionRefusedError(61, "refused")), \
        mock.patch("smtplib.SMTP") as plain:
    status, data = post(good)
    fallback = plain.return_value
assert status == 200 and data["emailed"] is True, data
assert plain.call_args.args[:2] == ("smtp.gmail.com", 587)
fallback.starttls.assert_called_once()
fallback.__enter__.return_value.send_message.assert_called_once()

# 3c. Both ports blocked: clear error, request still saved. A wrong password never tries the other port.
with mock.patch.dict(os.environ, smtp_env), mock.patch("smtplib.SMTP_SSL", side_effect=ConnectionRefusedError(61, "refused")), \
        mock.patch("smtplib.SMTP", side_effect=TimeoutError("timed out")):
    status, data = post(good)
assert status == 502 and data["ref"] in data["error"], data
with mock.patch.dict(os.environ, smtp_env), mock.patch("smtplib.SMTP_SSL", side_effect=smtplib.SMTPAuthenticationError(535, b"bad")), \
        mock.patch("smtplib.SMTP") as plain:
    post(good)
assert not plain.called

# 4. Bad input is refused; newlines can't sneak extra email headers in.
assert post({**good, "email": "not-an-email"})[0] == 400
assert post({**good, "list": {}})[0] == 400
assert post({**good, "list": "junk"})[0] == 400
with mock.patch.dict(os.environ, smtp_env), mock.patch("smtplib.SMTP_SSL") as smtp:
    status, _ = post({**good, "clinic": "Evil\r\nBcc: victim@example.com"})
    msg = smtp.return_value.__enter__.return_value.send_message.call_args.args[0]
assert status == 200 and "Bcc" not in msg and "\n" not in msg["Subject"]

print("All quote email checks passed")
