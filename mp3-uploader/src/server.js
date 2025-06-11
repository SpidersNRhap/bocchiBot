const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { generateAccessToken, verifyAccessToken } = require('./token'); // Already imported
const cookieParser = require('cookie-parser');
const mm = require('music-metadata');
const NodeID3 = require('node-id3');  // npm install node-id3
const SpotifyWebApi = require('spotify-web-api-node');
const axios = require('axios'); // npm install axios

const app = express();
const PORT = process.env.PORT || 3000;
const songsDir = path.join(__dirname, '../../songs');
const playlistsPath = path.join(__dirname, '../../playlists.json');

const https = require('https');
const sslKey = fs.readFileSync('/etc/letsencrypt/live/bocchibot.xyz/privkey.pem');
const sslCert = fs.readFileSync('/etc/letsencrypt/live/bocchibot.xyz/fullchain.pem');

// Ensure the songs directory exists
if (!fs.existsSync(songsDir)) {
    fs.mkdirSync(songsDir);
}

// Set up multer for file uploads
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const folderName = req.body.folder ? req.body.folder : 'default';
        const folderPath = path.join(songsDir, folderName);

        // Create folder if it doesn't exist
        if (!fs.existsSync(folderPath)) {
            fs.mkdirSync(folderPath, { recursive: true });
        }
        cb(null, folderPath);
    },
    filename: (req, file, cb) => {
        cb(null, file.originalname);
    }
});

const upload = multer({ storage });
app.use(cookieParser());

// Middleware to protect all routes except static assets and /login
app.use((req, res, next) => {
    // Allow static files, login, /token, and metadata.html
    if (
        req.path.startsWith('/styles.css') ||
        req.path.startsWith('/upload.js') ||
        req.path.startsWith('/favicon.ico') ||
        req.path.startsWith('/public') ||
        req.path === '/login' ||
        req.path === '/token' ||
        req.path === '/metadata.html'
    ) {
        return next();
    }
    // Allow if token is valid OR apiKey is valid
    const token = req.query.token;
    const apiKey = req.query.apiKey;
    const validApiKey = process.env.TOKEN_API_KEY;
    if (verifyAccessToken(token) || (apiKey && apiKey === validApiKey)) {
        return next();
    }
    res.status(403).send('Access denied. Please use a valid link.');
});

// Serve static files from the public directory
app.use(express.static(path.join(__dirname, 'public')));

