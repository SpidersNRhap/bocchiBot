import discord
# from asyncio import tasks
from doctest import master
from discord.ext import commands, tasks
from discord import FFmpegPCMAudio
import random
from collections import deque
import os
import requests
from thefuzz import fuzz
# import yt_dlp
import json
import aiohttp
import asyncio
import glob
import subprocess
import sys
from dotenv import load_dotenv
from discord.ext.commands import Context
from mutagen.id3 import ID3, APIC


load_dotenv()
TOKEN = os.getenv("DISCORD_TOKEN")
IP = os.getenv("PUBLIC_IP")
TRACKED_USERS = json.loads(os.getenv("TRACKED_USERS", "{}"))
MAL_CLIENT_ID = os.getenv("MAL_CLIENT_ID")
CHANNEL_ID = int(os.getenv("CHANNEL_ID"))  
SMIRK = os.getenv("SMIRK")
PORT = int(os.getenv("PORT", 3000))  # Default to 3000 if not set
intents = discord.Intents.all()
intents.members = True
intents.messages = True
# intents.message_content = True
bot = commands.Bot(command_prefix="!", intents=intents)
gifs = ['https://tenor.com/view/bocchi-bocchi-the-rock-non-linear-gif-27023528', 'https://tenor.com/view/bocchi-trash-bocchi-the-rock-gif-27231717',
        'https://tenor.com/view/bocchi-the-rock-anime-anime-girl-hitori-gotou-chopping-gif-27031916', 'https://tenor.com/view/bocchi-the-rock-bocchi-anime-anime-clap-clap-anime-gif-27407498',
        'https://tenor.com/view/bocchi-the-rock-bocchi-dance-dancing-anime-gif-27028171', 'https://tenor.com/view/bocchi-the-rock-bocchi-part-time-jobs-gif-27052191',
        'https://tenor.com/view/bocchi-the-rock-anime-anime-girl-hitori-gotou-avoiding-issue-gif-27031923', 'https://tenor.com/view/bocchi-bocchi-the-rock-explode-explosion-exploding-gif-27323776',
        'https://tenor.com/view/bocchi-the-rock-hitori-gotoh-super-saiyan-ssj-dragonball-gif-27329219', 'https://tenor.com/view/spin-bocchi-gif-27432708'] 

responses = ["As I see it, yes.", "Ask again later.", "Better not tell you now.", "Cannot predict now.", "Concentrate and ask again.",
             "Don\'t count on it.", "It is certain.", "It is decidedly so.", "Most likely.", "My reply is no.", "My sources say no.",
             "Outlook not so good.", "Outlook good.", "Reply hazy, try again.", "Signs point to yes.", "Very doubtful.", "Without a doubt.",
             "Yes.", "Yes - definitely.", "You may rely on it."]
emotes = ["<:BocchiAngry:1180048642116165682>", "<:BocchiCool:1099600391760511076>", "<:BocchiDead:1099600395128557629>", "<:BocchiHuh:1099600396298756127>",
          "<:BocchiPain:1099600393752825896>", "<:BocchiSmug:1180048644305596416>", "<:Bocchib:1180051687810015293>"]


@bot.event
async def on_ready():
    # Start the uploader server if not already running
    try:
        # Use Popen so the process stays alive
        subprocess.Popen(
            ["node", "server.js"],
            cwd=os.path.join(os.path.dirname(__file__), "mp3-uploader", "src"),
            # stdout=subprocess.DEVNULL,
            # stderr=subprocess.DEVNULL
        )
        print("Started uploader server (node mp3-uploader/src/server.js)")
    except Exception as e:
        print(f"Failed to start uploader server: {e}")

    await bot.add_cog(Voice(bot))
    bot.loop.create_task(check_mal_updates())
    print(f'{bot.user} succesfully logged in!')


@bot.command(
    name="gif",
    brief="Sends a random Bocchi gif.",
    help="Sends a random Bocchi the Rock gif from a preset list."
)
async def gif(ctx):
    r = random.randint(0, len(gifs) - 1)
    await ctx.send(gifs[r])

@bot.command(
    name="smirk",
    brief="Sends the smirk emote.",
)
async def smirk(ctx):
    await ctx.send(f"<{SMIRK}>")
    
