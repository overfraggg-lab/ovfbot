/**
 * DIAGNÓSTICO - Verifica se o Passenger está a correr
 * Este ficheiro usa CommonJS para evitar problemas com ES modules
 * 
 * Faz upload deste ficheiro e muda o "Application startup file" para check.js
 */

const http = require('http');
const fs = require('fs');
const path = require('path');

// Escrever log IMEDIATAMENTE
const logFile = path.join(__dirname, 'check.log');

function log(msg) {
    const line = `[${new Date().toISOString()}] ${msg}\n`;
    console.log(msg);
    try {
        fs.appendFileSync(logFile, line);
    } catch (e) {
        console.error('Erro ao escrever log:', e.message);
    }
}

// Primeira coisa: escrever no log
try {
    fs.writeFileSync(logFile, `=== Diagnóstico iniciado em ${new Date().toISOString()} ===\n`);
} catch (e) {
    console.error('ERRO ao criar check.log:', e.message);
}

log('');
log('=====================================');
log('OVERFRAG - DIAGNÓSTICO PASSENGER');
log('=====================================');
log('');

// Info do ambiente
log('NODE_VERSION: ' + process.version);
log('PLATFORM: ' + process.platform);
log('CWD: ' + process.cwd());
log('__dirname: ' + __dirname);
log('');

// Verificar variáveis Discord
log('--- VARIÁVEIS DE AMBIENTE ---');
log('DISCORD_BOT_TOKEN: ' + (process.env.DISCORD_BOT_TOKEN ? 'PRESENTE (' + process.env.DISCORD_BOT_TOKEN.substring(0, 10) + '...)' : 'NÃO DEFINIDO'));
log('DISCORD_GUILD_ID: ' + (process.env.DISCORD_GUILD_ID || 'NÃO DEFINIDO'));
log('');

// Listar ficheiros na pasta
log('--- FICHEIROS NA PASTA ---');
try {
    const files = fs.readdirSync(__dirname);
    files.forEach(f => log('  ' + f));
} catch (e) {
    log('Erro ao listar: ' + e.message);
}
log('');

// Verificar se .env existe
log('--- FICHEIRO .ENV ---');
const envPath = path.join(__dirname, '.env');
if (fs.existsSync(envPath)) {
    log('.env existe: SIM');
    try {
        const envContent = fs.readFileSync(envPath, 'utf8');
        const lines = envContent.split('\n');
        lines.forEach(line => {
            if (line.trim() && !line.startsWith('#')) {
                const key = line.split('=')[0];
                if (key.includes('TOKEN') || key.includes('KEY')) {
                    log('  ' + key + '=****');
                } else {
                    log('  ' + line.trim());
                }
            }
        });
    } catch (e) {
        log('Erro ao ler .env: ' + e.message);
    }
} else {
    log('.env existe: NÃO');
}
log('');

// Verificar package.json
log('--- PACKAGE.JSON ---');
const pkgPath = path.join(__dirname, 'package.json');
if (fs.existsSync(pkgPath)) {
    try {
        const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
        log('name: ' + pkg.name);
        log('type: ' + (pkg.type || 'commonjs (default)'));
        log('main: ' + (pkg.main || 'index.js (default)'));
    } catch (e) {
        log('Erro ao ler package.json: ' + e.message);
    }
} else {
    log('package.json não existe!');
}
log('');

// Criar servidor HTTP
const PORT = process.env.PORT || 3000;

log('--- SERVIDOR HTTP ---');
log('A iniciar servidor na porta ' + PORT + '...');

const server = http.createServer((req, res) => {
    const now = new Date().toISOString();
    log('Request: ' + req.method + ' ' + req.url + ' from ' + req.socket.remoteAddress);
    
    // Resposta HTML bonita
    const html = `<!DOCTYPE html>
<html>
<head>
    <title>OVERFRAG Bot - Diagnóstico</title>
    <style>
        body { font-family: Arial, sans-serif; max-width: 800px; margin: 50px auto; padding: 20px; background: #1a1a2e; color: #eee; }
        h1 { color: #00d4ff; }
        .status { background: #16213e; padding: 20px; border-radius: 10px; margin: 20px 0; }
        .ok { color: #00ff88; }
        .warn { color: #ffaa00; }
        .error { color: #ff4444; }
        pre { background: #0f0f23; padding: 15px; border-radius: 5px; overflow-x: auto; }
        a { color: #00d4ff; }
    </style>
</head>
<body>
    <h1>🔍 OVERFRAG Bot - Diagnóstico</h1>
    
    <div class="status">
        <h2>Status do Servidor</h2>
        <p class="ok">✅ HTTP Server está a correr!</p>
        <p>Timestamp: ${now}</p>
        <p>Node.js: ${process.version}</p>
        <p>Uptime: ${Math.floor(process.uptime())} segundos</p>
    </div>
    
    <div class="status">
        <h2>Variáveis Discord</h2>
        <p class="${process.env.DISCORD_BOT_TOKEN ? 'ok' : 'error'}">
            DISCORD_BOT_TOKEN: ${process.env.DISCORD_BOT_TOKEN ? '✅ Presente' : '❌ Não definido'}
        </p>
        <p class="${process.env.DISCORD_GUILD_ID ? 'ok' : 'warn'}">
            DISCORD_GUILD_ID: ${process.env.DISCORD_GUILD_ID || 'Não definido'}
        </p>
    </div>
    
    <div class="status">
        <h2>Próximos Passos</h2>
        <ol>
            <li>Se vês esta página, o Passenger está a funcionar ✅</li>
            <li>Verifica se DISCORD_BOT_TOKEN está nas variáveis de ambiente do cPanel</li>
            <li>Muda o "Application startup file" de volta para <code>index.js</code></li>
            <li>Reinicia a aplicação</li>
        </ol>
    </div>
    
    <div class="status">
        <h2>Log</h2>
        <p><a href="/log">Ver check.log</a> | <a href="/env">Ver variáveis</a></p>
    </div>
</body>
</html>`;

    if (req.url === '/' || req.url === '/health') {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(html);
        return;
    }
    
    if (req.url === '/log') {
        res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
        try {
            const logContent = fs.readFileSync(logFile, 'utf8');
            res.end(logContent);
        } catch (e) {
            res.end('Erro ao ler log: ' + e.message);
        }
        return;
    }
    
    if (req.url === '/env') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        const safeEnv = {};
        Object.keys(process.env).forEach(key => {
            if (key.includes('DISCORD') || key.includes('FACEIT') || key.includes('PORT') || key.includes('NODE')) {
                if (key.includes('TOKEN') || key.includes('KEY')) {
                    safeEnv[key] = '****';
                } else {
                    safeEnv[key] = process.env[key];
                }
            }
        });
        res.end(JSON.stringify(safeEnv, null, 2));
        return;
    }
    
    if (req.url === '/status') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
            status: 'ok',
            passenger: 'running',
            node: process.version,
            uptime: process.uptime(),
            discord_token: process.env.DISCORD_BOT_TOKEN ? 'present' : 'missing',
            timestamp: now
        }));
        return;
    }
    
    res.writeHead(404);
    res.end('Not Found');
});

server.listen(PORT, () => {
    log('✅ Servidor HTTP iniciado na porta ' + PORT);
    log('');
    log('Acede à URL da aplicação no cPanel para testar');
    log('');
});

server.on('error', (err) => {
    log('❌ Erro no servidor: ' + err.message);
});

log('Script de diagnóstico pronto.');
log('');