// Handle file uploads
app.post('/upload', upload.array('files'), async (req, res) => {
    if (!req.files) {
        return res.status(400).json({ message: 'No files uploaded.' });
    }

    // Filter out non-audio files
    const audioFiles = req.files.filter(file => {
        // Accept only audio/* mimetypes or .mp3/.wav/.flac extensions
        const isAudio = file.mimetype.startsWith('audio/');
        const ext = path.extname(file.originalname).toLowerCase();
        const allowedExt = ['.mp3', '.wav', '.flac', '.ogg', '.aac', '.m4a'];
        if (!isAudio && !allowedExt.includes(ext)) {
            console.log(`[UPLOAD] Skipping non-audio file: ${file.originalname} (${file.mimetype})`);
            // Optionally, delete the uploaded non-audio file from disk:
            fs.unlinkSync(file.path);
            return false;
        }
        return true;
    });

    if (audioFiles.length === 0) {
        return res.status(400).json({ message: 'No audio files uploaded.' });
    }

    // For each uploaded audio file, trigger metadata update
    for (const file of audioFiles) {
        // Determine folder and filename
        const relPath = path.relative(songsDir, file.path);
        let folder = path.dirname(relPath);
        let filename = path.basename(relPath);

        // If folder is '.' (root), treat as empty string
        if (folder === '.') folder = '';

        // Call the metadata update logic directly
        // You can call your handler function or just do the logic here:
        try {
            // Read existing metadata (if any)
            const filePath = path.join(songsDir, folder, filename);
            let tags = {};
            try {
                const metadata = await mm.parseFile(filePath);
                tags = {
                    title: metadata.common.title || '',
                    artist: metadata.common.artist || '',
                    album: metadata.common.album || '',
                    year: metadata.common.year || '',
                    genre: (metadata.common.genre && metadata.common.genre.join(', ')) || ''
                };
            } catch (e) {
                // Ignore if can't read metadata
            }

            // If any field is missing, trigger Spotify autofill
            if (!tags.title || !tags.artist || !tags.album || !tags.year) {
                let query = tags.title || filename.replace(/\.mp3$/i, '');
                if (tags.artist) query += ` ${tags.artist}`;
                console.log(`[SPOTIFY][UPLOAD] Fetching metadata for query: "${query}"`);
                const spotifyMeta = await fetchSpotifyMetadata(query);

                tags.title = tags.title || spotifyMeta.title;
                tags.artist = tags.artist || spotifyMeta.artist;
                tags.album = tags.album || spotifyMeta.album;
                tags.year = tags.year || spotifyMeta.year;
                tags.genre = tags.genre || spotifyMeta.genre;

                // Optionally fetch album art as in your main handler
                let imageBuffer = null;
                if (spotifyMeta.albumArtUrl) {
                    try {
                        const imgRes = await axios.get(spotifyMeta.albumArtUrl, { responseType: 'arraybuffer' });
                        imageBuffer = Buffer.from(imgRes.data, 'binary');
                        tags.image = {
                            mime: 'image/jpeg',
                            type: { id: 3, name: 'front cover' },
                            description: 'Cover',
                            imageBuffer
                        };
                    } catch (e) {
                        console.error('[SPOTIFY][UPLOAD] Failed to fetch album art image:', e);
                    }
                }
                NodeID3.update(tags, filePath, err => {
                    if (err) console.error('[SPOTIFY][UPLOAD] Failed to update metadata:', err);
                });
            }
        } catch (e) {
            console.error('[SPOTIFY][UPLOAD] Error updating metadata for', filename, e);
        }
    }

    res.status(200).json({ message: 'Audio files uploaded successfully.' });
});

// List songs and folders
app.get('/songs', (req, res) => {
    function listDir(dirPath, relPath = '') {
        const items = fs.readdirSync(dirPath, { withFileTypes: true });
        return items.map(item => {
            const itemPath = path.join(dirPath, item.name);
            const relative = path.join(relPath, item.name);
            if (item.isDirectory()) {
                return {
                    type: 'folder',
                    name: item.name,
                    children: listDir(itemPath, relative)
                };
            } else {
                return {
                    type: 'file',
                    name: item.name,
                    path: relative
                };
            }
        });
    }
    try {
        const tree = listDir(songsDir);
        res.json(tree);
    } catch (err) {
        res.status(500).json({ error: 'Failed to list songs.' });
    }
});

// Get all playlists
app.get('/playlists', (req, res) => {
    try {
        const playlists = JSON.parse(fs.readFileSync(playlistsPath, 'utf8'));
        res.json(playlists);
    } catch (err) {
        res.status(500).json({ error: 'Failed to load playlists.' });
    }
});

// Add a song to a playlist
app.post('/playlists/:playlist/add', express.json(), (req, res) => {
    const playlistName = req.params.playlist;
    const { song, songs } = req.body;
    const playlists = JSON.parse(fs.readFileSync(playlistsPath, 'utf8'));
    if (!playlists[playlistName]) return res.status(404).json({ error: 'Playlist not found.' });

    if (Array.isArray(songs)) {
        // Add multiple songs, avoid duplicates, filter out null/undefined
        const validSongs = songs.filter(s => typeof s === 'string' && s);
        playlists[playlistName].push(...validSongs.filter(s => !playlists[playlistName].includes(s)));
    } else if (song) {
        if (!playlists[playlistName].includes(song)) {
            playlists[playlistName].push(song);
        }
    }
    fs.writeFileSync(playlistsPath, JSON.stringify(playlists, null, 4));
    res.json({ success: true });
});

