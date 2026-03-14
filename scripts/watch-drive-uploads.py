#!/usr/bin/env python3
"""
Watch a Google Drive folder for new screenshot uploads.
Downloads new files to groups/contacts/uploads/ and notifies via Discord.
Runs on a timer (systemd) — polls for new files each run.

State file tracks processed file IDs so we never re-download.
When a batch of 10+ new files arrives, sends a Discord notification
to the contacts channel so Mithrandir knows to process them.
"""

import json
import os
import sys
import time
from pathlib import Path
from urllib.request import Request, urlopen
from urllib.parse import urlencode

# --- Config ---
DRIVE_FOLDER_ID = "1XcJCvcNDKP1ZlhOXOMiwMrVbDtpWy4u7"
UPLOADS_DIR = Path("/root/nanoclaw/nanoclaw/groups/contacts/uploads")
STATE_FILE = Path("/root/nanoclaw/nanoclaw/data/drive-upload-state.json")
BATCH_NOTIFY_THRESHOLD = 10  # notify when this many new files arrive at once
ENV_FILE = Path("/root/nanoclaw/nanoclaw/.env")

# --- Load env ---
env = {}
if ENV_FILE.exists():
    for line in ENV_FILE.read_text().splitlines():
        line = line.strip()
        if "=" in line and not line.startswith("#"):
            k, v = line.split("=", 1)
            env[k.strip()] = v.strip().strip('"').strip("'")


def get_token():
    data = urlencode({
        "client_id": env["GOOGLE_CLIENT_ID"],
        "client_secret": env["GOOGLE_CLIENT_SECRET"],
        "refresh_token": env["GOOGLE_REFRESH_TOKEN"],
        "grant_type": "refresh_token",
    }).encode()
    req = Request("https://oauth2.googleapis.com/token", data=data, method="POST")
    return json.loads(urlopen(req).read())["access_token"]


def drive_list(token):
    """List all image files in the watched folder."""
    url = (
        "https://www.googleapis.com/drive/v3/files"
        f"?q='{DRIVE_FOLDER_ID}'+in+parents+and+trashed=false"
        "&fields=files(id,name,mimeType,createdTime,size)"
        "&orderBy=createdTime"
        "&pageSize=1000"
    )
    req = Request(url, headers={"Authorization": f"Bearer {token}"})
    result = json.loads(urlopen(req).read())
    return [f for f in result.get("files", []) if f["mimeType"].startswith("image/")]


def drive_download(token, file_id, dest_path):
    """Download a file from Drive."""
    url = f"https://www.googleapis.com/drive/v3/files/{file_id}?alt=media"
    req = Request(url, headers={"Authorization": f"Bearer {token}"})
    resp = urlopen(req)
    dest_path.write_bytes(resp.read())


def load_state():
    if STATE_FILE.exists():
        return json.loads(STATE_FILE.read_text())
    return {"processed_ids": [], "last_check": None}


def save_state(state):
    STATE_FILE.parent.mkdir(parents=True, exist_ok=True)
    STATE_FILE.write_text(json.dumps(state, indent=2))


def log_ready_notification(message):
    """Log that new files are ready for processing (by Claude Code, not the agent)."""
    print(f"  READY: {message}")
    # Write a marker file so Claude Code can check for pending uploads
    marker = Path("/root/nanoclaw/nanoclaw/data/drive-uploads-pending.txt")
    marker.parent.mkdir(parents=True, exist_ok=True)
    marker.write_text(f"{time.strftime('%Y-%m-%dT%H:%M:%S')}\n{message}\n")


def main():
    print(f"[drive-watcher] Checking folder {DRIVE_FOLDER_ID}...")

    token = get_token()
    files = drive_list(token)
    state = load_state()
    processed = set(state["processed_ids"])

    UPLOADS_DIR.mkdir(parents=True, exist_ok=True)

    # Find new files
    new_files = [f for f in files if f["id"] not in processed]

    if not new_files:
        print(f"  No new files. {len(files)} total, {len(processed)} processed.")
        state["last_check"] = time.strftime("%Y-%m-%dT%H:%M:%S")
        save_state(state)
        return

    print(f"  Found {len(new_files)} new files to download.")

    # Download new files
    downloaded = []
    for f in new_files:
        dest = UPLOADS_DIR / f["name"]
        if dest.exists():
            # File already exists locally (maybe from Discord), just mark processed
            print(f"  SKIP (exists): {f['name']}")
            processed.add(f["id"])
            continue

        print(f"  Downloading: {f['name']} ({f.get('size', '?')} bytes)")
        try:
            drive_download(token, f["id"], dest)
            processed.add(f["id"])
            downloaded.append(f["name"])
        except Exception as e:
            print(f"  ERROR downloading {f['name']}: {e}")

    # Save state
    state["processed_ids"] = list(processed)
    state["last_check"] = time.strftime("%Y-%m-%dT%H:%M:%S")
    save_state(state)

    print(f"  Downloaded {len(downloaded)} files, {len(new_files) - len(downloaded)} skipped.")

    # Notify if batch threshold reached
    if len(downloaded) >= BATCH_NOTIFY_THRESHOLD:
        names_sorted = sorted(downloaded)
        msg = (
            f"📸 **{len(downloaded)} new screenshots** downloaded from Google Drive.\n"
            f"Files: {names_sorted[0]} — {names_sorted[-1]}\n"
            f"Ready for processing in contacts uploads folder."
        )
        log_ready_notification(msg)
    elif downloaded:
        print(f"  {len(downloaded)} files downloaded (below batch threshold of {BATCH_NOTIFY_THRESHOLD}, no notification)")


if __name__ == "__main__":
    main()
