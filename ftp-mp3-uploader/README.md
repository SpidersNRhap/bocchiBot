# FTP MP3 Uploader

This project sets up an FTP server that allows users to upload MP3 files to a specified "songs" directory. Users can also create folders within that directory to organize their uploads.

## Project Structure

```
ftp-mp3-uploader
├── src
│   ├── server.js          # Entry point of the FTP server
│   ├── ftp
│   │   └── ftpClient.js   # Functions for connecting to the FTP server and uploading files
│   ├── public
│   │   ├── index.html     # HTML structure for the web interface
│   │   ├── styles.css     # Styles for the web interface
│   │   └── upload.js      # JavaScript logic for handling file uploads
│   └── songs              # Directory for storing uploaded MP3 files
├── package.json           # Configuration file for npm
└── README.md              # Documentation for the project
```

## Setup Instructions

1. **Clone the repository:**
   ```
   git clone <repository-url>
   cd ftp-mp3-uploader
   ```

2. **Install dependencies:**
   ```
   npm install
   ```

3. **Run the server:**
   ```
   node src/server.js
   ```

4. **Access the web interface:**
   Open your web browser and navigate to `http://localhost:300`.

## Usage Guidelines

- Use the input field to specify a folder name (optional).
- Select one or more MP3 files to upload.
- Click the "Upload" button to send the files to the server.
- The uploaded files will be stored in the "songs" directory, organized by the specified folder name.

## Notes

- Ensure that the "songs" directory exists or will be created automatically by the server.
- The server listens on port 300, so make sure that this port is available on your machine.