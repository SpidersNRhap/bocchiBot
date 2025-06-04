const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { verifyAccessToken } = require('./token'); // Adjust path as needed
const cookieParser = require('cookie-parser');

const app = express();
const PORT = 3000;
const songsDir = path.join(__dirname, '/../../songs');
const playlistsPath = path.join(__dirname, '../../playlists.json');

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
    // Allow static files and login
    if (
        req.path.startsWith('/styles.css') ||
        req.path.startsWith('/upload.js') ||
        req.path.startsWith('/favicon.ico') ||
        req.path.startsWith('/public') ||
        req.path === '/login'
    ) {
        return next();
    }
    // Only check for token in query
    const token = req.query.token;
    if (verifyAccessToken(token)) {
        return next();
    }
    res.status(403).send('Access denied. Please use a valid link.');
});

// Serve static files from the public directory
app.use(express.static(path.join(__dirname, 'public')));

// Handle file uploads
app.post('/upload', upload.array('files'), (req, res) => {
    if (req.files) {
        res.status(200).json({ message: 'Files uploaded successfully.' });
    } else {
        res.status(400).json({ message: 'No files uploaded.' });
    }
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

// Start the server
app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});