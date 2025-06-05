document.addEventListener('DOMContentLoaded', () => {
    const uploadForm = document.getElementById('uploadForm');
    const statusMessage = document.getElementById('statusMessage');
    const uploadProgress = document.getElementById('uploadProgress');

    function getToken() {
        const params = new URLSearchParams(window.location.search);
        return params.get('token');
    }

    const progressBar = document.getElementById('uploadProgress');

    async function uploadWithProgress(formData) {
        return new Promise((resolve, reject) => {
            const xhr = new XMLHttpRequest();
            xhr.open('POST', `/upload?token=${getToken()}`);
            xhr.withCredentials = true;

            xhr.upload.onprogress = (e) => {
                if (e.lengthComputable) {
                    progressBar.style.display = '';
                    progressBar.value = (e.loaded / e.total) * 100;
                }
            };
            xhr.onload = () => {
                progressBar.style.display = 'none';
                if (xhr.status >= 200 && xhr.status < 300) {
                    resolve(JSON.parse(xhr.responseText));
                } else {
                    reject(new Error(xhr.responseText));
                }
            };
            xhr.onerror = () => {
                progressBar.style.display = 'none';
                reject(new Error('Network error'));
            };
            xhr.send(formData);
        });
    }

    uploadForm.addEventListener('submit', async (event) => {
        event.preventDefault();
        const fileInput = document.getElementById('fileInput');
        let files = Array.from(fileInput.files);

        // Only allow audio files and archives
        files = files.filter(f =>
            f.type.startsWith('audio/') ||
            /\.(mp3|wav|flac|ogg|zip|rar|7z)$/i.test(f.name)
        );

        if (files.length === 0) {
            statusMessage.textContent = 'Please select audio files or archives only.';
            return;
        }

        // Check for incorrect filetypes
        const incorrectFiles = Array.from(fileInput.files).filter(f =>
            !(
                f.type.startsWith('audio/') ||
                /\.(mp3|wav|flac|ogg|zip|rar|7z)$/i.test(f.name)
            )
        );
        if (incorrectFiles.length > 0) {
            statusMessage.textContent = 'Incorrect filetype: ' + incorrectFiles.map(f => f.name).join(', ');
            return;
        }

        // Check if any file is a zip
        const zipFile = files.find(f => f.name.endsWith('.zip'));
        if (zipFile) {
            // Use fflate to extract files in browser
            const arrayBuffer = await zipFile.arrayBuffer();
            const zipped = new Uint8Array(arrayBuffer);
            const entries = fflate.unzipSync(zipped);

            // Filter for files (not folders) and create File objects
            const extractedFiles = Object.entries(entries)
                .filter(([name, entry]) => !entry.directory)
                .map(([name, entry]) => new File([entry], name));

            // Remove the zip from the files list, add extracted files
            const uploadFiles = files.filter(f => f !== zipFile).concat(extractedFiles);

            // Now upload all files as normal
            const formData = new FormData(uploadForm);
            formData.delete('files'); // Remove the original files
            uploadFiles.forEach(file => formData.append('files', file));

            try {
                progressBar.value = 0;
                progressBar.style.display = '';
                const result = await uploadWithProgress(formData);
                statusMessage.textContent = result.message || 'Files uploaded successfully!';
                loadSongs();
            } catch (error) {
                statusMessage.textContent = error.message || 'An error occurred during upload.';
            } finally {
                progressBar.style.display = 'none';
            }
        } else {
            // No zip, upload as usual
            const formData = new FormData(uploadForm);
            try {
                const response = await fetch(`/upload?token=${getToken()}`, {
                    method: 'POST',
                    body: formData,
                    credentials: "include"
                });

                if (response.ok) {
                    const result = await response.json();
                    statusMessage.textContent = result.message || 'Files uploaded successfully!';
                    loadSongs();
                } else {
                    const error = await response.json();
                    statusMessage.textContent = error.message || 'An error occurred during upload.';
                }
            } catch (error) {
                statusMessage.textContent = 'Network error: ' + error.message;
            }
        }
    });

    let addModePlaylist = null; // Tracks which playlist is in add mode

    function renderTree(tree, parent) {
        // Sort: folders first, then files (alphabetically within each group)
        tree.sort((a, b) => {
            if (a.type === b.type) {
                return a.name.localeCompare(b.name);
            }
            return a.type === 'folder' ? -1 : 1;
        });

        tree.forEach(item => {
            const el = document.createElement('div');
            el.style.marginLeft = '20px';
            if (item.type === 'folder') {
                // Collapsible folder
                const folderHeader = document.createElement('span');
                folderHeader.style.cursor = 'pointer';
                folderHeader.style.userSelect = 'none';
                folderHeader.innerHTML = `<span class="chevron">&#9654;</span> <strong>📁 ${item.name}</strong>`;
                el.appendChild(folderHeader);

                const childrenContainer = document.createElement('div');
                childrenContainer.style.display = 'none';
                el.appendChild(childrenContainer);

                // Helper to collect all songs in a folder recursively
                function collectSongs(items) {
                    let songs = [];
                    for (const it of items) {
                        if (it.type === 'folder') {
                            songs = songs.concat(collectSongs(it.children));
                        } else if (it.type === 'file' && it.name) {
                            songs.push(it.name);
                        }
                    }
                    // Filter out any falsy values just in case
                    return songs.filter(s => typeof s === 'string' && s);
                }

                folderHeader.onclick = (e) => {
                    if (addModePlaylist) {
                        // Add all songs in this folder to the playlist
                        const allSongs = collectSongs(item.children);
                        if (allSongs.length === 0) return;
                        fetch(`/playlists/${encodeURIComponent(addModePlaylist)}/add?token=${getToken()}`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ songs: allSongs }),
                            credentials: "include"
                        }).then(() => {
                            loadPlaylists(addModePlaylist);
                        });
                    } else {
                        // Toggle collapse/expand
                        if (childrenContainer.style.display === 'none') {
                            childrenContainer.style.display = '';
                            folderHeader.querySelector('.chevron').innerHTML = '&#9660;';
                        } else {
                            childrenContainer.style.display = 'none';
                            folderHeader.querySelector('.chevron').innerHTML = '&#9654;';
                        }
                    }
                };

                renderTree(item.children, childrenContainer);
                parent.appendChild(el);
            } else {
                el.innerHTML = `🎵 <span style="cursor:pointer; color:blue; text-decoration:underline">${item.name}</span>`;
                el.querySelector('span').onclick = () => {
                    if (addModePlaylist) {
                        fetch(`/playlists/${encodeURIComponent(addModePlaylist)}/add?token=${getToken()}`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ song: item.name }),
                            credentials: "include"
                        }).then(() => {
                            loadPlaylists();
                        });
                    }
                };
                parent.appendChild(el);
            }
        });
    }

    function loadSongs() {
        fetch(`/songs?token=${getToken()}`, {
            credentials: "include"
        })
            .then(res => res.json())
            .then(tree => {
                const songList = document.getElementById('songList');
                songList.innerHTML = '';
                renderTree(tree, songList);
            });
    }

    function loadPlaylists(openPlaylistName = null) {
        fetch(`/playlists?token=${getToken()}`, { credentials: "include" })
            .then(res => res.json())
            .then(playlists => {
                const section = document.getElementById('playlistsSection');
                section.innerHTML = '<h2>Playlists</h2>';

                // --- Create Playlist UI ---
                const createDiv = document.createElement('div');
                createDiv.style.marginBottom = '16px';

                const createInput = document.createElement('input');
                createInput.type = 'text';
                createInput.placeholder = 'New playlist name';
                createInput.style.marginRight = '8px';

                const createBtn = document.createElement('button');
                createBtn.textContent = 'Create Playlist';
                createBtn.onclick = () => {
                    const name = createInput.value.trim();
                    if (!name) return;
                    fetch(`/playlists/${encodeURIComponent(name)}/create?token=${getToken()}`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({}),
                        credentials: "include"
                    }).then(() => {
                        createInput.value = '';
                        loadPlaylists(name); // Open the new playlist
                    });
                };

                createDiv.appendChild(createInput);
                createDiv.appendChild(createBtn);
                section.appendChild(createDiv);
                // --- End Create Playlist UI ---

                Object.entries(playlists).forEach(([name, songs]) => {
                    // Collapsible playlist container
                    const container = document.createElement('div');
                    container.style.marginBottom = '10px';

                    // Playlist songs list (collapsible)
                    const ul = document.createElement('ul');
                    // Keep expanded if in add mode or if openPlaylistName matches
                    const shouldExpand = addModePlaylist === name || openPlaylistName === name;
                    ul.style.display = shouldExpand ? '' : 'none';

                    // Playlist header with chevron and add mode icon button
                    const header = document.createElement('div');
                    header.style.display = 'flex';
                    header.style.alignItems = 'center';
                    header.style.gap = '8px';

                    // Chevron for collapse/expand
                    const chevronBtn = document.createElement('span');
                    chevronBtn.innerHTML = ul.style.display === 'none' ? '&#9654;' : '&#9660;';
                    chevronBtn.className = 'chevron';
                    chevronBtn.style.cursor = 'pointer';
                    chevronBtn.style.fontSize = '18px';
                    chevronBtn.onclick = (e) => {
                        e.stopPropagation();
                        // Only toggle collapse/expand, do not touch addModePlaylist
                        if (ul.style.display === 'none') {
                            ul.style.display = '';
                            chevronBtn.innerHTML = '&#9660;';
                        } else {
                            ul.style.display = 'none';
                            chevronBtn.innerHTML = '&#9654;';
                        }
                    };

                    const addBtn = document.createElement('button');
                    addBtn.title = 'Enable Add Songs Mode';
                    addBtn.textContent = 'Add Songs';
                    addBtn.className = 'add-icon-btn';
                    addBtn.style.background = addModePlaylist === name ? '#d0ffd0' : '';
                    addBtn.onclick = (e) => {
                        e.stopPropagation();
                        // Only toggle add mode, do NOT change collapse state
                        addModePlaylist = addModePlaylist === name ? null : name;
                        loadPlaylists(openPlaylistName); // Keep current open/collapsed state
                    };

                    // Playlist name
                    const title = document.createElement('h3');
                    title.textContent = name;
                    title.style.display = 'inline';
                    title.style.margin = '0';

                    header.appendChild(chevronBtn);
                    header.appendChild(title);
                    header.appendChild(addBtn);

                    songs.forEach(song => {
                        const li = document.createElement('li');
                        li.textContent = song;

                        const removeBtn = document.createElement('button');
                        removeBtn.textContent = '✖';
                        removeBtn.className = 'remove-tiny-btn';
                        removeBtn.title = 'Remove from playlist';
                        removeBtn.style.visibility = (addModePlaylist === name) ? 'visible' : 'hidden';
                        removeBtn.onclick = () => {
                            fetch(`/playlists/${encodeURIComponent(name)}/remove?token=${getToken()}`, {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ song }),
                                credentials: "include"
                            }).then(() => {
                                loadPlaylists(name);
                            });
                        };
                        li.appendChild(removeBtn);
                        ul.appendChild(li);
                    });

                    // Add song input (optional)
                    const addDiv = document.createElement('div');
                    addDiv.innerHTML = `
                        <input type="text" placeholder="Song filename.mp3" />
                        <button>Add Song</button>
                    `;
                    const input = addDiv.querySelector('input');
                    addDiv.querySelector('button').onclick = () => {
                        if (input.value.trim()) {
                            fetch(`/playlists/${encodeURIComponent(name)}/add?token=${getToken()}`, {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ song: input.value.trim() }),
                                credentials: "include"
                            }).then(() => {
                                loadPlaylists(name);
                            });
                        }
                    };
                    ul.appendChild(addDiv);

                    container.appendChild(header);
                    container.appendChild(ul);
                    section.appendChild(container);
                });
            });
    }

    // Load both sections on page load
    loadSongs();
    loadPlaylists();
});