@bot.command(
    name="token",
    brief="Generates a temporary MP3 uploader link.",
    help="Generates a temporary access token and link for the MP3 uploader web interface. The link is valid for 30 minutes."
)
async def token(ctx):
    proc = subprocess.run(
        ["node", "mp3-uploader/src/token.js"],
        capture_output=True, text=True
    )
    token = proc.stdout.strip()
    link = f"https://{IP}:{PORT}/?token={token}"  # Replace with your actual IP or domain
    await ctx.send(f"Access the MP3 uploader here (valid for 30 minutes):\n{link}")

@bot.command(
    name="download",
    aliases=["dl"],
    brief="Downloads an mp3 file if attached, or a YouTube link with !download [yt link] [song name]",
    help=(
        "Downloads an mp3 file from an attached file or from a YouTube link.\n"
        "Usage:\n"
        "`!download` (with mp3 file attached) - saves the attached mp3.\n"
        "`!download <youtube_link> <song name>` - downloads audio from YouTube and saves as <song name>.mp3."
    )
)
async def download(ctx, youtube_url: str = None, *, title: str = None):
    if ctx.message.attachments:
        for attachment in ctx.message.attachments:
            if attachment.filename.endswith('.mp3'):
                await download_mp3(attachment.url, attachment.filename)
                await ctx.send(f'Downloaded: {attachment.filename}')
    else:


        if youtube_url:
            await ctx.send("Downloading from YouTube...")
            await download_youtube_mp3(youtube_url, title)
            await ctx.send("Downloaded from YouTube!")
        else:
            await ctx.send("No attachments or valid YouTube link found.")
async def download_youtube_mp3(url, title=None):
    job = {"url": url, "title": title}
    proc = await asyncio.create_subprocess_exec(
        sys.executable, "yt_worker.py",
        stdin=asyncio.subprocess.PIPE,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,  # Capture stderr too
    )
    # Send job as JSON
    stdout, stderr = await proc.communicate(json.dumps(job).encode())
    print("YT_WORKER STDOUT:", stdout.decode())
    print("YT_WORKER STDERR:", stderr.decode())
    if not stdout:
        raise Exception("yt_worker.py returned no output. See stderr above.")
    result = json.loads(stdout.decode())
    return result["result"]

async def download_mp3(url, filename):
    response = requests.get(url)
    filename = filename.replace('_', ' ')
    with open(f'songs/{filename}', 'wb') as file:
        file.write(response.content)
@bot.event
async def on_message(message):

    i = random.randint(0, 500)
    
    if (i < 3):
        await message.channel.send("true!")
    print(message.author)
   
    dont = False
    if '<:Bocchi' in message.content and message.author != bot.user:
        dont = True 
        s = message.content.split()
        for word in s:
            if '<:Bocchi' in word: await message.add_reaction(word)

    # if '@everyone' in message.content:
        # await message.channel.send('Shut up, ' + str(message.author))
        # await message.delete()
    
    if '<@1098814023199371315>' in message.content and message.content[-1] == "?":
        response = responses[random.randint(0, len(responses) - 1)]
        print(response)
 
        await message.reply(response)
    elif  i < 33 and 'why'  in str(message.content).lower():
        await message.reply("skill issue")

    print(message.content)
    await bot.process_commands(message)

class Voice(commands.Cog):
    def __init__(self, bot):
        self.bot = bot
        self.queue = []
        self.currently_playing = False
        self.nowPlaying = "nothing lmao"
        self.playlists = self.load_playlists()

