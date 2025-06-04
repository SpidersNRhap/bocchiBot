const crypto = require('crypto');
require('dotenv').config({ path: '../../.env' }); 

const SECRET = process.env.UPLOADER_SECRET;

function generateAccessToken(expiresInSeconds = 600) {
    const expires = Math.floor(Date.now() / 1000) + expiresInSeconds;
    const payload = `${expires}`;
    const hmac = crypto.createHmac('sha256', SECRET).update(payload).digest('hex');
    const token = Buffer.from(`${expires}|${hmac}`).toString('base64url');
    return token;
}

function verifyAccessToken(token) {
    try {
        const decoded = Buffer.from(token, 'base64url').toString();
        const [expires, hmac] = decoded.split('|');
        const payload = `${expires}`;
        const expectedHmac = crypto.createHmac('sha256', SECRET).update(payload).digest('hex');
        if (hmac !== expectedHmac) return false;
        if (parseInt(expires) < Math.floor(Date.now() / 1000)) return false;
        return true;
    } catch {
        return false;
    }
}
if (require.main === module) {
    // Print the token if run directly
    console.log(generateAccessToken());
}


module.exports = { generateAccessToken, verifyAccessToken };