// Remove a song from a playlist
app.post('/playlists/:playlist/remove', express.json(), (req, res) => {
    const { song } = req.body;
    const playlistName = req.params.playlist;
    try {
        const playlists = JSON.parse(fs.readFileSync(playlistsPath, 'utf8'));
        if (!playlists[playlistName]) return res.status(404).json({ error: 'Playlist not found.' });
        playlists[playlistName] = playlists[playlistName].filter(s => s !== song);
        fs.writeFileSync(playlistsPath, JSON.stringify(playlists, null, 4));
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'Failed to remove song.' });
    }
});

// Create a new playlist
app.post('/playlists/:playlist/create', express.json(), (req, res) => {
    const playlistName = req.params.playlist;
    const playlistsPath = path.join(__dirname, '../../playlists.json');
    try {
        const playlists = JSON.parse(fs.readFileSync(playlistsPath, 'utf8'));
        if (playlists[playlistName]) {
            return res.status(400).json({ error: 'Playlist already exists.' });
        }
        playlists[playlistName] = [];
        fs.writeFileSync(playlistsPath, JSON.stringify(playlists, null, 4));
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'Failed to create playlist.' });
    }
});

// Serve audio files securely (with token)
app.get('/stream/:folder?/:filename', (req, res) => {
    let { folder, filename } = req.params;
    if (!filename) {
        // If only one param, treat it as filename in root
        filename = folder;
        folder = '';
    }
    const token = req.query.token;


    if (!(verifyAccessToken(token))) {
        return res.status(403).send('Invalid or expired token.');
    }

    const filePath = path.join(songsDir, folder || '', filename);
    console.log(`[STREAM] Requested file: ${filePath}`); // <-- Add this line

    if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
        console.log(`[STREAM] File not found: ${filePath}`); // <-- And this line
        return res.status(404).send('File not found.');
    }
    // Support range requests for streaming
    const stat = fs.statSync(filePath);
    const range = req.headers.range;
    if (range) {
        const parts = range.replace(/bytes=/, "").split("-");
        const start = parseInt(parts[0], 10);
        const end = parts[1] ? parseInt(parts[1], 10) : stat.size - 1;
        const chunkSize = (end - start) + 1;
        const file = fs.createReadStream(filePath, { start, end });
        res.writeHead(206, {
            'Content-Range': `bytes ${start}-${end}/${stat.size}`,
            'Accept-Ranges': 'bytes',
            'Content-Length': chunkSize,
            'Content-Type': 'audio/mpeg',
        });
        file.pipe(res);
    } else {
        res.writeHead(200, {
            'Content-Length': stat.size,
            'Content-Type': 'audio/mpeg',
        });
        fs.createReadStream(filePath).pipe(res);
    }
});

// Secure token endpoint with API key
app.get('/token', (req, res) => {
    const apiKey = req.query.apiKey;
    const validApiKey = process.env.TOKEN_API_KEY; // Add TOKEN_API_KEY to your .env

    if (!apiKey || apiKey !== validApiKey) {
        return res.status(403).json({ error: 'Invalid API key.' });
    }
    const token = generateAccessToken();
    res.json({ token });
});

// Get metadata for a song
app.get('/metadata/:folder?/:filename', async (req, res) => {
    let { folder, filename } = req.params;
    if (!filename) {
        filename = folder;
        folder = '';
    }
    const token = req.query.token;
    if (!(verifyAccessToken(token))) {
        return res.status(403).send('Invalid or expired token.');
    }
    const filePath = path.join(songsDir, folder || '', filename);
    try {
        const metadata = await mm.parseFile(filePath);
        res.json({
            title: metadata.common.title || '',
            artist: metadata.common.artist || '',
            album: metadata.common.album || '',
            year: metadata.common.year || '',
            genre: (metadata.common.genre && metadata.common.genre.join(', ')) || ''
        });
    } catch (err) {
        res.status(500).json({ error: 'Failed to read metadata.' });
    }
});

