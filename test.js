/**
 * TESTE SIMPLES - Só HTTP, sem Discord
 * Muda o startup file para test.js e reinicia
 */

const http = require('http');
const fs = require('fs');
const path = require('path');

const logFile = path.join(__dirname, 'test.log');

// Escrever log imediatamente
fs.writeFileSync(logFile, `TESTE iniciado: ${new Date().toISOString()}\n`);

const PORT = process.env.PORT || 3000;

const server = http.createServer((req, res) => {
    const msg = `Pedido recebido: ${req.url} às ${new Date().toISOString()}\n`;
    fs.appendFileSync(logFile, msg);
    
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(`
<!DOCTYPE html>
<html>
<head><title>OVERFRAG Bot - Teste</title></head>
<body style="background:#1a1a2e;color:#eee;font-family:Arial;padding:50px;">
    <h1 style="color:#00ff88;">✅ PASSENGER FUNCIONA!</h1>
    <p>Node.js: ${process.version}</p>
    <p>Timestamp: ${new Date().toISOString()}</p>
    <p>PORT: ${PORT}</p>
    <h2>Variáveis Discord:</h2>
    <ul>
        <li>DISCORD_BOT_TOKEN: ${process.env.DISCORD_BOT_TOKEN ? '✅ Presente' : '❌ Não definido'}</li>
        <li>DISCORD_GUILD_ID: ${process.env.DISCORD_GUILD_ID || 'não definido'}</li>
    </ul>
    <p><a href="/check" style="color:#00d4ff;">Ir para /check</a></p>
</body>
</html>
    `);
});

server.listen(PORT, () => {
    fs.appendFileSync(logFile, `Servidor na porta ${PORT}\n`);
});

server.on('error', (err) => {
    fs.appendFileSync(logFile, `ERRO: ${err.message}\n`);
});
