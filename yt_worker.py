import yt_dlp
import os
import sys
import json

def download_youtube_mp3(url, title=None):
    output_path = "/home/steve/Desktop/bocchi/songs"
    if not os.path.exists(output_path):
        os.makedirs(output_path)
    filename = title if title else '%(title)s'
    ydl_opts = {
        'format': 'bestaudio/best',
        'outtmpl': os.path.join(output_path, f"{filename}.%(ext)s"),
        'postprocessors': [{
            'key': 'FFmpegExtractAudio',
            'preferredcodec': 'mp3',
            'preferredquality': '192',
        }],
        'quiet': True,
        'no_warnings': True,
        'logtostderr': True,
        'print': {
            'default': lambda msg: print(msg, file=sys.stderr)
        }
    }
    try:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(url, download=True)
            mp3_file = os.path.join(output_path, f"{title if title else info['title']}.mp3")
            if os.path.isfile(mp3_file):
                return mp3_file
            else:
                print("MP3 file was not created.", file=sys.stderr)
                return None
    except Exception as e:
        print(f"Error: {e}", file=sys.stderr)
        return None

if __name__ == "__main__":
    try:
        job = json.loads(sys.stdin.read())
        url = job["url"]
        title = job.get("title")
        result = download_youtube_mp3(url, title)
        print(json.dumps({"result": result}))
    except Exception as e:
        print(f"Fatal error: {e}", file=sys.stderr)
        print(json.dumps({"result": None}))