// Update metadata for a song
const metaUpload = multer();
app.post('/metadata/:folder?/:filename', metaUpload.single('albumart'), async (req, res) => {
    let { folder, filename } = req.params;
    if (!filename) {
        filename = folder;
        folder = '';
    }
    const token = req.query.token;
    if (!(verifyAccessToken(token))) {
        return res.status(403).send('Invalid or expired token.');
    }
    const filePath = path.join(songsDir, folder || '', filename);

    // Build tags directly from form
    let tags = {
        title: req.body.title || '',
        artist: req.body.artist || '',
        album: req.body.album || '',
        year: req.body.year || '',
        genre: req.body.genre || ''
    };

    if (req.file) {
        tags.image = {
            mime: req.file.mimetype,
            type: { id: 3, name: 'front cover' },
            description: 'Cover',
            imageBuffer: req.file.buffer
        };
    }

    console.log('[METADATA] filePath:', filePath);
    console.log('[METADATA] tags:', tags);

    NodeID3.update(tags, filePath, (err) => {
        if (err) {
            console.error('[METADATA] Failed to update:', err);
            return res.status(500).json({ error: 'Failed to update metadata.' });
        }
        console.log('[METADATA] Update successful');
        res.json({ success: true, tags });
    });
});

// Get album art for a song
app.get('/albumart/:folder?/:filename', (req, res) => {
    let { folder, filename } = req.params;
    if (!filename) {
        filename = folder;
        folder = '';
    }
    const token = req.query.token;
    if (!(verifyAccessToken(token))) {
        return res.status(403).send('Invalid or expired token.');
    }
    const filePath = path.join(songsDir, folder || '', filename);
    try {
        const tags = NodeID3.read(filePath);
        if (tags.image && tags.image.imageBuffer) {
            res.set('Content-Type', tags.image.mime);
            res.send(tags.image.imageBuffer);
        } else {
            res.status(404).send('No album art');
        }
    } catch (e) {
        res.status(500).send('Error reading album art');
    }
});

// Update album art for a song
const artUpload = multer();
app.post('/albumart/:folder?/:filename', artUpload.single('albumart'), (req, res) => {
    let { folder, filename } = req.params;
    if (!filename) {
        filename = folder;
        folder = '';
    }
    const token = req.query.token;
    if (!(verifyAccessToken(token))) {
        return res.status(403).send('Invalid or expired token.');
    }
    const filePath = path.join(songsDir, folder || '', filename);
    if (!req.file) return res.status(400).send('No image uploaded');
    const tags = {
        image: {
            mime: req.file.mimetype,
            type: { id: 3, name: 'front cover' },
            description: 'Cover',
            imageBuffer: req.file.buffer
        }
    };
    NodeID3.update(tags, filePath, (err) => {
        if (err) return res.status(500).json({ error: 'Failed to update album art.' });
        res.json({ success: true });
    });
});

// Delete album art for a song
app.delete('/albumart/:folder?/:filename', (req, res) => {
    let { folder, filename } = req.params;
    if (!filename) {
        filename = folder;
        folder = '';
    }
    const token = req.query.token;
    if (!(verifyAccessToken(token))) {
        return res.status(403).send('Invalid or expired token.');
    }
    const filePath = path.join(songsDir, folder || '', filename);
    // Remove album art by updating with empty image
    NodeID3.update({ image: null }, filePath, (err) => {
        if (err) return res.status(500).json({ error: 'Failed to delete album art.' });
        res.json({ success: true });
    });
});