# @bot.command()
    def load_playlists(self):
    # Always reload from disk
        if os.path.exists("playlists.json"):
            with open("playlists.json", "r") as f:
                self.playlists = json.load(f)
        else:
            self.playlists = {}

    def save_playlists(self):
        # Save the playlists to a JSON file
        with open("playlists.json", "w") as f:
            json.dump(self.playlists, f, indent=4)

    @commands.command(brief="Creates a new playlist")
    async def plCreate(self, ctx, playlist_name: str):
        """Creates a new playlist."""
        if playlist_name in self.playlists:
            await ctx.send(f"A playlist named '{playlist_name}' already exists.")
        else:
            self.playlists[playlist_name] = []
            self.save_playlists()
            await ctx.send(f"Playlist '{playlist_name}' has been created.")

    @commands.command(brief="Adds a song to a playlist")
    async def plAdd(self, ctx, playlist_name: str, *, song_name: str):
        """Adds a song to an existing playlist."""
        self.load_playlists()  # <-- Add this line
        song_name = song_name + ".mp3"
        song_name = self.find_closest_filename(song_name)[0]
        
        # Check if playlist exists
        if playlist_name not in self.playlists:
            await ctx.send(f"Playlist '{playlist_name}' doesn't exist.")
            return

        # Add the song to the playlist
        if song_name not in self.playlists[playlist_name]:
            self.playlists[playlist_name].append(song_name)
            self.save_playlists()
            await ctx.send(f"Song '{song_name}' added to playlist '{playlist_name}'.")
        else:
            await ctx.send(f"Song '{song_name}' is already in the playlist '{playlist_name}'.")

    @commands.command(brief="Plays a song from a playlist. Use -s to shuffle.")
    async def plPlay(self, ctx, playlist_name: str, *args):
        """Plays songs from a playlist. Use -s to shuffle."""
        self.load_playlists()
        if playlist_name not in self.playlists:
            await ctx.send(f"Playlist '{playlist_name}' doesn't exist.")
            return

        playlist_entries = self.playlists[playlist_name][:]
        if not playlist_entries:
            await ctx.send(f"Playlist '{playlist_name}' is empty.")
            return

        # Shuffle if -s is in args
        if '-s' in args:
            random.shuffle(playlist_entries)

        # Get all available songs (relative paths)
        all_songs = self.get_all_songs()
        all_song_basenames = {os.path.basename(song): song for song in all_songs}

        queue_to_add = []
        for entry in playlist_entries:
            if entry in all_song_basenames:
                queue_to_add.append(all_song_basenames[entry])
            else:
                await ctx.send(f"Song '{entry}' not found in songs folder.")

        self.queue.extend(queue_to_add)
        await ctx.send(f"Queued {len(queue_to_add)} songs from playlist '{playlist_name}'{' (shuffled)' if '-s' in args else ''}.")

        # Start playback immediately with the first song
        if not ctx.voice_client:
            await self.join(ctx)
        if not ctx.voice_client.is_playing() and self.queue:
            first_song = self.queue.pop(0)
            self.nowPlaying = os.path.splitext(os.path.basename(first_song))[0]
            source = FFmpegPCMAudio(os.path.join("songs", first_song))
            ctx.voice_client.play(source, after=lambda e: self.bot.loop.create_task(self.play_next(ctx, 0)))

    @commands.command(brief="Shuffle the queue")
    async def shuffle(self, ctx):
        if not self.queue:
            await ctx.send("The queue is currently empty!")
            return

        random.shuffle(self.queue)
        await ctx.send("The queue has been shuffled.")

    def find_closest_filename(self, target_name):
        files = os.listdir("songs/")
        highest_score = -1
        closest_match = None

        for filename in files:
            similarity_score = fuzz.token_sort_ratio(target_name.lower(), filename.lower())
            print(filename, similarity_score)
            if similarity_score > highest_score:
                highest_score = similarity_score
                closest_match = filename

        return closest_match, highest_score

    @commands.command(brief="Prints the list of available playlists")
    async def plList(self, ctx):
        """Lists all available playlists."""
        self.load_playlists()  # <-- Add this line
        if not self.playlists:
            await ctx.send("No playlists available.")
            return

        playlists_list = "\n".join(self.playlists.keys())
        await ctx.send(f"Available playlists:\n{playlists_list}")

    async def join(self, ctx):
        if ctx.author.voice:
            channel = ctx.author.voice.channel
            await channel.connect()
        else:
            await ctx.send("You are not connected to a voice channel.")

    @commands.command(brief="Removes a song from a playlist")
    async def plRemove(self, ctx, playlist_name: str, *, song_name: str):
        """Removes a song from an existing playlist."""
        self.load_playlists()  # <-- Add this line
        song_name = song_name + ".mp3"
        song_name = self.find_closest_filename(song_name)[0]
        
        # Check if playlist exists
        if playlist_name not in self.playlists:
            await ctx.send(f"Playlist '{playlist_name}' doesn't exist.")
            return

        # Check if the song exists in the playlist
        if song_name in self.playlists[playlist_name]:
            self.playlists[playlist_name].remove(song_name)
            self.save_playlists()
            await ctx.send(f"Song '{song_name}' has been removed from playlist '{playlist_name}'.")
        else:
            await ctx.send(f"Song '{song_name}' is not in the playlist '{playlist_name}'.")

    @commands.command(brief="Joins the current voice channel and plays a song if one isn't playing or adds a song to the queue if one is currently playing")
    async def play(self, ctx, *, file_name):
        if not ctx.voice_client:
            await self.join(ctx)

        # Find the closest match among all songs (including subfolders)
        all_songs = self.get_all_songs()
        file_name_mp3 = file_name + ".mp3"
        closest_match = max(all_songs, key=lambda f: fuzz.token_sort_ratio(file_name_mp3.lower(), os.path.basename(f).lower()))
        self.queue.append(closest_match)
        
        if not ctx.voice_client.is_playing():
            await self.play_next(ctx, 0)
            
    @commands.command(brief="Clears the queue")
    async def clear(self, ctx):
        self.queue.clear()

    @commands.command(brief="Kicks bocchi <:BocchiAngry:1180048642116165682>")
    async def leave(self, ctx):
        self.queue.clear()
        if ctx.voice_client:
            await ctx.voice_client.disconnect()
        else:
            await ctx.send("I'm not connected to a voice channel.")
            
    @commands.command()
    async def playing(self, ctx):
        # Try to send album art if present
        try:
            # Find the file currently playing
            all_songs = self.get_all_songs()
            # Find the file that matches nowPlaying
            for song in all_songs:
                if os.path.splitext(os.path.basename(song))[0] == self.nowPlaying:
                    song_path = os.path.join("songs", song)
                    tags = ID3(song_path)
                    for tag in tags.values():
                        if isinstance(tag, APIC):
                            img_path = "/tmp/album_art.jpg"
                            with open(img_path, "wb") as img_file:
                                img_file.write(tag.data)
                            await ctx.send("Now Playing: " + self.nowPlaying, file=discord.File(img_path))
                            # await ctx.send("Album art:", file=discord.File(img_path))
                            return
        except Exception as e:
            await ctx.send("Now Playing: " + self.nowPlaying)
            print(f"No album art found or error: {e}")
   
        
    def get_all_songs(self):
        # Recursively find all mp3 files in songs/ and subfolders
        return [os.path.relpath(f, "songs") for f in glob.glob("songs/**/*.mp3", recursive=True)]

    async def play_next(self, ctx, pos):
        if self.queue:
            if not ctx.voice_client.is_playing():
                print(self.queue)
                file_name = self.queue.pop(pos)
                self.nowPlaying = os.path.splitext(os.path.basename(file_name))[0]
                print(self.queue)
                # Use the full path for FFmpegPCMAudio
                source = FFmpegPCMAudio(os.path.join("songs", file_name))
                ctx.voice_client.play(source, after=lambda e: bot.loop.create_task(self.play_next(ctx, 0)))
        
 
    @commands.command(brief="Jumps to a given index in the queue")
    async def jump(self, ctx, *, jumpto):
        jumpto = int(jumpto)
        if jumpto >= len(self.queue):
            await ctx.send("Invalid index")
            return
        if ctx.voice_client and ctx.voice_client.is_playing():
            ctx.voice_client.stop()
            
            await self.play_next(ctx, jumpto)
        else:
            await ctx.send("I am not currently playing any music.")

    # @bot.command()
    # async def remove(ctx, *, args):

    @commands.command(brief="Skips the current song and plays the next song in the queue")
    async def skip(self, ctx):
        if ctx.voice_client and ctx.voice_client.is_playing():
            ctx.voice_client.stop()
            await self.play_next(ctx, 0)
        else:
            await ctx.send("I am not currently playing any music.")


    @commands.command()
    async def random(self, ctx, amount=1):
        for i in range(amount):
            filename = random.choice(os.listdir("songs/"))
            await self.play(ctx, file_name=filename)
    
    def find_closest_filename(self, target_name):
        files = os.listdir("songs/")
        highest_score = -1
        closest_match = None

        for filename in files:
            similarity_score = fuzz.token_sort_ratio(target_name.lower(), filename.lower())
            print(filename, similarity_score)
            if similarity_score > highest_score:
                highest_score = similarity_score
                closest_match = filename

        return closest_match, similarity_score
    @commands.command(brief="Prints the current song queue (paginated)", aliases=["queue"])
    async def q(self, ctx: Context):
        PAGE_SIZE = 50
        queue = self.queue.copy()
        total_pages = max(1, (len(queue) + PAGE_SIZE - 1) // PAGE_SIZE)

        def get_page(page):
            start = page * PAGE_SIZE
            end = start + PAGE_SIZE
            lines = [
                f"{i+start:<3} | {os.path.splitext(os.path.basename(filename))[0]}"
                for i, filename in enumerate(queue[start:end])
            ]
            content = (
                f"**Queue (Page {page+1}/{total_pages})**\n"
                "```Queue | Filename\n-----|---------\n"
                + "\n".join(lines) + "```"
            )
            return content

        page = 0
        message = await ctx.send(get_page(page))

        if total_pages == 1:
            return

        EMOJIS = ["⏮️", "◀️", "▶️", "⏭️"]
        for emoji in EMOJIS:
            await message.add_reaction(emoji)

        def check(reaction, user):
            return (
                reaction.message.id == message.id
                and user == ctx.author
                and str(reaction.emoji) in EMOJIS
            )

        while True:
            try:
                reaction, user = await ctx.bot.wait_for("reaction_add", timeout=60.0, check=check)
            except asyncio.TimeoutError:
                break

            if str(reaction.emoji) == "⏮️":
                page = 0
            elif str(reaction.emoji) == "◀️":
                page = max(0, page - 1)
            elif str(reaction.emoji) == "▶️":
                page = min(total_pages - 1, page + 1)
            elif str(reaction.emoji) == "⏭️":
                page = total_pages - 1

            await message.edit(content=get_page(page))
            await message.remove_reaction(reaction.emoji, user)

class CustomHelpCommand(commands.MinimalHelpCommand):
    async def send_bot_help(self, mapping):
        ctx = self.context
        prefix = ctx.clean_prefix
        embed = discord.Embed(
            title="Bocchi Bot Help",
            description=f"Use `{prefix}help <command>` for more info on a command.\n\n**Available Commands:**",
            color=discord.Color.blurple()
        )
        for cog, commands_list in mapping.items():
            filtered = await self.filter_commands(commands_list, sort=True)
            if filtered:
                cog_name = getattr(cog, "qualified_name", "Other")
                value = "\n".join(f"`{prefix}{c.name}`: {c.brief or c.help or 'No description'}" for c in filtered)
                embed.add_field(name=cog_name, value=value, inline=False)
        await ctx.send(embed=embed)

    async def send_command_help(self, command):
        ctx = self.context
        prefix = ctx.clean_prefix
        embed = discord.Embed(
            title=f"Help: {prefix}{command.qualified_name}",
            description=command.help or "No description provided.",
            color=discord.Color.blurple()
        )
        if command.aliases:
            embed.add_field(name="Aliases", value=", ".join(f"`{a}`" for a in command.aliases), inline=False)
        params = " ".join(f"<{k}>" for k in command.clean_params)
        embed.add_field(name="Usage", value=f"`{prefix}{command.qualified_name} {params}`", inline=False)
        await ctx.send(embed=embed)

    async def send_group_help(self, group):
        await self.send_command_help(group)

    async def send_cog_help(self, cog):
        ctx = self.context
        prefix = ctx.clean_prefix
        embed = discord.Embed(
            title=f"{cog.qualified_name} Commands",
            color=discord.Color.blurple()
        )
        filtered = await self.filter_commands(cog.get_commands(), sort=True)
        for command in filtered:
            embed.add_field(
                name=f"{prefix}{command.qualified_name}",
                value=command.brief or command.help or "No description",
                inline=False
            )
        await ctx.send(embed=embed)

    async def send_error_message(self, error):
        await self.context.send(f":x: {error}")

# Set the custom help command
bot.help_command = CustomHelpCommand()
last_updates = {}  # Store last update times
responsemap = {"plan_to_watch": "plans to watch", "plan_to_read": "plans to read","watching": "is watching", "completed": "has completed", "on-hold": "has put on hold", "dropped": "has dropped"}
seen_entries = set()  # Store unique entry keys

async def check_mal_updates():
    await bot.wait_until_ready()
    channel = bot.get_channel(CHANNEL_ID)
    initialized = False  # Track if we've done the initial fill

    while not bot.is_closed():
        async with aiohttp.ClientSession() as session:
            for discord_id, mal_username in TRACKED_USERS.items():
                # --- Anime section ---
                url = f"https://api.myanimelist.net/v2/users/{mal_username}/animelist?fields=list_status&limit=10&sort=list_updated_at"
                headers = {"X-MAL-CLIENT-ID": MAL_CLIENT_ID}
                try:
                    async with session.get(url, headers=headers) as resp:
                        if resp.status == 200:
                            data = await resp.json()
                            if data.get('data'):
                                for entry in data['data']:
                                    if 'list_status' in entry and 'updated_at' in entry['list_status']:
                                        unique_key = f"anime_{entry['node']['id']}_{entry['list_status']['updated_at']}"
                                        if unique_key not in seen_entries:
                                            if initialized:
                                                # Notify
                                                anime_title = entry['node']['title']
                                                anime_id = entry['node']['id']
                                                anime_score = entry['list_status'].get('score', 0)
                                                episodes_watched = entry['list_status']['num_episodes_watched']
                                                total_episodes = entry['node'].get('num_episodes')
                                                if total_episodes is None: total_episodes = '?'
                                                status = entry['list_status']['status']
                                                mal_url = f"https://myanimelist.net/anime/{anime_id}"

                                                message = f"{mal_username} {responsemap[status]}:\n"
                                                message += f"**{anime_title}**"
                                                if status != "plan_to_watch":
                                                    message += f" - Episode {episodes_watched}"
                                                if total_episodes != 0 and status != "plan_to_watch":
                                                    message += f"/{total_episodes}"
                                                if anime_score != 0:
                                                    message += f"\nand rated it {anime_score}/10"
                                                message += f"\n{mal_url}"

                                                await channel.send(message)
                                                print(f"Sent update notification for {mal_username} ({discord_id}): {anime_title}")
                                            seen_entries.add(unique_key)
                except Exception as e:
                    print(f"Exception checking {mal_username}: {e}")

                # --- Manga section ---
                url_manga = f"https://api.myanimelist.net/v2/users/{mal_username}/mangalist?fields=list_status&limit=10&sort=list_updated_at"
                try:
                    async with session.get(url_manga, headers=headers) as resp:
                        if resp.status == 200:
                            data = await resp.json()
                            if data.get('data'):
                                for entry in data['data']:
                                    if 'list_status' in entry and 'updated_at' in entry['list_status']:
                                        unique_key = f"manga_{entry['node']['id']}_{entry['list_status']['updated_at']}"
                                        if unique_key not in seen_entries:
                                            if initialized:
                                                # Notify
                                                manga_title = entry['node']['title']
                                                manga_id = entry['node']['id']
                                                manga_score = entry['list_status'].get('score', 0)
                                                chapters_read = entry['list_status']['num_chapters_read']
                                                total_chapters = entry['node'].get('num_chapters', '?')
                                                status = entry['list_status']['status']
                                                mal_url = f"https://myanimelist.net/manga/{manga_id}"

                                                message = f"{mal_username} {responsemap[status]}:\n"
                                                message += f"**{manga_title}**"
                                                if status != "plan_to_read":
                                                    message += f" - Chapter {chapters_read}"
                                                if total_chapters != 0 and status != "plan_to_read":
                                                    message += f"/{total_chapters}"
                                                if manga_score != 0 and status != "plan_to_read":
                                                    message += f"\nand rated it {manga_score}/10"
                                                message += f"\n{mal_url}"

                                                await channel.send(message)
                                                print(f"Sent manga update notification for {mal_username} ({discord_id}): {manga_title}")
                                            seen_entries.add(unique_key)
                except Exception as e:
                    print(f"[MANGA] Exception checking {mal_username}: {e}")
                await asyncio.sleep(1)
        initialized = True  # After first full loop, start sending notifications
        await asyncio.sleep(60*5)
    
@bot.event
async def on_voice_state_update(member, before, after):
    # Only check if the bot is connected to a voice channel
    voice = discord.utils.get(bot.voice_clients)
    if not voice or not voice.channel:
        return

    # If the bot is not in any channel, do nothing
    channel = voice.channel
    # Get all non-bot members in the channel
    non_bot_members = [m for m in channel.members if not m.bot]

    # If only the bot is left, disconnect
    if len(non_bot_members) == 0:
        await voice.disconnect()

bot.run(TOKEN)
