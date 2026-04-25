#!/usr/bin/env python3
# PreToolUse hook: block chorus_claim_task / chorus_submit_for_verify
# when there are unread human notifications.

import json
import os
import sys
import urllib.request
import urllib.error

chorus_url = os.environ.get("CHORUS_URL", "http://localhost:8637")
api_key = os.environ.get("CHORUS_API_KEY", "")

if not api_key:
    sys.exit(0)

try:
    req = urllib.request.Request(
        f"{chorus_url}/api/notifications?unreadOnly=true&limit=20",
        headers={"Authorization": f"Bearer {api_key}"},
    )
    with urllib.request.urlopen(req, timeout=3) as resp:
        data = json.loads(resp.read())
except Exception:
    sys.exit(0)

notifs = data.get("data", {}).get("notifications", [])
human = [n for n in notifs if n.get("actorType") == "user"]

if not human:
    sys.exit(0)

print(f"⚠️  Chorus 미읽은 사람 알림 {len(human)}개 — 먼저 확인하세요.\n")
for n in human:
    print(f"  [{n['entityTitle']}] {n['actorName']}: {n['message']}")
print("\nchorus_get_notifications() 로 읽은 후 재시도하세요.")
sys.exit(2)