// Rename a file or folder
app.post('/rename/:oldName', express.json(), (req, res) => {
    const token = req.query.token;
    if (!verifyAccessToken(token)) return res.status(403).json({ error: 'Invalid or expired token.' });
    const oldName = req.params.oldName; // may include folder
    const { newName } = req.body;       // just the filename
    if (!newName) return res.status(400).json({ error: 'Missing newName.' });

    // Prevent folder changes: only allow renaming the file, not moving it
    if (newName.includes('/') || newName.includes('\\')) {
        return res.status(400).json({ error: 'Renaming folders or moving files is not allowed.' });
    }

    const oldPath = path.join(songsDir, oldName);
    const folder = path.dirname(oldName) === '.' ? '' : path.dirname(oldName);
    const newPath = path.join(songsDir, folder, newName);

    console.log(`[RENAME] Attempting to rename:`);
    console.log(`  oldName: ${oldName}`);
    console.log(`  newName: ${newName}`);
    console.log(`  oldPath: ${oldPath}`);
    console.log(`  newPath: ${newPath}`);

    if (!fs.existsSync(oldPath)) {
        console.log(`[RENAME] File not found: ${oldPath}`);
        return res.status(404).json({ error: 'File not found.' });
    }
    if (fs.existsSync(newPath)) {
        console.log(`[RENAME] Target already exists: ${newPath}`);
        return res.status(400).json({ error: 'A file with that name already exists.' });
    }

    try {
        fs.renameSync(oldPath, newPath);

        // --- Update playlists ---
        const playlists = JSON.parse(fs.readFileSync(playlistsPath, 'utf8'));
        const oldFile = oldName.split('/').pop(); // Only the filename
        const newFile = newName; // Only the filename
        let changed = false;
        for (const key in playlists) {
            let updated = false;
            playlists[key] = playlists[key].map(song => {
                if (song === oldFile) {
                    updated = true;
                    console.log(`[RENAME] Playlist "${key}": updating "${song}" to "${newFile}"`);
                    return newFile;
                }
                return song;
            });
            if (updated) {
                changed = true;
                console.log(`[RENAME] Playlist "${key}" updated.`);
            }
        }
        if (changed) {
            fs.writeFileSync(playlistsPath, JSON.stringify(playlists, null, 4));
            console.log(`[RENAME] Playlists file updated.`);
        } else {
            console.log(`[RENAME] No playlist entries needed updating.`);
        }
        // --- End update playlists ---

        res.json({ success: true });
    } catch (e) {
        console.error('[RENAME] Rename failed:', e);
        res.status(500).json({ error: 'Rename failed.' });
    }
});

// Delete a file
app.delete('/delete/:filename', (req, res) => {
    const token = req.query.token;
    if (!verifyAccessToken(token)) return res.status(403).json({ error: 'Invalid or expired token.' });
    const filename = req.params.filename;
    const filePath = path.join(songsDir, filename);
    if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'File not found.' });

    // Delete the file
    fs.unlinkSync(filePath);

    // Remove from all playlists
    try {
        const playlistsPath = path.join(__dirname, '../../playlists.json');
        const playlists = JSON.parse(fs.readFileSync(playlistsPath, 'utf8'));
        let changed = false;
        for (const key in playlists) {
            const before = playlists[key].length;
            playlists[key] = playlists[key].filter(song => song !== filename);
            if (playlists[key].length !== before) changed = true;
        }
        if (changed) {
            fs.writeFileSync(playlistsPath, JSON.stringify(playlists, null, 4));
        }
    } catch (e) {
        // Optionally log error, but don't block file delete
    }

    res.json({ success: true });
});

// Start the server
https.createServer({ key: sslKey, cert: sslCert }, app).listen(PORT, '0.0.0.0', () => {
    console.log(`HTTPS server running at https://localhost:${PORT}`);
});

const spotifyApi = new SpotifyWebApi({
    clientId: process.env.SPOTIFY_CLIENT_ID,
    clientSecret: process.env.SPOTIFY_CLIENT_SECRET
});

async function fetchSpotifyMetadata(query) {
    try {
        console.log(`[SPOTIFY] Authenticating with Spotify API...`);
        const data = await spotifyApi.clientCredentialsGrant();
        spotifyApi.setAccessToken(data.body['access_token']);
        console.log(`[SPOTIFY] Searching for track: "${query}"`);
        const result = await spotifyApi.searchTracks(query, { limit: 1 });
        if (result.body.tracks.items.length > 0) {
            const track = result.body.tracks.items[0];
            console.log('[SPOTIFY] Track found:', {
                title: track.name,
                artist: track.artists.map(a => a.name).join(', '),
                album: track.album.name
            });
            return {
                title: track.name,
                artist: track.artists.map(a => a.name).join(', '),
                album: track.album.name,
                year: track.album.release_date ? track.album.release_date.split('-')[0] : '',
                genre: (track.album.genres && track.album.genres[0]) || '',
                albumArtUrl: track.album.images && track.album.images[0] ? track.album.images[0].url : null
            };
        } else {
            console.log('[SPOTIFY] No track found for query:', query);
        }
    } catch (e) {
        console.error('[SPOTIFY] Spotify fetch error:', e);
    }
    return {};
}