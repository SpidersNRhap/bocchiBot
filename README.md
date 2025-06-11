# Bocchi Bot

A Discord bot with music playback, playlist management, and MyAnimeList tracking, plus a secure web-based MP3 uploader.

---

## Features

### Discord Bot
- **Music Playback:** Play, queue, shuffle, and skip songs from your `songs/` folder (supports subfolders).
- **Playlist Management:** Create, add, remove, and list playlists. Playlists are stored in `playlists.json`.
- **YouTube Download:** Download audio from YouTube or upload MP3s via Discord.
- **Random GIFs & Emotes:** Fun Bocchi the Rock GIFs and emotes.
- **MyAnimeList Tracking:** Notifies a channel when tracked users update their anime/manga lists.
- **Custom Help:** Rich help command with usage info.

### MP3 Uploader Web Interface
- **Secure Upload:** Generates temporary access tokens for uploading MP3s via a web UI.
- **Folder Support:** Upload to specific folders, including ZIP extraction.
- **Playlist Editor:** Add/remove songs to playlists from the web interface.

---

## Setup

### 1. Requirements

- Python 3.8+
- Node.js (for the uploader)
- Discord bot token
- `.env` file with required variables (see below)
- `ffmpeg` installed and in PATH

### 2. Install Python Dependencies

```bash
pip install -r requirements.txt
```

### 3. Install Node.js Dependencies

```bash
cd mp3-uploader
npm install
```

### 4. Environment Variables

Create a .env file in the project root with:
```
DISCORD_TOKEN=your_discord_token
PUBLIC_IP=your.public.ip.or.domain
PORT=3000
CHANNEL_ID=your_discord_channel_id
SMIRK=your_smirking_emote_id
MAL_CLIENT_ID=your_mal_client_id
TRACKED_USERS={"discord_id":"mal_username", ...}
UPLOADER_SECRET=your_random_secret
```

### 5. SSL Certificates

Place `server.key` and `server.cert` in the project root for HTTPS.

---

## Usage

All bot code is contained in a single file: `bocchi.py`.  
Run the bot with:

```bash
python3 bocchi.py
```

Make sure your `.env` file is in the same directory as `bocchi.py`.

---

## Folder Structure

```
bocchi/
├── bocchi.py
├── playlists.json
├── requirements.txt
├── .env
├── songs/
│   └── ...your mp3 files...
├── mp3-uploader/
│   ├── src/
│   │   ├── server.js
│   │   └── token.js
│   └── ...other uploader files...
├── server.key
├── server.cert
└── README.md
```

- **bocchi.py**: Main bot code (all logic in one file).
- **songs/**: Place your mp3 files here (supports subfolders).
- **playlists.json**: Playlists are stored here.
- **mp3-uploader/**: Node.js web uploader (run via bot automatically).
- **server.key/server.cert**: SSL certificates for HTTPS.
- **.env**: Environment variables.

---

## Notes

- The bot will automatically start the MP3 uploader web server on launch.
- Use `!token` in Discord to generate a temporary upload link.
- Playlists and queue management are handled via Discord commands.
- MyAnimeList notifications require specifying a `CHANNEL_ID`. a valid `MAL_CLIENT_ID`, and `TRACKED_USERS={"discord_id":"mal_username", ...}` in `.env`.

---

## Example Commands

- `!play <song name>` — Play or queue a song by name.
- `!plCreate <playlist>` — Create a new playlist.
- `!plAdd <playlist> <song>` — Add a song to a playlist.
- `!plPlay <playlist> [-s]` — Play all songs in a playlist (add `-s` to shuffle).
- `!skip` — Skip the current song.
- `!queue` — Show the current queue.
- `!download <YouTube link> <song name>` — Download audio from YouTube.
- `!download` (with mp3 attached) — Save an uploaded mp3.
- `!token` — Get a temporary web upload link.
- `!gif` — Send a random Bocchi gif.
- `!smirk` — Send the smirk emote.