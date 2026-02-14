/**
 * OVERFRAG Discord Bot v3.0
 * Ponto de entrada - funciona igual ao server.js (com HTTP para Passenger)
 * discord.js v13 (compatível com shared hosting)
 * 
 * Para executar: npm start (na pasta overfrag_bot)
 */

import 'dotenv/config';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ============================================
// LOGGING PARA FICHEIRO (debug no cPanel)
// ============================================
const logFile = path.join(__dirname, 'bot.log');

function log(msg) {
    const timestamp = new Date().toISOString();
    const line = `[${timestamp}] ${msg}\n`;
    console.log(msg);
    try {
        fs.appendFileSync(logFile, line);
    } catch (e) {
        // Ignore
    }
}

function logError(msg, err) {
    const timestamp = new Date().toISOString();
    const line = `[${timestamp}] ERROR: ${msg} - ${err?.message || err}\n`;
    console.error(msg, err);
    try {
        fs.appendFileSync(logFile, line);
    } catch (e) {
        // Ignore
    }
}

// Limpar log anterior
try {
    fs.writeFileSync(logFile, `=== Bot iniciado em ${new Date().toISOString()} ===\n`);
} catch (e) {
    console.error('Erro ao limpar log:', e);
}

log('='.repeat(50));
log('OVERFRAG Discord Bot v3.0');
log('='.repeat(50));

// Verificar token (já carregado por dotenv/config)
log(`Token presente: ${process.env.DISCORD_BOT_TOKEN ? 'SIM' : 'NÃO'}`);
log(`Guild ID: ${process.env.DISCORD_GUILD_ID || 'não definido'}`);

// ============================================
// IMPORTAR MÓDULOS
// ============================================
log('A importar módulos...');
import { CONFIG } from './modules/config.js';
import { createClient, setClient, setConnected, getBotStatus, setPresence, updateOnlineCount, getOnlineCount } from './modules/client.js';
import { handleMemberJoin } from './modules/welcome.js';
import { handleVoiceStateUpdate } from './modules/voice.js';
import { handleInteraction } from './modules/commands.js';
log('Módulos importados com sucesso');

// ============================================
// VARIÁVEIS DO BOT
// ============================================
let client = null;
let isConnected = false;

// ============================================
// FUNÇÕES PRINCIPAIS
// ============================================

/**
 * Iniciar o bot
 */
export async function startBot() {
    log('startBot() chamado');
    log(`CONFIG.TOKEN presente: ${CONFIG.TOKEN ? 'SIM' : 'NÃO'}`);
    
    if (!CONFIG.TOKEN) {
        logError('DISCORD_BOT_TOKEN não definido - bot não vai iniciar');
        return false;
    }
    
    if (client && isConnected) {
        log('Já está conectado');
        return true;
    }
    
    log('A criar cliente Discord...');
    client = createClient();
    setClient(client);
    
    // Event: Ready
    client.on('ready', () => {
        isConnected = true;
        setConnected(true);
        log(`✅ ${client.user.tag} conectado!`);
        log(`Servidores: ${client.guilds.cache.size}`);
        
        // Initial online count update (after 5s to let caches populate)
        setTimeout(() => {
            updateOnlineCount().then(count => {
                log(`👥 Membros online: ${count}`);
            });
        }, 5000);
        
        // Update online count every 5 minutes
        setInterval(() => {
            updateOnlineCount().then(count => {
                log(`👥 Membros online atualizado: ${count}`);
            });
        }, 5 * 60 * 1000);
    });
    
    // Event: Member Join (Welcome)
    client.on('guildMemberAdd', handleMemberJoin);
    
    // Event: Voice State (Join to Create)
    client.on('voiceStateUpdate', handleVoiceStateUpdate);
    
    // Event: Interactions (Comandos)
    client.on('interactionCreate', handleInteraction);
    
    // Event: Errors
    client.on('error', err => {
        logError('Erro do cliente Discord', err);
    });
    
    // Login
    log('A fazer login no Discord...');
    try {
        await client.login(CONFIG.TOKEN);
        log('Login bem sucedido!');
        return true;
    } catch (err) {
        logError('Erro no login', err);
        if (err.code === 'TokenInvalid') {
            logError('Token inválido! Verifica DISCORD_BOT_TOKEN');
        }
        return false;
    }
}

/**
 * Parar o bot
 */
export async function stopBot() {
    if (client) {
        log('Desconectando...');
        await client.destroy();
        client = null;
        isConnected = false;
        setConnected(false);
    }
}

/**
 * Obter canais de um servidor
 */
export async function getChannels(guildId) {
    if (!client || !isConnected) return [];
    
    try {
        const guild = client.guilds.cache.get(guildId);
        if (!guild) return [];
        
        return guild.channels.cache
            .filter(ch => ch.type === 'GUILD_TEXT' || ch.type === 'GUILD_VOICE')
            .map(ch => ({
                id: ch.id,
                name: ch.name,
                type: ch.type === 'GUILD_TEXT' ? 'text' : 'voice'
            }));
    } catch (err) {
        logError('Erro ao obter canais', err);
        return [];
    }
}

/**
 * Enviar embed para um canal
 */
export async function sendEmbed(channelId, embed) {
    if (!client || !isConnected) return false;
    
    try {
        const channel = client.channels.cache.get(channelId);
        if (!channel) return false;
        
        await channel.send({ embeds: [embed] });
        return true;
    } catch (err) {
        logError('Erro ao enviar embed', err);
        return false;
    }
}

