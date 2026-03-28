const http = require('http');
const fs = require('fs');
const path = require('path');

const port = 8098;

const mimeTypes = {
    '.html': 'text/html',
    '.js': 'text/javascript',
    '.css': 'text/css',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpg',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
    '.wav': 'audio/wav',
    '.mp4': 'video/mp4',
    '.woff': 'application/font-woff',
    '.ttf': 'application/font-ttf',
    '.eot': 'application/vnd.ms-fontobject',
    '.otf': 'application/font-otf',
    '.wasm': 'application/wasm',
    '.gltf': 'model/gltf+json',
    '.glb': 'model/gltf-binary',
    '.bin': 'application/octet-stream'
};

http.createServer((request, response) => {
    console.log('request ', request.url);

    let filePath = path.join(__dirname, request.url === '/' ? 'index.html' : request.url);

    const extname = String(path.extname(filePath)).toLowerCase();
    const contentType = mimeTypes[extname] || 'application/octet-stream';

    fs.readFile(filePath, (error, content) => {
        if (error) {
            if (error.code == 'ENOENT') {
                fs.readFile(path.join(__dirname, '404.html'), (error, content) => {
                    response.writeHead(404, { 'Content-Type': 'text/html' });
                    response.end(content);
                });
            } else {
                response.writeHead(500);
                response.end('Sorry, check with the site admin for error: ' + error.code + ' ..\n');
            }
        } else {
            response.writeHead(200, { 'Content-Type': contentType });
            response.end(content);
        }
    });

}).listen(port);
console.log(`Server running at http://127.0.0.1:${port}/`);
