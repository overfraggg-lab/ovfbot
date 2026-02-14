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
const GUILD_ID = process.env.DISCORD_GUILD_ID || '1260254650964119716';

if (!TOKEN) {
    console.error('❌ DISCORD_BOT_TOKEN não definido!');
    process.exit(1);
}

// Definição dos comandos
const commands = [
    {
        name: 'faceit',
        description: 'Mostra as estatísticas FACEIT de um jogador',
        options: [
            {
                name: 'nickname',
                description: 'Nickname do jogador na FACEIT',
                type: 3, // STRING
                required: true
            }
        ]
    },
    {
        name: 'ping',
        description: 'Verifica se o bot está online'
    },
    {
        name: 'info',
        description: 'Informação sobre o bot OVERFRAG'
    },
    {
        name: 'site',
        description: 'Link para o site OVERFRAG'
    },
    {
        name: 'clear',
        description: 'Apagar mensagens de um canal (requer permissão)',
        options: [
            {
                name: 'quantidade',
                description: 'Número de mensagens a apagar (1-1000) ou "all" para apagar todas',
                type: 3, // STRING
                required: true
            }
        ]
    },
    {
        name: 'suggest',
        description: 'Enviar uma sugestão para o servidor',
        options: [
            {
                name: 'suggestion',
                description: 'A tua sugestão',
                type: 3, // STRING
                required: true
            }
        ]
    },
    // Music commands
    {
        name: 'play',
        description: 'Tocar uma música no canal de voz',
        options: [
            {
                name: 'query',
                description: 'Nome da música ou URL do YouTube',
                type: 3,
                required: true
            }
        ]
    },
    {
        name: 'skip',
        description: 'Saltar a música atual'
    },
    {
        name: 'stop',
        description: 'Parar a música e limpar a fila'
    },
    {
        name: 'pause',
        description: 'Pausar a música'
    },
    {
        name: 'resume',
        description: 'Retomar a música pausada'
    },
    {
        name: 'queue',
        description: 'Ver a fila de músicas'
    },
    {
        name: 'np',
        description: 'Ver a música que está a tocar'
    },
    // Giveaway commands
    {
        name: 'giveaway',
        description: 'Sistema de giveaways',
        options: [
            {
                name: 'create',
                description: 'Criar um giveaway',
                type: 1, // SUB_COMMAND
                options: [
                    {
                        name: 'prize',
                        description: 'Prémio do giveaway',
                        type: 3,
                        required: true
                    },
                    {
                        name: 'duration',
                        description: 'Duração (ex: 30m, 1h, 2h30m, 1d)',
                        type: 3,
                        required: true
                    },
                    {
                        name: 'winners',
                        description: 'Número de vencedores (default: 1)',
                        type: 4, // INTEGER
                        required: false
                    },
                    {
                        name: 'channel',
                        description: 'Canal para o giveaway (default: canal atual)',
                        type: 7, // CHANNEL
                        required: false
                    }
                ]
            },
            {
                name: 'end',
                description: 'Terminar um giveaway',
                type: 1,
                options: [
                    {
                        name: 'message_id',
                        description: 'ID da mensagem do giveaway',
                        type: 3,
                        required: true
                    }
                ]
            },
            {
                name: 'reroll',
                description: 'Re-sortear vencedores de um giveaway',
                type: 1,
                options: [
                    {
                        name: 'message_id',
                        description: 'ID da mensagem do giveaway',
                        type: 3,
                        required: true
                    }
                ]
            }
        ]
    }
];

const rest = new REST({ version: '9' }).setToken(TOKEN);

(async () => {
    try {
        console.log('🔄 A registar comandos slash...');
        console.log(`   Client ID: ${CLIENT_ID}`);
        console.log(`   Guild ID: ${GUILD_ID}`);
        console.log(`   Comandos: ${commands.map(c => c.name).join(', ')}`);

        // Registar comandos no servidor específico (mais rápido para teste)
        await rest.put(
            Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID),
            { body: commands }
        );

        console.log('✅ Comandos registados com sucesso!');
        console.log('');
        console.log('Comandos disponíveis:');
        commands.forEach(cmd => {
            console.log(`  /${cmd.name} - ${cmd.description}`);
        });

    } catch (error) {
        console.error('❌ Erro ao registar comandos:', error);
    }
})();
