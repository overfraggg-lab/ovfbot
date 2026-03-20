/**
 * Deploy Slash Commands to Discord
 * Executa uma vez para registar os comandos
 * 
 * Uso: node deploy-commands.js
 */

require('dotenv').config();
const { REST } = require('@discordjs/rest');
const { Routes } = require('discord-api-types/v9');

const TOKEN = process.env.DISCORD_BOT_TOKEN || process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.DISCORD_CLIENT_ID || '1467003985100538061';
// GUILD_ID only used when --guild flag is passed (faster for testing)
const GUILD_ID = process.env.DISCORD_GUILD_ID || '1260254650964119716';

if (!TOKEN) {
    console.error('❌ DISCORD_BOT_TOKEN não definido!');
    process.exit(1);
}

// Definição dos comandos (módulo partilhado com app.js)
const commands = require('./deploy-commands-data.cjs');

const rest = new REST({ version: '9' }).setToken(TOKEN);

(async () => {
    try {
        const useGuild = process.argv.includes('--guild');
        
        console.log('🔄 A registar comandos slash...');
        console.log(`   Client ID: ${CLIENT_ID}`);
        console.log(`   Modo: ${useGuild ? `Guild (${GUILD_ID})` : 'GLOBAL (todos os servidores)'}`);
        console.log(`   Comandos: ${commands.map(c => c.name).join(', ')}`);

        if (useGuild) {
            // Guild-specific (instantâneo, bom para teste)
            await rest.put(
                Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID),
                { body: commands }
            );
        } else {
            // Global (pode demorar até 1h a propagar)
            await rest.put(
                Routes.applicationCommands(CLIENT_ID),
                { body: commands }
            );
        }

        console.log('✅ Comandos registados com sucesso!');
        if (!useGuild) {
            console.log('⏳ Comandos globais podem demorar até 1 hora a aparecer em todos os servidores.');
        }
        console.log('');
        console.log('Comandos disponíveis:');
        commands.forEach(cmd => {
            console.log(`  /${cmd.name} - ${cmd.description}`);
        });

    } catch (error) {
        console.error('❌ Erro ao registar comandos:', error);
    }
})();
