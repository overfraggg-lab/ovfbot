/**
 * OVERFRAG Discord Bot - Starter
 * Corre o bot como processo separado do servidor
 * 
 * Para iniciar: node overfrag_bot/start.js
 */

import 'dotenv/config';
import { startBot, stopBot } from './index.js';

console.log('='.repeat(50));
console.log('OVERFRAG Discord Bot - Standalone Mode');
console.log('='.repeat(50));

// Verificar token
if (!process.env.DISCORD_BOT_TOKEN && !process.env.DISCORD_TOKEN) {
    console.error('❌ DISCORD_BOT_TOKEN não encontrado no .env');
    console.log('Adiciona DISCORD_BOT_TOKEN=... ao ficheiro private/.env');
    process.exit(1);
}

// Iniciar bot
try {
    await startBot();
    console.log('✅ Bot iniciado com sucesso!');
} catch (err) {
    console.error('❌ Erro ao iniciar bot:', err.message);
    process.exit(1);
}

// Graceful shutdown
process.on('SIGINT', async () => {
    console.log('\n🛑 A desligar bot...');
    await stopBot();
    process.exit(0);
});

process.on('SIGTERM', async () => {
    console.log('\n🛑 A desligar bot...');
    await stopBot();
    process.exit(0);
});
