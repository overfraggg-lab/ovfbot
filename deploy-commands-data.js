/**
 * Slash command definitions shared between deploy-commands.js and app.js
 */
module.exports = [
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