// Re-exportar funções úteis
export { getBotStatus, getOnlineCount } from './modules/client.js';
export { fetchFaceitStats, buildFaceitEmbed } from './modules/faceit.js';

// ============================================
// SERVIDOR HTTP PARA PASSENGER (cPanel)
// O Passenger precisa de uma app HTTP para saber que está a correr
// ============================================
const PORT = process.env.PORT || 3000;

const server = http.createServer((req, res) => {
    log(`HTTP Request: ${req.method} ${req.url}`);
    
    // Health check endpoint
    if (req.url === '/health' || req.url === '/') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
            status: 'ok',
            bot: isConnected ? 'online' : 'offline',
            uptime: process.uptime(),
            timestamp: new Date().toISOString()
        }));
        return;
    }
    
    // Status do bot
    if (req.url === '/status') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(getBotStatus()));
        return;
    }
    
    // Online member count endpoint
    if (req.url === '/online-count') {
        res.writeHead(200, { 
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*'
        });
        res.end(JSON.stringify({ count: getOnlineCount() }));
        return;
    }
    
    // CHECK - Diagnóstico completo (overfrag.pt/bot/check)
    if (req.url === '/check') {
        const now = new Date().toISOString();
        
        // Ler bot.log se existir
        let logContent = 'Log não disponível';
        try {
            if (fs.existsSync(logFile)) {
                logContent = fs.readFileSync(logFile, 'utf8');
                // Últimas 50 linhas
                const lines = logContent.split('\n');
                logContent = lines.slice(-50).join('\n');
            }
        } catch (e) {
            logContent = 'Erro ao ler log: ' + e.message;
        }
        
        const html = `<!DOCTYPE html>
<html>
<head>
    <title>OVERFRAG Bot - Check</title>
    <meta charset="utf-8">
    <style>
        body { font-family: Arial, sans-serif; max-width: 900px; margin: 50px auto; padding: 20px; background: #1a1a2e; color: #eee; }
        h1 { color: #00d4ff; }
        .status { background: #16213e; padding: 20px; border-radius: 10px; margin: 20px 0; }
        .ok { color: #00ff88; }
        .warn { color: #ffaa00; }
        .error { color: #ff4444; }
        pre { background: #0f0f23; padding: 15px; border-radius: 5px; overflow-x: auto; font-size: 12px; max-height: 400px; overflow-y: auto; }
        .refresh { background: #00d4ff; color: #000; padding: 10px 20px; border: none; border-radius: 5px; cursor: pointer; font-size: 16px; }
    </style>
</head>
<body>
    <h1>🤖 OVERFRAG Bot - Diagnóstico</h1>
    <button class="refresh" onclick="location.reload()">🔄 Atualizar</button>
    
    <div class="status">
        <h2>Status</h2>
        <p class="ok">✅ HTTP Server: A correr</p>
        <p class="${isConnected ? 'ok' : 'error'}">
            ${isConnected ? '✅' : '❌'} Discord Bot: ${isConnected ? 'ONLINE' : 'OFFLINE'}
        </p>
        <p>Node.js: ${process.version}</p>
        <p>Uptime: ${Math.floor(process.uptime())} segundos</p>
        <p>Timestamp: ${now}</p>
    </div>
    
    <div class="status">
        <h2>Variáveis</h2>
        <p class="${process.env.DISCORD_BOT_TOKEN ? 'ok' : 'error'}">
            DISCORD_BOT_TOKEN: ${process.env.DISCORD_BOT_TOKEN ? '✅ Presente' : '❌ NÃO DEFINIDO'}
        </p>
        <p>DISCORD_GUILD_ID: ${process.env.DISCORD_GUILD_ID || 'não definido'}</p>
        <p>PORT: ${PORT}</p>
    </div>
    
    <div class="status">
        <h2>Bot Log (últimas 50 linhas)</h2>
        <pre>${logContent.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</pre>
    </div>
</body>
</html>`;
        
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(html);
        return;
    }
    
    res.writeHead(404);
    res.end('Not Found');
});

server.listen(PORT, () => {
    log(`🚀 HTTP Server running on port ${PORT} (for Passenger)`);
});

// ============================================
// AUTO-START BOT
// ============================================
if (!process.env.DISCORD_BOT_TOKEN && !process.env.DISCORD_TOKEN) {
    logError('DISCORD_BOT_TOKEN não encontrado nas variáveis de ambiente!');
    log('Variáveis disponíveis: ' + Object.keys(process.env).filter(k => k.includes('DISCORD')).join(', '));
    // Não fazer exit - deixar o HTTP server correr para debug
} else {
    log('Token encontrado, a iniciar bot...');
    
    startBot().then(success => {
        if (!success) {
            logError('Bot não conseguiu iniciar');
            // Não fazer exit - deixar o HTTP server correr para debug
        } else {
            log('Bot iniciado com sucesso!');
        }
    }).catch(err => {
        logError('Erro fatal', err);
        // Não fazer exit - deixar o HTTP server correr para debug
    });
}

// Graceful shutdown
process.on('SIGINT', async () => {
    log('SIGINT recebido, a desligar...');
    await stopBot();
    server.close();
    process.exit(0);
});

process.on('SIGTERM', async () => {
    log('SIGTERM recebido, a desligar...');
    await stopBot();
    server.close();
    process.exit(0);
});

process.on('uncaughtException', err => {
    logError('Uncaught Exception', err);
});

process.on('unhandledRejection', (reason, promise) => {
    logError('Unhandled Rejection', reason);
});

export default server;
