/**
 * OVERFRAG Discord Bot v3.0 - CommonJS version for cPanel Passenger
 * Este ficheiro é o entry point para o Passenger
 */

const http = require('http');
const dotenv = require('dotenv');
const path = require('path');
const fs = require('fs');
const state = require('./state.cjs');
const fetch = require('node-fetch');
const { Client, Intents, MessageEmbed, MessageActionRow, MessageButton, MessageSelectMenu } = require('discord.js');
const { joinVoiceChannel, createAudioPlayer, createAudioResource, AudioPlayerStatus, VoiceConnectionStatus, entersState, getVoiceConnection } = require('@discordjs/voice');
const play = require('play-dl');

// New modules
const cache = require('./modules/cache.cjs');
const loggerModule = require('./modules/logger.cjs');
const rateLimiter = require('./modules/rateLimiter.cjs');
const crons = require('./modules/crons.cjs');

// ============================================
// LOGGING (async via pino with fallback)
// ============================================
const logger = loggerModule.init();
const logFile = loggerModule.LOG_FILE;

function log(msg) {
    logger.info(msg);
}

function logError(msg, err) {
    logger.error({ err: err?.message || err }, msg);
}

log('Bot a iniciar (CommonJS version)...');

// ============================================
// CARREGAR AMBIENTE
// ============================================
// Tentar carregar .env
const envPath = path.join(__dirname, '.env');
if (fs.existsSync(envPath)) {
    dotenv.config({ path: envPath });
    log(`.env carregado de: ${envPath}`);
} else {
    log('.env não encontrado, usando variáveis de ambiente do sistema');
    dotenv.config();
}

// ============================================
// CONFIGURAÇÃO
// ============================================
const CONFIG = {
    TOKEN: process.env.DISCORD_BOT_TOKEN || process.env.DISCORD_TOKEN,
    GUILD_ID: process.env.DISCORD_GUILD_ID || '',
    CLIENT_ID: process.env.DISCORD_CLIENT_ID || '1467003985100538061',
    CHANNELS: {
        WELCOME: process.env.DISCORD_CHANNEL_WELCOME,
        NEWS: process.env.DISCORD_CHANNEL_NEWS,
        JOIN_TO_CREATE: process.env.DISCORD_CHANNEL_JOIN_TO_CREATE
    }
};

// Helper: get main OVERFRAG guild (for admin API and admin-only features)
function getMainGuild() {
    if (CONFIG.GUILD_ID) {
        const configuredGuild = client.guilds?.cache.get(CONFIG.GUILD_ID);
        if (configuredGuild) return configuredGuild;
    }
    return client.guilds?.cache.first() || null;
}

// Helper: get any guild by ID
function getGuildById(id) {
    return client.guilds?.cache.get(id) || null;
}

log(`Token presente: ${CONFIG.TOKEN ? 'SIM' : 'NÃO'}`);
log(`Guild ID: ${CONFIG.GUILD_ID || 'não definido'}`);

if (!CONFIG.TOKEN) {
    logError('DISCORD_BOT_TOKEN não definido!');
    log('Variáveis disponíveis: ' + Object.keys(process.env).filter(k => k.includes('DISCORD')).join(', '));
    // NÃO fazer exit - HTTP server vai correr para mostrar erro no /check
}

// ============================================
// CONFIGURABLE STATE (in-memory, updated via API)
// ============================================
let autoroleConfig = {
    enabled: false,
    roles: [],
    require_message: false,
    delay_seconds: 0
};

const SOCIALS = {
    SITE: 'https://overfrag.pt',
    INSTAGRAM: 'https://www.instagram.com/overfrag.pt/',
    TWITTER: 'https://x.com/OVERFRAGG',
    YOUTUBE: 'https://www.youtube.com/@OVERFRAGG',
    TIKTOK: 'https://www.tiktok.com/@overfraggg',
    FACEIT: 'https://www.faceit.com/pt/hub/f2e48fd3-4a12-4b5a-b498-0612a082bf78/OVERFRAG%20CS2%20Hub',
};

let welcomeConfig = {
    enabled: false,
    channel_id: CONFIG.CHANNELS.WELCOME || '',
    mention_user: true,
    color: '#FF5500',
    title: 'Bem-vindo à OVERFRAG!',
    description: 'Olá {user}! Bem-vindo ao servidor da OVERFRAG, a casa do CS2 português!',
    show_thumbnail: true,
    show_banner: true,
    banner_url: '',
    footer_text: 'OVERFRAG - A tua fonte de CS2',
    blocks: [
        { title: '🏆 CS2 Português', value: 'A maior comunidade de CS2 em Portugal\n➜ {channel:noticias}', inline: true },
        { title: '🌐 Redes Sociais', value: '[Site]({social:site}) · [Instagram]({social:instagram}) · [X/Twitter]({social:twitter})\n[YouTube]({social:youtube}) · [TikTok]({social:tiktok})', inline: true },
        { title: '🔥 Jogar com Amigos', value: 'Junta-te ao nosso hub FACEIT!\n➜ {channel:faceit_club}', inline: true },
        { title: '🎫 Precisas de ajuda?', value: 'Caso tenhas alguma dúvida ou problema, abre um\n➜ {channel:ticket}', inline: true },
    ],
    channels: {
        noticias: '',
        faceit_club: '',
        ticket: '',
    },
    socials: {
        site: SOCIALS.SITE,
        instagram: SOCIALS.INSTAGRAM,
        twitter: SOCIALS.TWITTER,
        youtube: SOCIALS.YOUTUBE,
        tiktok: SOCIALS.TIKTOK,
        faceit: SOCIALS.FACEIT,
    },
};

let suggestionConfig = {
    enabled: true,
    channel_id: '',
    create_thread: true
};

let scheduledMessages = [];

let ticketConfig = {
    enabled: true,
    channel_id: '',
    category_id: '',
    log_channel_id: '',
    categories: [
        { id: 'noticias', name: 'Notícias', emoji: '📰', description: 'Sugestões ou correções de notícias' },
        { id: 'equipas', name: 'Equipas', emoji: '🛡️', description: 'Assuntos relacionados com equipas' },
        { id: 'jogadores', name: 'Jogadores', emoji: '🎮', description: 'Perfis de jogadores e reclamações' },
        { id: 'torneios', name: 'Torneios', emoji: '🏆', description: 'Torneios e competições' },
        { id: 'parcerias', name: 'Parcerias', emoji: '🤝', description: 'Propostas de parceria' },
        { id: 'outros', name: 'Outros', emoji: '📋', description: 'Outros assuntos' }
    ],
    embed: {
        title: '🎫 Sistema de Tickets',
        description: 'Seleciona a categoria do teu ticket no menu abaixo.\nA nossa equipa irá responder o mais rápido possível.',
        color: '#5865F2'
    }
};
let leaveConfig = {
    enabled: false,
    channel_id: '',
    message: 'saiu do servidor.',
    show_member_count: true
};

let generalConfig = {
    language: 'pt-PT',
    timezone: 'Europe/Lisbon',
    embed_color: '#5865f2',
    modules: {
        welcome: true,
        leave: true,
        autoroles: true,
        suggestions: true,
    }
};

let teamFeedConfig = {
    enabled: false,
    team_name: '',
    upcoming_channel_id: '',
    results_channel_id: '',
    live_channel_id: '',
    news_channel_id: '',
    send_upcoming: true,
    send_results: true,
    send_live: true,
    send_match_stats: true,
    send_news: false,
    stats_channel_id: '',
};

let serverStatsConfig = {
    enabled: false,
    category_id: '',
    channels: {
        members: { enabled: true, name: '👥 Membros: {count}' },
        online: { enabled: false, name: '🟢 Online: {count}' },
        channels: { enabled: false, name: '📁 Canais: {count}' },
        roles: { enabled: false, name: '🎭 Roles: {count}' },
        boosts: { enabled: false, name: '🚀 Boosts: {count}' }
    }
};

let guildScopedConfig = {
    welcome: {},
    autorole: {},
    suggestions: {},
    leave: {},
    general: {},
    teamFeed: {},
    serverStats: {},
};

// Track suggestion votes: { messageId: { up: Set<userId>, down: Set<userId> } }
const suggestionVotes = new Map();

// Track server stats voice channels so we can update them
const statsChannelIds = new Map(); // key -> channelId

// Anti-spam: track links per user { `userId:link` -> { channels: Set, timestamp } }
const linkTracker = new Map();

// Music queue per guild
const musicQueues = new Map(); // guildId -> { songs: [], player, connection, volume, textChannel, playing }

// Giveaway storage
let activeGiveaways = [];
let giveawayTimers = new Map();

// Members pending autorole (if require_message is enabled)
const pendingAutorole = new Map(); // memberId -> { roles, timestamp }

// Load config from file if exists
const configFilePath = path.join(__dirname, 'bot_config.json');
function loadConfig() {
    try {
        if (fs.existsSync(configFilePath)) {
            const data = JSON.parse(fs.readFileSync(configFilePath, 'utf8'));
            if (data.welcome) welcomeConfig = { ...welcomeConfig, ...data.welcome };
            if (data.autorole) autoroleConfig = data.autorole;
            if (data.suggestions) suggestionConfig = data.suggestions;
            if (data.scheduled) scheduledMessages = data.scheduled;
            if (data.tickets) ticketConfig = { ...ticketConfig, ...data.tickets };
            if (data.leave) leaveConfig = { ...leaveConfig, ...data.leave };
            if (data.general) generalConfig = { ...generalConfig, ...data.general };
            if (data.teamFeed) teamFeedConfig = { ...teamFeedConfig, ...data.teamFeed };
            if (data.serverStats) serverStatsConfig = { ...serverStatsConfig, ...data.serverStats };
            if (data.giveaways) activeGiveaways = data.giveaways;
            if (data.guildScoped) guildScopedConfig = {
                welcome: data.guildScoped.welcome || {},
                autorole: data.guildScoped.autorole || {},
                suggestions: data.guildScoped.suggestions || {},
                leave: data.guildScoped.leave || {},
                general: data.guildScoped.general || {},
                teamFeed: data.guildScoped.teamFeed || {},
                serverStats: data.guildScoped.serverStats || {},
            };
            log('Config carregada de bot_config.json');
        }
    } catch (e) { logError('Erro ao carregar config', e); }
}
function saveConfig() {
    try {
        // write config file asynchronously (non-blocking)
        fs.promises.writeFile(configFilePath, JSON.stringify({
            welcome: welcomeConfig,
            autorole: autoroleConfig,
            suggestions: suggestionConfig,
            scheduled: scheduledMessages,
            tickets: ticketConfig,
            leave: leaveConfig,
            general: generalConfig,
            teamFeed: teamFeedConfig,
            serverStats: serverStatsConfig,
            giveaways: activeGiveaways,
            guildScoped: guildScopedConfig,
        }, null, 2), 'utf8')
        .catch(e => logError('Erro ao guardar config (async)', e));
        // persist to Redis/LevelDB asynchronously
        asyncPersistState();
    } catch (e) { logError('Erro ao guardar config', e); }
}

async function asyncPersistState() {
    try {
        await state.saveState({
            welcome: welcomeConfig,
            autorole: autoroleConfig,
            suggestions: suggestionConfig,
            scheduled: scheduledMessages,
            tickets: ticketConfig,
            leave: leaveConfig,
            general: generalConfig,
            teamFeed: teamFeedConfig,
            serverStats: serverStatsConfig,
            giveaways: activeGiveaways,
            guildScoped: guildScopedConfig,
            musicQueues: Array.from(musicQueues.entries()).map(([guildId, q]) => ({ guildId, songs: q.songs }))
        });
    } catch (e) {
        logError('Falha ao persistir estado (async)', e);
    }
}

function deepClone(obj) {
    return JSON.parse(JSON.stringify(obj));
}

function getScopedConfig(section, guildId, fallback) {
    const scoped = guildScopedConfig?.[section]?.[guildId];
    if (!scoped) return deepClone(fallback);
    return { ...deepClone(fallback), ...deepClone(scoped) };
}

function setScopedConfig(section, guildId, value) {
    if (!guildScopedConfig[section]) guildScopedConfig[section] = {};
    guildScopedConfig[section][guildId] = deepClone(value);
}

function renderWelcomeText(text, member, cfg) {
    if (!text) return '';
    const guildName = member.guild?.name || 'Servidor';
    const userValue = cfg.mention_user ? `<@${member.id}>` : (member.user?.username || 'Membro');
    const channels = cfg.channels || {};
    const socials = cfg.socials || {};

    return String(text)
        .replace(/\{user\}/gi, userValue)
        .replace(/\{server\}/gi, guildName)
        .replace(/\{username\}/gi, member.user?.username || 'Membro')
        .replace(/\{member_count\}/gi, String(member.guild?.memberCount || 0))
        .replace(/\{channel:([a-z0-9_\-]+)\}/gi, (_, key) => channels[key] ? `<#${channels[key]}>` : '#canal')
        .replace(/\{social:([a-z0-9_\-]+)\}/gi, (_, key) => socials[key] || '#');
}
loadConfig();

// Initialize SoundCloud + persistence module
(async () => {
    try {
        // Setup SoundCloud client_id for play-dl
        const scClientID = await play.getFreeClientID();
        await play.setToken({ soundcloud: { client_id: scClientID } });
        log('SoundCloud client_id configurado com sucesso');
    } catch (e) {
        logError('Erro ao obter SoundCloud client_id (música pode não funcionar)', e);
    }

    try {
        await state.init();
        const persisted = await state.loadState();
        if (persisted) {
            if (persisted.welcome) welcomeConfig = { ...welcomeConfig, ...persisted.welcome };
            if (persisted.autorole) autoroleConfig = { ...autoroleConfig, ...persisted.autorole };
            if (persisted.suggestions) suggestionConfig = { ...suggestionConfig, ...persisted.suggestions };
            if (persisted.scheduled) scheduledMessages = persisted.scheduled;
            if (persisted.tickets) ticketConfig = { ...ticketConfig, ...persisted.tickets };
            if (persisted.leave) leaveConfig = { ...leaveConfig, ...persisted.leave };
            if (persisted.general) generalConfig = { ...generalConfig, ...persisted.general };
            if (persisted.teamFeed) teamFeedConfig = { ...teamFeedConfig, ...persisted.teamFeed };
            if (persisted.serverStats) serverStatsConfig = { ...serverStatsConfig, ...persisted.serverStats };
            if (persisted.giveaways) activeGiveaways = persisted.giveaways;
            if (persisted.guildScoped) {
                guildScopedConfig = {
                    welcome: persisted.guildScoped.welcome || guildScopedConfig.welcome || {},
                    autorole: persisted.guildScoped.autorole || guildScopedConfig.autorole || {},
                    suggestions: persisted.guildScoped.suggestions || guildScopedConfig.suggestions || {},
                    leave: persisted.guildScoped.leave || guildScopedConfig.leave || {},
                    general: persisted.guildScoped.general || guildScopedConfig.general || {},
                    teamFeed: persisted.guildScoped.teamFeed || guildScopedConfig.teamFeed || {},
                    serverStats: persisted.guildScoped.serverStats || guildScopedConfig.serverStats || {},
                };
            }
            // restore simple music queues (songs only)
            if (persisted.musicQueues && Array.isArray(persisted.musicQueues)) {
                for (const entry of persisted.musicQueues) {
                    try {
                        const q = { songs: entry.songs || [], player: null, connection: null, volume: 80, textChannel: null, playing: false };
                        musicQueues.set(entry.guildId, q);
                    } catch (e) { /* ignore malformed entries */ }
                }
            }
            log('Estado persistido carregado');
        }
    } catch (e) {
        logError('Erro ao inicializar persistence state', e);
    }

    // Initialize cache module (in-memory, Redis if REDIS_URL set)
    try {
        await cache.init();
        log('Cache module inicializado');
    } catch (e) {
        logError('Erro ao inicializar cache', e);
    }

    // Initialize cron jobs
    try {
        crons.init({
            cache,
            logger: loggerModule,
            persistState: asyncPersistState,
            musicQueues,
        });
        log('Cron jobs inicializados');
    } catch (e) {
        logError('Erro ao inicializar crons', e);
    }
})();

// ============================================
// CLIENTE DISCORD
// ============================================
log('A criar cliente Discord...');

const client = new Client({
    intents: [
        Intents.FLAGS.GUILDS,
        Intents.FLAGS.GUILD_MEMBERS,
        Intents.FLAGS.GUILD_VOICE_STATES,
        Intents.FLAGS.GUILD_MESSAGES,
        Intents.FLAGS.GUILD_MESSAGE_REACTIONS,
        Intents.FLAGS.GUILD_PRESENCES,
        Intents.FLAGS.MESSAGE_CONTENT
    ]
});

// ============================================
// EVENTOS
// ============================================
client.once('ready', async () => {
    log(`✅ ${client.user.tag} conectado!`);
    log(`Servidores: ${client.guilds.cache.size}`);
    
    // Set presence
    client.user.setPresence({
        activities: [{ name: 'overfrag.pt', type: 'WATCHING' }],
        status: 'online'
    });

    // Auto-deploy global slash commands on startup
    try {
        const { REST } = require('@discordjs/rest');
        const { Routes } = require('discord-api-types/v9');
        const rest = new REST({ version: '9' }).setToken(CONFIG.TOKEN);
        const commands = require('./deploy-commands-data.cjs');

        // 1) Register GLOBAL commands (all servers)
        await rest.put(Routes.applicationCommands(client.user.id), { body: commands });
        log(`✅ ${commands.length} comandos globais registados`);

        // 2) Clear OLD guild-specific commands (they override global and block other servers)
        if (CONFIG.GUILD_ID) {
            try {
                await rest.put(Routes.applicationGuildCommands(client.user.id, CONFIG.GUILD_ID), { body: [] });
                log(`✅ Comandos guild-specific limpos do servidor ${CONFIG.GUILD_ID}`);
            } catch (e) {
                logError('Falha ao limpar guild commands (não-fatal)', e);
            }
        }
    } catch (err) {
        logError('Falha ao registar comandos globais (não-fatal)', err);
    }
});

// ============================================
// GUILD JOIN/LEAVE EVENTS
// ============================================
client.on('guildCreate', guild => {
    log(`📥 Bot adicionado ao servidor: ${guild.name} (${guild.id}) - ${guild.memberCount} membros`);
});

client.on('guildDelete', guild => {
    log(`📤 Bot removido do servidor: ${guild.name} (${guild.id})`);
});

client.on('error', err => {
    logError('Erro do cliente Discord', err);
});

client.on('warn', warn => {
    log(`WARN: ${warn}`);
});

// Reconnect handling — auto-reconnect on disconnect
client.on('shardDisconnect', (event, shardId) => {
    log(`Shard ${shardId} desconectado (code: ${event.code}). discord.js vai tentar reconectar...`);
});

client.on('shardReconnecting', (shardId) => {
    log(`Shard ${shardId} a reconectar...`);
});

client.on('shardResume', (shardId, replayedEvents) => {
    log(`Shard ${shardId} reconectado (${replayedEvents} eventos replayed)`);
});

client.on('shardError', (error, shardId) => {
    logError(`Shard ${shardId} erro`, error);
});

// ============================================
// WELCOME MESSAGE + AUTOROLE
// ============================================
client.on('guildMemberAdd', async member => {
    const guildId = member.guild.id;
    const guildAutoroleConfig = getScopedConfig('autorole', guildId, autoroleConfig);
    const guildWelcomeConfig = getScopedConfig('welcome', guildId, welcomeConfig);

    // --- Autorole ---
    if (guildAutoroleConfig.enabled && guildAutoroleConfig.roles.length > 0) {
        const giveRoles = async () => {
            for (const roleInfo of guildAutoroleConfig.roles) {
                try {
                    const role = member.guild.roles.cache.get(roleInfo.id);
                    if (role) {
                        await member.roles.add(role);
                        log(`Autorole @${role.name} dado a ${member.user.tag}`);
                    } else {
                        logError(`Autorole ${roleInfo.id} não encontrado no servidor`);
                    }
                } catch (err) {
                    logError(`Erro ao dar autorole ${roleInfo.id}`, err);
                }
            }
        };

        if (guildAutoroleConfig.require_message) {
            // Store pending - will give roles when they send first message
            pendingAutorole.set(`${guildId}:${member.id}`, {
                roles: guildAutoroleConfig.roles.map(r => r.id),
                timestamp: Date.now()
            });
            log(`Autorole pendente (aguardar msg) para ${member.user.tag}`);
        } else if (guildAutoroleConfig.delay_seconds > 0) {
            setTimeout(giveRoles, guildAutoroleConfig.delay_seconds * 1000);
            log(`Autorole com delay ${guildAutoroleConfig.delay_seconds}s para ${member.user.tag}`);
        } else {
            await giveRoles();
        }
    }

    // --- Welcome Message ---
    if (!guildWelcomeConfig.enabled || !guildWelcomeConfig.channel_id) return;

    try {
        const channel = member.guild.channels.cache.get(guildWelcomeConfig.channel_id);
        if (!channel) return;

        // Assets
        const bannerPath = path.join(__dirname, 'assets', 'banner.jpg');
        const logoPath   = path.join(__dirname, 'assets', 'logo.png');
        const files = [];

        if (fs.existsSync(bannerPath)) files.push({ attachment: bannerPath, name: 'banner.jpg' });
        if (fs.existsSync(logoPath))   files.push({ attachment: logoPath,   name: 'logo.png' });

        const now = new Date();
        const hora = now.toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' });

        const embed = new MessageEmbed()
            .setColor(guildWelcomeConfig.color || '#FF5500')
            .setTitle(renderWelcomeText(guildWelcomeConfig.title || 'Bem-vindo!', member, guildWelcomeConfig))
            .setDescription(renderWelcomeText(guildWelcomeConfig.description || 'Bem-vindo ao servidor!', member, guildWelcomeConfig));

        if (guildWelcomeConfig.show_thumbnail !== false) {
            embed.setThumbnail(member.user.displayAvatarURL({ dynamic: true, size: 256 }));
        }

        const blocks = Array.isArray(guildWelcomeConfig.blocks) ? guildWelcomeConfig.blocks.slice(0, 4) : [];
        if (blocks.length > 0) {
            embed.addFields(
                ...blocks
                    .filter(b => b?.title && b?.value)
                    .map(b => ({
                        name: renderWelcomeText(b.title, member, guildWelcomeConfig),
                        value: renderWelcomeText(b.value, member, guildWelcomeConfig),
                        inline: b.inline !== false,
                    }))
            );
        }

        embed.setFooter({
            text: `${renderWelcomeText(guildWelcomeConfig.footer_text || 'OVERFRAG', member, guildWelcomeConfig)} • Hoje às ${hora}`,
            iconURL: files.some(f => f.name === 'logo.png') ? 'attachment://logo.png' : undefined,
        });

        if (guildWelcomeConfig.show_banner !== false) {
            if (guildWelcomeConfig.banner_url && /^https?:\/\//i.test(guildWelcomeConfig.banner_url)) {
                embed.setImage(guildWelcomeConfig.banner_url);
            } else if (files.some(f => f.name === 'banner.jpg')) {
                embed.setImage('attachment://banner.jpg');
            }
        }

        await channel.send({ embeds: [embed], files });
        log(`Welcome enviado para ${member.user.tag}`);
    } catch (err) {
        logError('Erro ao enviar welcome', err);
    }
});

// ============================================
// LEAVE MESSAGE
// ============================================
client.on('guildMemberRemove', async member => {
    const guildLeaveConfig = getScopedConfig('leave', member.guild.id, leaveConfig);
    if (!guildLeaveConfig.enabled || !guildLeaveConfig.channel_id) return;

    try {
        const channel = member.guild.channels.cache.get(guildLeaveConfig.channel_id);
        if (!channel) return;

        const memberCount = member.guild.memberCount;
        const embed = new MessageEmbed()
            .setColor('#f85149')
            .setAuthor({ name: member.user.tag, iconURL: member.user.displayAvatarURL({ dynamic: true }) })
            .setDescription(`**${member.user.tag}** ${guildLeaveConfig.message || 'saiu do servidor.'}`)
            .setThumbnail(member.user.displayAvatarURL({ dynamic: true, size: 128 }))
            .setFooter({ text: guildLeaveConfig.show_member_count ? `Agora temos ${memberCount} membros` : 'OVERFRAG' })
            .setTimestamp();

        await channel.send({ embeds: [embed] });
        log(`Leave message enviada para ${member.user.tag}`);
    } catch (err) {
        logError('Erro ao enviar leave message', err);
    }

    // Update server stats if enabled
    updateServerStats(member.guild);
});

// Also update stats on member join
client.on('guildMemberAdd', async member => {
    updateServerStats(member.guild);
});

// ============================================
// SERVER STATS (Voice Channel Counters)
// ============================================
async function updateServerStats(guild) {
    if (!serverStatsConfig.enabled || !guild) return;

    try {
        // Fetch all members to ensure cache is populated (requires GUILD_MEMBERS intent)
        await guild.members.fetch();
        
        const memberCount = guild.memberCount;
        
        // Contar online: tentar presences cache primeiro (requer GUILD_PRESENCES intent)
        // Se não tiver presences, usar member.presence como fallback
        let onlineCount = 0;
        if (guild.presences.cache.size > 0) {
            onlineCount = guild.presences.cache.filter(p => p.status !== 'offline').size;
        } else {
            // Fallback: contar membros com presence != offline
            onlineCount = guild.members.cache.filter(m => m.presence && m.presence.status !== 'offline').size;
        }
        const channelCount = guild.channels.cache.size;
        const roleCount = guild.roles.cache.size;
        const boostCount = guild.premiumSubscriptionCount || 0;

        const counters = {
            members: { count: memberCount, config: serverStatsConfig.channels.members },
            online: { count: onlineCount, config: serverStatsConfig.channels.online },
            channels: { count: channelCount, config: serverStatsConfig.channels.channels },
            roles: { count: roleCount, config: serverStatsConfig.channels.roles },
            boosts: { count: boostCount, config: serverStatsConfig.channels.boosts }
        };

        for (const [key, data] of Object.entries(counters)) {
            if (!data.config.enabled) continue;

            const channelName = data.config.name.replace('{count}', data.count.toString());
            const existingId = statsChannelIds.get(key);

            if (existingId) {
                // Update existing channel name
                const ch = guild.channels.cache.get(existingId);
                if (ch && ch.name !== channelName) {
                    try {
                        await ch.setName(channelName);
                    } catch (e) {
                        logError(`Erro ao atualizar stats channel ${key}`, e);
                    }
                }
            } else if (serverStatsConfig.category_id) {
                // Create new voice channel under category
                try {
                    const newCh = await guild.channels.create(channelName, {
                        type: 'GUILD_VOICE',
                        parent: serverStatsConfig.category_id,
                        permissionOverwrites: [{
                            id: guild.id,
                            deny: ['CONNECT']
                        }]
                    });
                    statsChannelIds.set(key, newCh.id);
                    log(`Stats channel created: ${key} -> ${newCh.name}`);
                } catch (e) {
                    logError(`Erro ao criar stats channel ${key}`, e);
                }
            }
        }
    } catch (err) {
        logError('Erro ao atualizar server stats', err);
    }
}

// Update stats every 10 minutes
let statsInterval = null;
client.once('ready', () => {
    const guild = getMainGuild();
    if (guild && serverStatsConfig.enabled) {
        // Find existing stats channels by name pattern
        for (const [key, conf] of Object.entries(serverStatsConfig.channels)) {
            if (!conf.enabled) continue;
            const prefix = conf.name.split('{count}')[0];
            const existing = guild.channels.cache.find(c => c.type === 'GUILD_VOICE' && c.name.startsWith(prefix) && c.parentId === serverStatsConfig.category_id);
            if (existing) {
                statsChannelIds.set(key, existing.id);
                log(`Stats channel found: ${key} -> ${existing.name}`);
            }
        }
        updateServerStats(guild);
    }

    statsInterval = setInterval(() => {
        const g = getMainGuild();
        if (g) updateServerStats(g);
    }, 10 * 60 * 1000); // 10 min
});

// ============================================
// JOIN TO CREATE (Voice Channels)
// ============================================
const tempChannels = new Map();

client.on('voiceStateUpdate', async (oldState, newState) => {
    // User joined Join-to-Create channel
    if (newState.channelId === CONFIG.CHANNELS.JOIN_TO_CREATE && newState.channel) {
        try {
            const member = newState.member;
            const guild = newState.guild;
            
            // Create temp channel
            const tempChannel = await guild.channels.create(`🎮 ${member.displayName}`, {
                type: 'GUILD_VOICE',
                parent: newState.channel.parent,
                permissionOverwrites: [
                    {
                        id: member.id,
                        allow: ['MANAGE_CHANNELS', 'MOVE_MEMBERS']
                    }
                ]
            });
            
            // Move user to new channel
            await member.voice.setChannel(tempChannel);
            tempChannels.set(tempChannel.id, member.id);
            log(`Canal temp criado: ${tempChannel.name} por ${member.user.tag}`);
        } catch (err) {
            logError('Erro ao criar canal temp', err);
        }
    }
    
    // User left a temp channel - delete if empty
    if (oldState.channel && tempChannels.has(oldState.channelId)) {
        if (oldState.channel.members.size === 0) {
            try {
                await oldState.channel.delete();
                tempChannels.delete(oldState.channelId);
                log(`Canal temp apagado: ${oldState.channel.name}`);
            } catch (err) {
                logError('Erro ao apagar canal temp', err);
            }
        }
    }
});

// ============================================
// PENDING AUTOROLE ON FIRST MESSAGE
// ============================================
client.on('messageCreate', async message => {
    if (message.author.bot) return;
    const guildId = message.guild?.id;
    const guildSuggestionConfig = guildId
        ? getScopedConfig('suggestions', guildId, suggestionConfig)
        : suggestionConfig;

    // ---- ANTI-SPAM: detect same link in multiple channels within 1 minute ----
    const urlRegex = /https?:\/\/[^\s]+/gi;
    const links = message.content.match(urlRegex);
    if (links && message.guild && !message.member?.permissions?.has('MANAGE_MESSAGES')) {
        for (const link of links) {
            const key = `${message.author.id}:${link.toLowerCase()}`;
            const existing = linkTracker.get(key);
            const now = Date.now();

            if (existing && now - existing.timestamp < 60000) {
                // Same link within 1 minute
                if (!existing.channels.has(message.channel.id)) {
                    existing.channels.add(message.channel.id);

                    if (existing.channels.size >= 2) {
                        // SPAM detected - timeout 5 minutes
                        try {
                            const member = message.member || await message.guild.members.fetch(message.author.id).catch(() => null);
                            if (member && member.moderatable) {
                                await member.timeout(5 * 60 * 1000, 'Anti-spam: link duplicado em múltiplos canais');
                                await message.delete().catch(() => {});

                                // Notify in the channel
                                const warnEmbed = new MessageEmbed()
                                    .setColor('#f85149')
                                    .setDescription(`⚠️ **${message.author.tag}** foi silenciado por 5 minutos por spam de links em múltiplos canais.`)
                                    .setTimestamp();
                                await message.channel.send({ embeds: [warnEmbed] }).catch(() => {});

                                log(`Anti-spam: ${message.author.tag} timeout 5min (link em ${existing.channels.size} canais)`);
                                linkTracker.delete(key);
                                return;
                            }
                        } catch (err) {
                            logError('Erro no anti-spam timeout', err);
                        }
                    }
                }
            } else {
                linkTracker.set(key, { channels: new Set([message.channel.id]), timestamp: now });
                // Cleanup old entries every 100 entries
                if (linkTracker.size > 500) {
                    for (const [k, v] of linkTracker) {
                        if (now - v.timestamp > 120000) linkTracker.delete(k);
                    }
                }
            }
        }
    }

    // Auto-delete non-bot messages in suggestions channel
    if (guildSuggestionConfig.enabled && guildSuggestionConfig.channel_id && message.channel.id === guildSuggestionConfig.channel_id) {
        try {
            await message.delete();
            log(`Auto-deleted message from ${message.author.tag} in suggestions channel`);
        } catch (err) {
            logError('Erro ao auto-deletar mensagem no canal de sugestões', err);
        }
        return;
    }

    const pendingKey = guildId ? `${guildId}:${message.author.id}` : message.author.id;
    const pending = pendingAutorole.get(pendingKey);
    if (pending) {
        pendingAutorole.delete(pendingKey);
        const member = message.member || await message.guild?.members.fetch(message.author.id).catch(() => null);
        if (member) {
            for (const roleId of pending.roles) {
                try {
                    const role = member.guild.roles.cache.get(roleId);
                    if (role) {
                        await member.roles.add(role);
                        log(`Autorole @${role.name} dado a ${member.user.tag} (após mensagem)`);
                    }
                } catch (err) {
                    logError(`Erro ao dar autorole pendente ${roleId}`, err);
                }
            }
        }
    }
});

// ============================================
// SLASH COMMANDS + BUTTON INTERACTIONS
// ============================================
client.on('interactionCreate', async interaction => {
    // ---- Button Interactions (Suggestion Votes) ----
    if (interaction.isButton() && interaction.customId !== 'ticket_close') {
        const [action, msgId] = interaction.customId.split('_');
        if (action !== 'voteup' && action !== 'votedown') return;

        try {
            const userId = interaction.user.id;
            if (!suggestionVotes.has(msgId)) {
                suggestionVotes.set(msgId, { up: new Set(), down: new Set() });
            }
            const votes = suggestionVotes.get(msgId);

            if (action === 'voteup') {
                if (votes.up.has(userId)) { votes.up.delete(userId); }
                else { votes.up.add(userId); votes.down.delete(userId); }
            } else {
                if (votes.down.has(userId)) { votes.down.delete(userId); }
                else { votes.down.add(userId); votes.up.delete(userId); }
            }

            // Update the message buttons with new counts
            const row = new MessageActionRow().addComponents(
                new MessageButton().setCustomId(`voteup_${msgId}`).setLabel(`✅ ${votes.up.size}`).setStyle('SUCCESS'),
                new MessageButton().setCustomId(`votedown_${msgId}`).setLabel(`❌ ${votes.down.size}`).setStyle('DANGER')
            );

            // Update footer with vote count
            const originalEmbed = interaction.message.embeds[0];
            if (originalEmbed) {
                const newEmbed = new MessageEmbed(originalEmbed);
                newEmbed.setFooter({ text: `OVERFRAG Sugestões • ${votes.up.size + votes.down.size} votos` });
                await interaction.update({ embeds: [newEmbed], components: [row] });
            } else {
                await interaction.update({ components: [row] });
            }
        } catch (err) {
            logError('Erro ao processar voto', err);
            await interaction.reply({ content: '❌ Erro ao processar voto.', ephemeral: true }).catch(() => {});
        }
        return;
    }

    // ---- Select Menu Interactions (Tickets) ----
    if (interaction.isSelectMenu() && interaction.customId === 'ticket_category') {
        try {
            if (!ticketConfig.enabled) {
                return interaction.reply({ content: '❌ O sistema de tickets está desativado.', ephemeral: true });
            }

            await interaction.deferReply({ ephemeral: true });

            const categoryId = interaction.values[0];
            const category = ticketConfig.categories.find(c => c.id === categoryId);
            const categoryName = category ? category.name : categoryId;
            const categoryEmoji = category ? category.emoji : '🎫';

            const guild = interaction.guild;
            const member = interaction.member;

            // Check if user already has an open ticket
            const existingTicket = guild.channels.cache.find(ch =>
                ch.name === `ticket-${member.user.username.toLowerCase().replace(/[^a-z0-9]/g, '')}` &&
                ch.parentId === ticketConfig.category_id
            );
            if (existingTicket) {
                return interaction.editReply(`❌ Já tens um ticket aberto: <#${existingTicket.id}>`);
            }

            // Create ticket channel in the configured category
            const ticketChannel = await guild.channels.create(`ticket-${member.user.username}`, {
                type: 'GUILD_TEXT',
                parent: ticketConfig.category_id || undefined,
                topic: `${categoryEmoji} ${categoryName} - Ticket de ${member.user.tag}`,
                permissionOverwrites: [
                    { id: guild.id, deny: ['VIEW_CHANNEL'] },
                    { id: member.id, allow: ['VIEW_CHANNEL', 'SEND_MESSAGES', 'READ_MESSAGE_HISTORY', 'ATTACH_FILES'] },
                    { id: client.user.id, allow: ['VIEW_CHANNEL', 'SEND_MESSAGES', 'MANAGE_CHANNELS', 'READ_MESSAGE_HISTORY'] }
                ]
            });

            // Send welcome embed in ticket
            const ticketEmbed = new MessageEmbed()
                .setColor(ticketConfig.embed.color || '#5865F2')
                .setTitle(`${categoryEmoji} Ticket - ${categoryName}`)
                .setDescription(`Olá ${member}, obrigado por abrir um ticket!\n\n**Categoria:** ${categoryEmoji} ${categoryName}\n\nDescreve o teu assunto e a nossa equipa irá responder o mais rápido possível.`)
                .setFooter({ text: `OVERFRAG Tickets • ${member.user.tag}` })
                .setTimestamp();

            const closeRow = new MessageActionRow().addComponents(
                new MessageButton().setCustomId('ticket_close').setLabel('🔒 Fechar Ticket').setStyle('DANGER')
            );

            await ticketChannel.send({ embeds: [ticketEmbed], components: [closeRow] });

            // Log
            if (ticketConfig.log_channel_id) {
                const logChannel = guild.channels.cache.get(ticketConfig.log_channel_id);
                if (logChannel) {
                    const logEmbed = new MessageEmbed()
                        .setColor('#3fb950')
                        .setTitle('🎫 Novo Ticket')
                        .addField('Utilizador', `${member.user.tag} (${member.id})`, true)
                        .addField('Categoria', `${categoryEmoji} ${categoryName}`, true)
                        .addField('Canal', `<#${ticketChannel.id}>`, true)
                        .setTimestamp();
                    logChannel.send({ embeds: [logEmbed] }).catch(() => {});
                }
            }

            log(`Ticket criado por ${member.user.tag} - Categoria: ${categoryName} - Canal: #${ticketChannel.name}`);
            await interaction.editReply(`✅ Ticket criado: <#${ticketChannel.id}>`);
        } catch (err) {
            logError('Erro ao criar ticket', err);
            const reply = interaction.deferred ? interaction.editReply : interaction.reply;
            await reply.call(interaction, { content: '❌ Erro ao criar ticket: ' + err.message, ephemeral: true }).catch(() => {});
        }
        return;
    }

    // ---- Button: Close Ticket ----
    if (interaction.isButton() && interaction.customId === 'ticket_close') {
        try {
            await interaction.reply({ content: '🔒 A fechar ticket em 5 segundos...', ephemeral: false });
            
            const channel = interaction.channel;
            const member = interaction.member;
            
            // Log before deleting
            if (ticketConfig.log_channel_id) {
                const guild = interaction.guild;
                const logChannel = guild.channels.cache.get(ticketConfig.log_channel_id);
                if (logChannel) {
                    const logEmbed = new MessageEmbed()
                        .setColor('#f85149')
                        .setTitle('🔒 Ticket Fechado')
                        .addField('Fechado por', `${member.user.tag}`, true)
                        .addField('Canal', `#${channel.name}`, true)
                        .setTimestamp();
                    logChannel.send({ embeds: [logEmbed] }).catch(() => {});
                }
            }

            log(`Ticket fechado por ${member.user.tag}: #${channel.name}`);
            setTimeout(() => channel.delete().catch(() => {}), 5000);
        } catch (err) {
            logError('Erro ao fechar ticket', err);
        }
        return;
    }

    if (!interaction.isCommand()) return;
    
    const { commandName } = interaction;
    
    if (commandName === 'ping') {
        await interaction.reply(`🏓 Pong! Latência: ${client.ws.ping}ms`);
    } else if (commandName === 'info') {
        const embed = new MessageEmbed()
            .setColor('#FF5500')
            .setTitle('OVERFRAG Bot')
            .setDescription('Bot oficial da comunidade OVERFRAG')
            .addFields(
                { name: 'Website', value: '[overfrag.pt](https://overfrag.pt)', inline: true },
                { name: 'Discord.js', value: 'v13', inline: true }
            )
            .setTimestamp();
        await interaction.reply({ embeds: [embed] });
    } else if (commandName === 'clear') {
        // Verificar permissões
        if (!interaction.member.permissions.has('MANAGE_MESSAGES')) {
            return interaction.reply({ content: '❌ Não tens permissão para apagar mensagens.', ephemeral: true });
        }

        const amount = interaction.options.getString('quantidade');

        try {
            await interaction.deferReply({ ephemeral: true });

            if (amount === 'all') {
                // Apagar todas as mensagens (em blocos de 100)
                let totalDeleted = 0;
                let fetched;
                do {
                    fetched = await interaction.channel.messages.fetch({ limit: 100 });
                    // Filtrar mensagens com menos de 14 dias (limite do Discord)
                    const deletable = fetched.filter(m => (Date.now() - m.createdTimestamp) < 14 * 24 * 60 * 60 * 1000);
                    if (deletable.size === 0) break;
                    const deleted = await interaction.channel.bulkDelete(deletable, true);
                    totalDeleted += deleted.size;
                    if (deleted.size < 100) break;
                    // Pequeno delay para evitar rate limits
                    await new Promise(r => setTimeout(r, 1000));
                } while (fetched.size > 0);

                await interaction.editReply(`🗑️ ${totalDeleted} mensagens apagadas.`);
                log(`Clear ALL: ${totalDeleted} mensagens em #${interaction.channel.name} por ${interaction.user.tag}`);
            } else {
                const num = parseInt(amount);
                if (isNaN(num) || num < 1 || num > 1000) {
                    return interaction.editReply('❌ Quantidade inválida. Usa um número entre 1 e 1000, ou "all".');
                }

                let remaining = num;
                let totalDeleted = 0;
                while (remaining > 0) {
                    const toFetch = Math.min(remaining, 100);
                    const fetched = await interaction.channel.messages.fetch({ limit: toFetch });
                    const deletable = fetched.filter(m => (Date.now() - m.createdTimestamp) < 14 * 24 * 60 * 60 * 1000);
                    if (deletable.size === 0) break;
                    const deleted = await interaction.channel.bulkDelete(deletable, true);
                    totalDeleted += deleted.size;
                    remaining -= deleted.size;
                    if (deleted.size < toFetch) break;
                    await new Promise(r => setTimeout(r, 1000));
                }

                await interaction.editReply(`🗑️ ${totalDeleted} mensagens apagadas.`);
                log(`Clear ${num}: ${totalDeleted} mensagens em #${interaction.channel.name} por ${interaction.user.tag}`);
            }
        } catch (err) {
            logError('Erro no /clear', err);
            const reply = interaction.deferred ? interaction.editReply : interaction.reply;
            await reply.call(interaction, { content: '❌ Erro ao apagar mensagens: ' + err.message, ephemeral: true });
        }
    } else if (commandName === 'suggest') {
        if (!interaction.guild?.id) {
            return interaction.reply({ content: '❌ Este comando só pode ser usado dentro de um servidor.', ephemeral: true });
        }
        const guildSuggestionConfig = getScopedConfig('suggestions', interaction.guild.id, suggestionConfig);
        // ---- /suggest command ----
        if (!guildSuggestionConfig.enabled) {
            return interaction.reply({ content: '❌ O sistema de sugestões está desativado.', ephemeral: true });
        }
        if (!guildSuggestionConfig.channel_id) {
            return interaction.reply({ content: '❌ O canal de sugestões não está configurado.', ephemeral: true });
        }

        const suggestionText = interaction.options.getString('suggestion');
        if (!suggestionText || suggestionText.length < 5) {
            return interaction.reply({ content: '❌ A sugestão deve ter pelo menos 5 caracteres.', ephemeral: true });
        }

        try {
            await interaction.deferReply({ ephemeral: true });

            const guild = interaction.guild;
            const channel = guild.channels.cache.get(guildSuggestionConfig.channel_id);
            if (!channel) {
                return interaction.editReply('❌ Canal de sugestões não encontrado.');
            }

            const embed = new MessageEmbed()
                .setColor('#5865F2')
                .setAuthor({ name: interaction.user.tag, iconURL: interaction.user.displayAvatarURL({ dynamic: true }) })
                .setTitle('💡 Nova Sugestão')
                .setDescription(suggestionText)
                .setFooter({ text: 'OVERFRAG Sugestões • 0 votos' })
                .setTimestamp();

            // Send suggestion with vote buttons (msg id placeholder - updated after send)
            const placeholderRow = new MessageActionRow().addComponents(
                new MessageButton().setCustomId('voteup_placeholder').setLabel('✅ 0').setStyle('SUCCESS'),
                new MessageButton().setCustomId('votedown_placeholder').setLabel('❌ 0').setStyle('DANGER')
            );

            const msg = await channel.send({ embeds: [embed], components: [placeholderRow] });

            // Update button custom IDs with actual message ID
            const row = new MessageActionRow().addComponents(
                new MessageButton().setCustomId(`voteup_${msg.id}`).setLabel('✅ 0').setStyle('SUCCESS'),
                new MessageButton().setCustomId(`votedown_${msg.id}`).setLabel('❌ 0').setStyle('DANGER')
            );
            await msg.edit({ components: [row] });

            // Init vote tracking
            suggestionVotes.set(msg.id, { up: new Set(), down: new Set() });

            // Create discussion thread if enabled
            if (guildSuggestionConfig.create_thread) {
                try {
                    await msg.startThread({
                        name: `💬 ${suggestionText.substring(0, 90)}`,
                        autoArchiveDuration: 1440 // 24h
                    });
                } catch (threadErr) {
                    logError('Erro ao criar thread de sugestão', threadErr);
                }
            }

            log(`Sugestão de ${interaction.user.tag}: ${suggestionText.substring(0, 80)}`);
            await interaction.editReply('✅ Sugestão enviada com sucesso!');
        } catch (err) {
            logError('Erro no /suggest', err);
            const reply = interaction.deferred ? interaction.editReply : interaction.reply;
            await reply.call(interaction, { content: '❌ Erro ao enviar sugestão: ' + err.message, ephemeral: true });
        }
    } else if (commandName === 'faceit') {
        // ---- /faceit command - Faceit Detailed Stats ----
        const nickname = interaction.options.getString('nickname');
        if (!nickname) {
            return interaction.reply({ content: '❌ Precisas indicar um nickname da Faceit.', ephemeral: true });
        }

        const FACEIT_API_KEY = process.env.FACEIT_API_KEY;
        if (!FACEIT_API_KEY) {
            return interaction.reply({ content: '❌ A API da Faceit não está configurada.', ephemeral: true });
        }

        await interaction.deferReply();

        try {
            const faceitHeaders = { 'Authorization': `Bearer ${FACEIT_API_KEY}` };
            const rlOpts = { domain: 'faceit' };

            // Fetch player (cached 10 min)
            const player = await cache.getCachedData(`faceit_player:${nickname}`, async () => {
                const res = await rateLimiter.fetchWithRetry(
                    `https://open.faceit.com/data/v4/players?nickname=${encodeURIComponent(nickname)}&game=cs2`,
                    { headers: faceitHeaders }, rlOpts
                );
                if (!res.ok) return null;
                return res.json();
            }, 600);

            if (!player) {
                return interaction.editReply(`❌ Jogador **${nickname}** não encontrado na Faceit.`);
            }
            const playerId = player.player_id;

            // Fetch lifetime stats + match history in parallel (cached)
            const [stats, histData] = await Promise.all([
                cache.getCachedData(`faceit_stats:${playerId}`, async () => {
                    const res = await rateLimiter.fetchWithRetry(
                        `https://open.faceit.com/data/v4/players/${playerId}/stats/cs2`,
                        { headers: faceitHeaders }, rlOpts
                    );
                    return res.ok ? res.json() : {};
                }, 600),
                cache.getCachedData(`faceit_history:${playerId}`, async () => {
                    const res = await rateLimiter.fetchWithRetry(
                        `https://open.faceit.com/data/v4/players/${playerId}/history?game=cs2&offset=0&limit=30`,
                        { headers: faceitHeaders }, rlOpts
                    );
                    return res.ok ? res.json() : { items: [] };
                }, 300),
            ]);

            let recentMatches = histData?.items || [];

            // Fetch detailed stats for last 5 matches in parallel (cached 1h)
            const matchIds = recentMatches.slice(0, 5).map(m => m.match_id).filter(Boolean);
            const matchStatsArr = await Promise.all(
                matchIds.map(id =>
                    cache.getCachedData(`faceit_match:${id}`, async () => {
                        const res = await rateLimiter.fetchWithRetry(
                            `https://open.faceit.com/data/v4/matches/${id}/stats`,
                            { headers: faceitHeaders }, rlOpts
                        );
                        return res.ok ? res.json() : null;
                    }, 3600)
                )
            );

            // Extract player stats from each match
            const detailedMatches = [];
            for (let i = 0; i < matchIds.length; i++) {
                const matchData = matchStatsArr[i];
                const matchInfo = recentMatches[i];
                if (!matchData?.rounds?.[0]) continue;

                const round = matchData.rounds[0];
                const map = round.round_stats?.Map || '?';
                const score = round.round_stats?.Score || '?';

                // Find player in teams
                let playerStats = null;
                let playerTeamId = null;
                for (const team of round.teams || []) {
                    for (const p of team.players || []) {
                        if (p.player_id === playerId) {
                            playerStats = p.player_stats;
                            // team_id is "faction1" or "faction2", matching Winner field
                            playerTeamId = team.team_id || team.team_stats?.['Team'];
                            break;
                        }
                    }
                    if (playerStats) break;
                }

                if (!playerStats) continue;

                // Determine W/L — Winner field uses team_id (faction1/faction2)
                const winner = round.round_stats?.Winner;
                const isWin = winner === playerTeamId;

                // Get match date
                const date = matchInfo?.started_at ? new Date(matchInfo.started_at * 1000) : null;
                const dateStr = date ? date.toLocaleDateString('pt-PT', { day: '2-digit', month: 'short' }) : '?';

                detailedMatches.push({
                    map,
                    score,
                    isWin,
                    date: dateStr,
                    kills: parseInt(playerStats.Kills) || 0,
                    deaths: parseInt(playerStats.Deaths) || 0,
                    assists: parseInt(playerStats.Assists) || 0,
                    kd: parseFloat(playerStats['K/D Ratio']) || 0,
                    kr: parseFloat(playerStats['K/R Ratio']) || 0,
                    hs: parseFloat(playerStats['Headshots %']) || 0,
                    adr: parseFloat(playerStats['ADR']) || 0
                });
            }

            // Calculate recent performance from detailed matches
            let recentKills = 0, recentDeaths = 0, recentAssists = 0, recentADR = 0, recentHS = 0;
            if (detailedMatches.length > 0) {
                for (const m of detailedMatches) {
                    recentKills += m.kills;
                    recentDeaths += m.deaths;
                    recentAssists += m.assists;
                    recentADR += m.adr;
                    recentHS += m.hs;
                }
                recentADR = recentADR / detailedMatches.length;
                recentHS = recentHS / detailedMatches.length;
            }

            // Calculate W/L from recent 30 matches
            let recentWins = 0, recentLosses = 0;
            for (const m of recentMatches) {
                const inFaction1 = m.teams?.faction1?.roster?.some(p => p.player_id === playerId)
                    || m.teams?.faction1?.players?.some(p => p.player_id === playerId);
                const playerFaction = inFaction1 ? 'faction1' : 'faction2';
                if (m.results?.winner === playerFaction) recentWins++;
                else recentLosses++;
            }
            const recentWinrate = recentMatches.length > 0 ? Math.round((recentWins / recentMatches.length) * 100) : 0;

            const cs2 = player.games?.cs2 || player.games?.csgo || {};
            const lifetime = stats.lifetime || {};
            const level = cs2.skill_level || 1;
            const elo = cs2.faceit_elo || 0;

            // Level colors
            const levelColors = {
                1: 0xEE4B2B, 2: 0xEE4B2B,
                3: 0xFF7F00, 4: 0xFF7F00,
                5: 0xFFBF00, 6: 0xFFBF00,
                7: 0x32CD32, 8: 0x32CD32,
                9: 0xFF4500, 10: 0xFF4500
            };

            // ELO progress bar
            const eloMax = 2500;
            const eloPct = Math.min(elo / eloMax, 1);
            const barLen = 16;
            const filled = Math.round(eloPct * barLen);
            const eloBar = '▰'.repeat(filled) + '▱'.repeat(barLen - filled);

            // W/L indicators for last 30 matches (most recent on the RIGHT)
            const wlIndicators = recentMatches.slice(0, 30).map(m => {
                // Determine which faction the player is on
                const inFaction1 = m.teams?.faction1?.roster?.some(p => p.player_id === playerId)
                    || m.teams?.faction1?.players?.some(p => p.player_id === playerId);
                const playerFaction = inFaction1 ? 'faction1' : 'faction2';
                return m.results?.winner === playerFaction ? '🟢' : '🔴';
            }).reverse().join('');

            const longestStreak = parseInt(lifetime['Longest Win Streak']) || 0;
            const lifetimeKD = parseFloat(lifetime['Average K/D Ratio']) || 0;
            const lifetimeHS = parseFloat(lifetime['Average Headshots %']) || 0;
            const totalMatches = parseInt(lifetime['Total Matches']) || parseInt(lifetime.Matches) || 0;
            const totalWins = parseInt(lifetime.Wins) || 0;

            // Build last matches string
            let matchesStr = '';
            for (const m of detailedMatches.slice(0, 5)) {
                const icon = m.isWin ? '🟢' : '🔴';
                const wl = m.isWin ? 'W' : 'L';
                matchesStr += `${icon} **${wl}** \`${m.score.padEnd(7)}\` ${m.map}\n`;
                matchesStr += `┗ ${m.kills}/${m.deaths}/${m.assists} K/D/A · **${m.kd.toFixed(2)}** K/D · **${m.adr.toFixed(0)}** ADR\n`;
            }

            // Build rich embed
            const embed = new MessageEmbed()
                .setColor(levelColors[level] || 0xFF6600)
                .setAuthor({ name: `${player.nickname} — Faceit CS2`, iconURL: player.avatar || undefined, url: `https://www.faceit.com/en/players/${player.nickname}` })
                .setThumbnail(`https://cdn-frontend.faceit.com/web/960/src/app/assets/images-compress/skill-icons/skill_level_${level}_svg.svg`)
                .setDescription(
                    `**Level ${level}** — **${elo}** ELO\n${eloBar}\n\n` +
                    `**Últimas ${Math.min(recentMatches.length, 30)} partidas:** ${wlIndicators}\n` +
                    `W **${recentWins}** / L **${recentLosses}** — **${recentWinrate}%** win rate`
                );

            // Recent performance fields (from detailed matches)
            if (detailedMatches.length > 0) {
                const avgKD = recentDeaths > 0 ? (recentKills / recentDeaths).toFixed(2) : '∞';
                const avgKR = detailedMatches.reduce((a, m) => a + m.kr, 0) / detailedMatches.length;

                embed.addFields(
                    { name: '📊 Recent K/D/A', value: `**${recentKills}** / **${recentDeaths}** / **${recentAssists}**`, inline: true },
                    { name: '⚔️ K/D', value: `**${avgKD}**`, inline: true },
                    { name: '🔫 K/R', value: `**${avgKR.toFixed(2)}**`, inline: true },
                    { name: '🎯 HS%', value: `**${recentHS.toFixed(1)}%**`, inline: true },
                    { name: '💥 ADR', value: `**${recentADR.toFixed(1)}**`, inline: true },
                    { name: '🔥 Melhor Streak', value: `**${longestStreak}**`, inline: true }
                );
            } else {
                embed.addFields(
                    { name: '📊 K/D (Lifetime)', value: `**${lifetimeKD.toFixed(2)}**`, inline: true },
                    { name: '🎯 HS% (Lifetime)', value: `**${lifetimeHS.toFixed(1)}%**`, inline: true },
                    { name: '🏆 Vitórias', value: `**${totalWins}** / ${totalMatches}`, inline: true }
                );
            }

            // Last matches detail
            if (matchesStr) {
                embed.addField('🕹️ Últimas Partidas', matchesStr);
            }

            embed.setFooter({ text: `OVERFRAG • Dados da Faceit • ${totalMatches} partidas totais`, iconURL: 'https://www.faceit.com/favicon.ico' })
                .setTimestamp();

            // Link button
            const row = new MessageActionRow().addComponents(
                new MessageButton()
                    .setLabel('Ver Perfil Faceit')
                    .setStyle('LINK')
                    .setURL(`https://www.faceit.com/en/players/${player.nickname}`)
                    .setEmoji('🔗')
            );

            await interaction.editReply({ embeds: [embed], components: [row] });
            log(`/faceit usado por ${interaction.user.tag} para ${nickname} (Level ${level}, ${elo} ELO)`);
        } catch (err) {
            logError('Erro no /faceit', err);
            const reply = interaction.deferred ? interaction.editReply : interaction.reply;
            await reply.call(interaction, { content: '❌ Erro ao buscar stats da Faceit: ' + err.message, ephemeral: true });
        }
    } else if (commandName === 'site') {
        // ---- /site command ----
        const embed = new MessageEmbed()
            .setColor('#FF6600')
            .setTitle('🌐 OVERFRAG')
            .setDescription('Visita o nosso site para ficares a par de tudo!')
            .setURL('https://overfrag.pt')
            .setFooter({ text: 'OVERFRAG • overfrag.pt' })
            .setTimestamp();

        const row = new MessageActionRow().addComponents(
            new MessageButton()
                .setLabel('overfrag.pt')
                .setStyle('LINK')
                .setURL('https://overfrag.pt')
                .setEmoji('🌐')
        );

        await interaction.reply({ embeds: [embed], components: [row] });
    }

    // ============================================
    // MUSIC COMMANDS
    // ============================================
    else if (commandName === 'play') {
        const query = interaction.options.getString('query');
        if (!query) return interaction.reply({ content: '❌ Indica uma música ou URL.', ephemeral: true });

        const voiceChannel = interaction.member?.voice?.channel;
        if (!voiceChannel) return interaction.reply({ content: '❌ Tens de estar num canal de voz!', ephemeral: true });

        await interaction.deferReply();

        try {
            let songInfo = null;

            // Check if it's a SoundCloud URL or search query
            const scValidate = await play.so_validate(query);
            if (scValidate === 'track') {
                // Direct SoundCloud track URL
                const info = await play.soundcloud(query);
                const durationSec = Math.floor((info.durationInMs || 0) / 1000);
                const durStr = durationSec ? `${Math.floor(durationSec/60)}:${String(durationSec%60).padStart(2,'0')}` : '?';
                songInfo = { title: info.name, url: info.url, duration: durStr, thumbnail: info.thumbnail || '' };
            } else if (query.startsWith('http://') || query.startsWith('https://')) {
                // Other direct URL — try streaming directly
                songInfo = { title: query.split('/').pop() || 'Direct Link', url: query, duration: '?', thumbnail: '' };
            } else {
                // Search SoundCloud
                const searched = await play.search(query, { source: { soundcloud: 'tracks' }, limit: 1 });
                if (!searched || searched.length === 0) return interaction.editReply('❌ Nenhum resultado encontrado no SoundCloud.');
                const track = searched[0];
                const durationSec = Math.floor((track.durationInMs || 0) / 1000);
                const durStr = durationSec ? `${Math.floor(durationSec/60)}:${String(durationSec%60).padStart(2,'0')}` : '?';
                songInfo = { title: track.name, url: track.url, duration: durStr, thumbnail: track.thumbnail || '' };
            }

            const guildId = interaction.guild.id;
            let queue = musicQueues.get(guildId);

            if (!queue) {
                queue = { songs: [], player: null, connection: null, volume: 80, textChannel: interaction.channel, playing: false };
                musicQueues.set(guildId, queue);
            }

            queue.songs.push(songInfo);
            queue.textChannel = interaction.channel;
            // persist queues asynchronously after enqueue
            asyncPersistState();

            if (!queue.playing) {
                // Connect and start playing
                const connection = joinVoiceChannel({
                    channelId: voiceChannel.id,
                    guildId: guildId,
                    adapterCreator: interaction.guild.voiceAdapterCreator
                });

                queue.connection = connection;
                queue.player = createAudioPlayer();

                connection.subscribe(queue.player);

                queue.player.on(AudioPlayerStatus.Idle, () => {
                    queue.songs.shift();
                    // persist after dequeue
                    asyncPersistState();
                    if (queue.songs.length > 0) {
                        playNextSong(guildId);
                    } else {
                        queue.playing = false;
                        setTimeout(() => {
                            const q = musicQueues.get(guildId);
                            if (q && !q.playing && q.songs.length === 0) {
                                q.connection?.destroy();
                                musicQueues.delete(guildId);
                                // persist removal of queue
                                asyncPersistState();
                            }
                        }, 300000); // 5min idle disconnect
                    }
                });

                queue.player.on('error', err => {
                    logError('Music player error', err);
                    queue.songs.shift();
                    // persist after error-induced dequeue
                    asyncPersistState();
                    if (queue.songs.length > 0) playNextSong(guildId);
                    else { queue.playing = false; }
                });

                await playNextSong(guildId);

                const embed = new MessageEmbed()
                    .setColor('#00d4ff')
                    .setTitle('🎵 A tocar')
                    .setDescription(`[${songInfo.title}](${songInfo.url})`)
                    .addField('Duração', songInfo.duration || '?', true)
                    .setThumbnail(songInfo.thumbnail || '')
                    .setFooter({ text: `Pedido por ${interaction.user.tag}` })
                    .setTimestamp();

                await interaction.editReply({ embeds: [embed] });
            } else {
                const embed = new MessageEmbed()
                    .setColor('#FFD700')
                    .setTitle('📋 Adicionado à fila')
                    .setDescription(`[${songInfo.title}](${songInfo.url})`)
                    .addField('Posição', `#${queue.songs.length}`, true)
                    .addField('Duração', songInfo.duration || '?', true)
                    .setFooter({ text: `Pedido por ${interaction.user.tag}` })
                    .setTimestamp();

                await interaction.editReply({ embeds: [embed] });
            }

            log(`Music: ${interaction.user.tag} adicionou ${songInfo.title}`);
        } catch (err) {
            logError('Erro no /play', err);
            await interaction.editReply('❌ Erro ao reproduzir: ' + err.message);
        }
    }
    else if (commandName === 'skip') {
        const queue = musicQueues.get(interaction.guild.id);
        if (!queue || !queue.playing) return interaction.reply({ content: '❌ Não há música a tocar.', ephemeral: true });
        queue.player.stop();
        // persist state: player.stop will trigger Idle handler which persists, but persist now as well
        asyncPersistState();
        await interaction.reply('⏭️ Música saltada!');
    }
    else if (commandName === 'stop') {
        const queue = musicQueues.get(interaction.guild.id);
        if (!queue) return interaction.reply({ content: '❌ Não há música a tocar.', ephemeral: true });
        queue.songs = [];
        queue.playing = false;
        queue.player?.stop();
        queue.connection?.destroy();
        musicQueues.delete(interaction.guild.id);
        // persist cleared queues
        asyncPersistState();
        await interaction.reply('⏹️ Música parada e fila limpa!');
    }
    else if (commandName === 'pause') {
        const queue = musicQueues.get(interaction.guild.id);
        if (!queue || !queue.playing) return interaction.reply({ content: '❌ Não há música a tocar.', ephemeral: true });
        queue.player.pause();
        await interaction.reply('⏸️ Música pausada!');
    }
    else if (commandName === 'resume') {
        const queue = musicQueues.get(interaction.guild.id);
        if (!queue) return interaction.reply({ content: '❌ Não há música pausada.', ephemeral: true });
        queue.player.unpause();
        await interaction.reply('▶️ Música retomada!');
    }
    else if (commandName === 'queue') {
        const queue = musicQueues.get(interaction.guild.id);
        if (!queue || queue.songs.length === 0) return interaction.reply({ content: '📋 A fila está vazia.', ephemeral: true });

        const list = queue.songs.slice(0, 10).map((s, i) => {
            const prefix = i === 0 ? '🎵 **A tocar:**' : `**${i}.**`;
            return `${prefix} [${s.title}](${s.url}) \`${s.duration || '?'}\``;
        }).join('\n');

        const embed = new MessageEmbed()
            .setColor('#5865F2')
            .setTitle('📋 Fila de Música')
            .setDescription(list)
            .setFooter({ text: `${queue.songs.length} música(s) na fila` })
            .setTimestamp();

        await interaction.reply({ embeds: [embed] });
    }
    else if (commandName === 'np') {
        const queue = musicQueues.get(interaction.guild.id);
        if (!queue || !queue.playing || queue.songs.length === 0) return interaction.reply({ content: '❌ Nada a tocar de momento.', ephemeral: true });

        const song = queue.songs[0];
        const embed = new MessageEmbed()
            .setColor('#00d4ff')
            .setTitle('🎵 A tocar agora')
            .setDescription(`[${song.title}](${song.url})`)
            .addField('Duração', song.duration || '?', true)
            .setThumbnail(song.thumbnail || '')
            .setTimestamp();

        await interaction.reply({ embeds: [embed] });
    }

    // ============================================
    // GIVEAWAY COMMANDS
    // ============================================
    else if (commandName === 'giveaway') {
        const sub = interaction.options.getSubcommand();

        if (sub === 'create') {
            if (!interaction.member?.permissions?.has('MANAGE_GUILD')) {
                return interaction.reply({ content: '❌ Precisas de permissão de Gerir Servidor.', ephemeral: true });
            }

            const prize = interaction.options.getString('prize');
            const duration = interaction.options.getString('duration');
            const winners = interaction.options.getInteger('winners') || 1;
            const channel = interaction.options.getChannel('channel') || interaction.channel;

            // Parse duration (e.g., "1h", "30m", "1d", "2h30m")
            const durationMs = parseDuration(duration);
            if (!durationMs || durationMs < 60000) {
                return interaction.reply({ content: '❌ Duração inválida. Usa: 30m, 1h, 2h30m, 1d, etc.', ephemeral: true });
            }

            await interaction.deferReply({ ephemeral: true });

            try {
                const endTime = Date.now() + durationMs;
                const endStr = `<t:${Math.floor(endTime / 1000)}:R>`;

                const embed = new MessageEmbed()
                    .setColor('#FFD700')
                    .setTitle('🎉 GIVEAWAY 🎉')
                    .setDescription(
                        `**${prize}**\n\n` +
                        `Reage com 🎉 para participar!\n\n` +
                        `⏰ Termina ${endStr}\n` +
                        `🏆 **${winners}** vencedor(es)\n` +
                        `👤 Criado por ${interaction.user}`
                    )
                    .setFooter({ text: `Termina em` })
                    .setTimestamp(endTime);

                const msg = await channel.send({ embeds: [embed] });
                await msg.react('🎉');

                const giveaway = {
                    id: msg.id,
                    channel_id: channel.id,
                    guild_id: interaction.guild.id,
                    prize,
                    winners,
                    end_time: endTime,
                    host_id: interaction.user.id,
                    ended: false
                };

                activeGiveaways.push(giveaway);
                saveConfig();
                scheduleGiveaway(giveaway);

                await interaction.editReply(`✅ Giveaway criado em <#${channel.id}>!`);
                log(`Giveaway criado: ${prize} por ${interaction.user.tag} (${formatDuration(durationMs)})`);
            } catch (err) {
                logError('Erro ao criar giveaway', err);
                await interaction.editReply('❌ Erro ao criar giveaway: ' + err.message);
            }
        }
        else if (sub === 'end') {
            if (!interaction.member?.permissions?.has('MANAGE_GUILD')) {
                return interaction.reply({ content: '❌ Sem permissão.', ephemeral: true });
            }
            const messageId = interaction.options.getString('message_id');
            const giveaway = activeGiveaways.find(g => g.id === messageId && !g.ended);
            if (!giveaway) return interaction.reply({ content: '❌ Giveaway não encontrado ou já terminou.', ephemeral: true });

            await interaction.deferReply({ ephemeral: true });
            await endGiveaway(giveaway);
            await interaction.editReply('✅ Giveaway terminado!');
        }
        else if (sub === 'reroll') {
            if (!interaction.member?.permissions?.has('MANAGE_GUILD')) {
                return interaction.reply({ content: '❌ Sem permissão.', ephemeral: true });
            }
            const messageId = interaction.options.getString('message_id');
            const giveaway = activeGiveaways.find(g => g.id === messageId && g.ended);
            if (!giveaway) return interaction.reply({ content: '❌ Giveaway não encontrado.', ephemeral: true });

            await interaction.deferReply();
            await rerollGiveaway(giveaway, interaction.channel);
            await interaction.editReply('🔄 Giveaway re-sorteado!');
        }
    }
});

// ============================================
// MUSIC HELPER FUNCTIONS
// ============================================
async function playNextSong(guildId) {
    const queue = musicQueues.get(guildId);
    if (!queue || queue.songs.length === 0) return;

    queue.playing = true;
    const song = queue.songs[0];

    try {
        // Validar URL antes de fazer stream
        if (!song.url || song.url === 'undefined' || song.url === 'null') {
            throw new Error('URL da música inválida ou em falta');
        }
        
        // Stream da música (SoundCloud / direct URL)
        let audioStream;
        try {
            const stream = await play.stream(song.url);
            audioStream = stream.stream;
            var streamType = stream.type;
        } catch (streamErr) {
            // Se falhou, tentar re-search no SoundCloud
            console.warn(`[Music] Stream falhou para URL ${song.url}, a tentar re-search SoundCloud...`);
            const searched = await play.search(song.title, { source: { soundcloud: 'tracks' }, limit: 1 });
            if (searched.length > 0 && searched[0].url) {
                song.url = searched[0].url;
                const stream2 = await play.stream(song.url);
                audioStream = stream2.stream;
                streamType = stream2.type;
            } else {
                throw streamErr;
            }
        }
        
        const resource = createAudioResource(audioStream, { inputType: streamType });
        queue.player.play(resource);
    } catch (err) {
        logError('Erro ao fazer stream de música', err);
        queue.songs.shift();
        if (queue.songs.length > 0) {
            await playNextSong(guildId);
        } else {
            queue.playing = false;
        }
    }
}

// ============================================
// GIVEAWAY HELPER FUNCTIONS
// ============================================
function parseDuration(str) {
    if (!str) return 0;
    let total = 0;
    const dMatch = str.match(/(\d+)\s*d/i);
    const hMatch = str.match(/(\d+)\s*h/i);
    const mMatch = str.match(/(\d+)\s*m/i);
    if (dMatch) total += parseInt(dMatch[1]) * 86400000;
    if (hMatch) total += parseInt(hMatch[1]) * 3600000;
    if (mMatch) total += parseInt(mMatch[1]) * 60000;
    if (total === 0 && /^\d+$/.test(str.trim())) total = parseInt(str.trim()) * 60000; // plain number = minutes
    return total;
}

function formatDuration(ms) {
    const h = Math.floor(ms / 3600000);
    const m = Math.floor((ms % 3600000) / 60000);
    if (h > 0) return `${h}h${m > 0 ? ` ${m}m` : ''}`;
    return `${m}m`;
}

function scheduleGiveaway(giveaway) {
    const remaining = giveaway.end_time - Date.now();
    if (remaining <= 0) {
        endGiveaway(giveaway);
        return;
    }

    const timer = setTimeout(() => {
        endGiveaway(giveaway);
    }, Math.min(remaining, 2147483647)); // Max setTimeout value

    giveawayTimers.set(giveaway.id, timer);
}

async function endGiveaway(giveaway) {
    if (giveaway.ended) return;
    giveaway.ended = true;
    saveConfig();

    // Clear timer
    const timer = giveawayTimers.get(giveaway.id);
    if (timer) { clearTimeout(timer); giveawayTimers.delete(giveaway.id); }

    try {
        const guild = client.guilds?.cache.get(giveaway.guild_id);
        if (!guild) return;
        const channel = guild.channels.cache.get(giveaway.channel_id);
        if (!channel) return;
        const msg = await channel.messages.fetch(giveaway.id).catch(() => null);
        if (!msg) return;

        // Get reactions
        const reaction = msg.reactions.cache.get('🎉');
        if (!reaction) return;
        const users = await reaction.users.fetch();
        const participants = users.filter(u => !u.bot).map(u => u.id);

        let winnerMentions = 'Ninguém participou! 😢';
        const winnerIds = [];

        if (participants.length > 0) {
            // Pick random winners
            const shuffled = participants.sort(() => Math.random() - 0.5);
            const picked = shuffled.slice(0, giveaway.winners);
            winnerIds.push(...picked);
            winnerMentions = picked.map(id => `<@${id}>`).join(', ');
        }

        // Update original embed
        const embed = new MessageEmbed()
            .setColor(winnerIds.length > 0 ? '#00FF88' : '#f85149')
            .setTitle('🎉 GIVEAWAY TERMINADO 🎉')
            .setDescription(
                `**${giveaway.prize}**\n\n` +
                `🏆 Vencedor(es): ${winnerMentions}\n` +
                `👥 ${participants.length} participante(s)\n` +
                `👤 Criado por <@${giveaway.host_id}>`
            )
            .setFooter({ text: 'Giveaway terminado' })
            .setTimestamp();

        await msg.edit({ embeds: [embed] });

        if (winnerIds.length > 0) {
            await channel.send(`🎉 Parabéns ${winnerMentions}! Ganhaste **${giveaway.prize}**!`);
        }

        log(`Giveaway terminado: ${giveaway.prize} -> ${winnerMentions}`);
    } catch (err) {
        logError('Erro ao terminar giveaway', err);
    }
}

async function rerollGiveaway(giveaway, replyChannel) {
    try {
        const guild = client.guilds?.cache.get(giveaway.guild_id);
        if (!guild) return;
        const channel = guild.channels.cache.get(giveaway.channel_id);
        if (!channel) return;
        const msg = await channel.messages.fetch(giveaway.id).catch(() => null);
        if (!msg) return;

        const reaction = msg.reactions.cache.get('🎉');
        if (!reaction) return;
        const users = await reaction.users.fetch();
        const participants = users.filter(u => !u.bot).map(u => u.id);

        if (participants.length === 0) {
            if (replyChannel) await replyChannel.send('❌ Ninguém participou no giveaway.');
            return;
        }

        const shuffled = participants.sort(() => Math.random() - 0.5);
        const picked = shuffled.slice(0, giveaway.winners);
        const winnerMentions = picked.map(id => `<@${id}>`).join(', ');

        await channel.send(`🔄 Re-sorteio! Novos vencedores de **${giveaway.prize}**: ${winnerMentions}`);
        log(`Giveaway reroll: ${giveaway.prize} -> ${winnerMentions}`);
    } catch (err) {
        logError('Erro ao re-sortear giveaway', err);
    }
}

// Schedule existing giveaways on startup
client.once('ready', () => {
    for (const g of activeGiveaways) {
        if (!g.ended) scheduleGiveaway(g);
    }
    log(`Giveaways activos: ${activeGiveaways.filter(g => !g.ended).length}`);
});

// ============================================
// LOGIN
// ============================================
let isConnected = false;
let loginError = null;

if (CONFIG.TOKEN) {
    log('A fazer login no Discord...');
    log(`Token (primeiros 20 chars): ${CONFIG.TOKEN.substring(0, 20)}...`);
    
    // Timeout de 30 segundos
    const loginTimeout = setTimeout(() => {
        log('⚠️ Login timeout após 30 segundos - possível problema de rede ou token');
    }, 30000);
    
    client.login(CONFIG.TOKEN)
        .then(() => {
            clearTimeout(loginTimeout);
            log('Login bem sucedido!');
            isConnected = true;
        })
        .catch(err => {
            clearTimeout(loginTimeout);
            loginError = err.message;
            logError('Erro no login', err);
            log(`Erro code: ${err.code}`);
            log(`Erro HTTP status: ${err.httpStatus}`);
            if (err.code === 'TokenInvalid') {
                logError('Token inválido! Verifica DISCORD_BOT_TOKEN');
            }
            // NÃO fazer exit - deixar HTTP server correr para debug
        });
} else {
    log('Token não definido - bot não vai iniciar, mas HTTP server vai correr');
}

// ============================================
// SERVIDOR HTTP - API PARA O SITE
// ============================================
const PORT = process.env.PORT || process.env.SERVER_PORT || 8080;
const BOT_API_SECRET = process.env.BOT_API_SECRET || 'overfrag-bot-secret-2024';

// Helper: parse JSON body
function parseBody(req) {
    return new Promise((resolve, reject) => {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', () => {
            try { resolve(body ? JSON.parse(body) : {}); }
            catch (e) { reject(e); }
        });
        req.on('error', reject);
    });
}

// Helper: CORS headers
function setCors(res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

// Helper: check auth
function checkAuth(req) {
    const auth = req.headers['authorization'];
    if (!auth) return false;
    return auth === `Bearer ${BOT_API_SECRET}`;
}

function jsonResponse(res, status, data) {
    setCors(res);
    res.writeHead(status, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(data));
}

// Helper: parse URL query params
function getQueryParam(url, param) {
    const match = url.match(new RegExp('[?&]' + param + '=([^&]+)'));
    return match ? decodeURIComponent(match[1]) : null;
}

// Helper: get guild from request (?guild_id= query param, or default main guild)
function getGuildFromReq(req, explicitGuildId) {
    const guildId = explicitGuildId || getQueryParam(req.url, 'guild_id');
    if (guildId) return getGuildById(guildId);
    return getMainGuild();
}

// Helper: get URL path without query string
function getUrlPath(url) {
    return url.split('?')[0];
}

const server = http.createServer(async (req, res) => {
    log(`HTTP: ${req.method} ${req.url}`);
    setCors(res);
    const urlPath = getUrlPath(req.url);

    // CORS preflight
    if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
    }
    
    // ---- PUBLIC ENDPOINTS ----
    
    if (urlPath === '/' || urlPath === '/health') {
        return jsonResponse(res, 200, {
            status: 'ok',
            bot: isConnected ? 'online' : 'offline',
            uptime: process.uptime(),
            timestamp: new Date().toISOString()
        });
    }
    
    if (urlPath === '/status') {
        const guild = getMainGuild();
        return jsonResponse(res, 200, {
            success: true,
            data: {
                connected: isConnected,
                user: client.user ? { tag: client.user.tag, id: client.user.id, avatar: client.user.displayAvatarURL() } : null,
                guilds: client.guilds ? client.guilds.cache.size : 0,
                members: guild ? guild.memberCount : 0,
                uptime: process.uptime(),
                uptimeFormatted: formatUptime(process.uptime()),
                ping: client.ws.ping
            }
        });
    }

    if (urlPath === '/check') {
        let logContent = 'Log não disponível';
        try {
            if (fs.existsSync(logFile)) {
                logContent = fs.readFileSync(logFile, 'utf8');
                const lines = logContent.split('\n');
                logContent = lines.slice(-50).join('\n');
            }
        } catch (e) {
            logContent = 'Erro: ' + e.message;
        }
        
        const html = `<!DOCTYPE html>
<html>
<head><title>OVERFRAG Bot - Check</title><meta charset="utf-8">
<style>body{font-family:Arial;max-width:900px;margin:50px auto;padding:20px;background:#1a1a2e;color:#eee}h1{color:#00d4ff}.status{background:#16213e;padding:20px;border-radius:10px;margin:20px 0}.ok{color:#00ff88}.error{color:#ff4444}pre{background:#0f0f23;padding:15px;border-radius:5px;overflow-x:auto;font-size:12px;max-height:400px;overflow-y:auto}</style>
</head>
<body>
<h1>🤖 OVERFRAG Bot - Diagnóstico</h1>
<div class="status">
  <p class="ok">✅ HTTP Server: A correr (Railway)</p>
  <p class="${isConnected ? 'ok' : 'error'}">${isConnected ? '✅' : '❌'} Discord: ${isConnected ? 'ONLINE' : 'OFFLINE'}</p>
  ${loginError ? '<p class="error">❌ ' + loginError + '</p>' : ''}
  <p>User: ${client.user ? client.user.tag : 'não conectado'}</p>
  <p>Uptime: ${Math.floor(process.uptime())}s</p>
</div>
<div class="status"><h2>Log</h2><pre>${logContent.replace(/</g, '&lt;')}</pre></div>
</body></html>`;
        
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(html);
        return;
    }

    // ---- AUTHENTICATED ENDPOINTS (require BOT_API_SECRET) ----

    if (!checkAuth(req) && urlPath !== '/' && urlPath !== '/health' && urlPath !== '/status' && urlPath !== '/check') {
        return jsonResponse(res, 401, { error: 'Unauthorized', message: 'Invalid BOT_API_SECRET' });
    }

    // GET /api/guilds - Lista de servidores onde o bot está instalado
    if (urlPath === '/api/guilds' && req.method === 'GET') {
        try {
            const guilds = client.guilds?.cache.map(g => ({
                id: g.id,
                name: g.name,
                icon: g.iconURL({ dynamic: true, size: 128 }),
                memberCount: g.memberCount,
                isMain: g.id === CONFIG.GUILD_ID
            })) || [];
            return jsonResponse(res, 200, { success: true, data: guilds });
        } catch (err) {
            return jsonResponse(res, 500, { error: err.message });
        }
    }

    // GET /api/guild/:guildId/info - Dados do servidor
    const guildInfoMatch = urlPath.match(/^\/api\/guild\/(\d{17,20})\/info$/);
    if (guildInfoMatch && req.method === 'GET') {
        try {
            const guild = getGuildFromReq(req, guildInfoMatch[1]);
            if (!guild) return jsonResponse(res, 404, { success: false, error: 'Guild not found' });
            return jsonResponse(res, 200, {
                success: true,
                data: {
                    id: guild.id,
                    name: guild.name,
                    icon: guild.iconURL({ dynamic: true, size: 128 }),
                    memberCount: guild.memberCount,
                }
            });
        } catch (err) {
            return jsonResponse(res, 500, { success: false, error: err.message });
        }
    }
    
    // GET /api/channels - Lista de canais do servidor (?guild_id= opcional)
    if (urlPath === '/api/channels' && req.method === 'GET') {
        try {
            const guild = getGuildFromReq(req);
            if (!guild) return jsonResponse(res, 503, { error: 'Guild not found or bot not in guild' });
            
            const channels = guild.channels.cache
                .filter(c => ['GUILD_TEXT', 'GUILD_NEWS', 'GUILD_VOICE', 'GUILD_CATEGORY'].includes(c.type))
                .map(c => ({ id: c.id, name: c.name, type: c.type === 'GUILD_VOICE' ? 'voice' : c.type === 'GUILD_CATEGORY' ? 'category' : 'text', parent: c.parent?.name || null }))
                .sort((a, b) => a.name.localeCompare(b.name));
            
            return jsonResponse(res, 200, { success: true, data: channels });
        } catch (err) {
            return jsonResponse(res, 500, { error: err.message });
        }
    }

    const channelsMatch = urlPath.match(/^\/api\/channels\/(\d{17,20})$/);
    if (channelsMatch && req.method === 'GET') {
        try {
            const guild = getGuildFromReq(req, channelsMatch[1]);
            if (!guild) return jsonResponse(res, 503, { error: 'Guild not found or bot not in guild' });

            const channels = guild.channels.cache
                .filter(c => ['GUILD_TEXT', 'GUILD_NEWS', 'GUILD_VOICE', 'GUILD_CATEGORY'].includes(c.type))
                .map(c => ({ id: c.id, name: c.name, type: c.type === 'GUILD_VOICE' ? 'voice' : c.type === 'GUILD_CATEGORY' ? 'category' : 'text', parent: c.parent?.name || null }))
                .sort((a, b) => a.name.localeCompare(b.name));

            return jsonResponse(res, 200, { success: true, data: channels });
        } catch (err) {
            return jsonResponse(res, 500, { error: err.message });
        }
    }

    // GET /api/members - Contagem de membros
    if (urlPath === '/api/members' && req.method === 'GET') {
        try {
            const guild = getGuildFromReq(req);
            return jsonResponse(res, 200, { 
                success: true, 
                data: { count: guild ? guild.memberCount : 0 } 
            });
        } catch (err) {
            return jsonResponse(res, 500, { error: err.message });
        }
    }

    // POST /api/send-embed - Enviar embed para canal (full embed generator)
    if (urlPath === '/api/send-embed' && req.method === 'POST') {
        try {
            const body = await parseBody(req);
            const { channel_id, content, embed } = body;
            if (!channel_id) return jsonResponse(res, 400, { error: 'channel_id required' });
            
            const guild = getMainGuild();
            if (!guild) return jsonResponse(res, 503, { error: 'Bot not connected' });
            
            const channel = guild.channels.cache.get(channel_id);
            if (!channel) return jsonResponse(res, 404, { error: 'Channel not found' });
            
            const msgEmbed = new MessageEmbed();
            if (embed.title) msgEmbed.setTitle(embed.title);
            if (embed.url && /^https?:\/\//i.test(embed.url)) msgEmbed.setURL(embed.url);
            if (embed.description) msgEmbed.setDescription(embed.description);
            if (embed.color) msgEmbed.setColor(typeof embed.color === 'number' ? embed.color : embed.color);
            if (embed.image?.url && /^https?:\/\//i.test(embed.image.url)) msgEmbed.setImage(embed.image.url);
            if (embed.thumbnail?.url && /^https?:\/\//i.test(embed.thumbnail.url)) msgEmbed.setThumbnail(embed.thumbnail.url);
            if (embed.footer?.text) {
                const footerObj = { text: embed.footer.text };
                if (embed.footer.icon_url) footerObj.iconURL = embed.footer.icon_url;
                msgEmbed.setFooter(footerObj);
            }
            if (embed.author?.name) {
                const authorObj = { name: embed.author.name };
                if (embed.author.url) authorObj.url = embed.author.url;
                if (embed.author.icon_url) authorObj.iconURL = embed.author.icon_url;
                msgEmbed.setAuthor(authorObj);
            }
            if (embed.timestamp) msgEmbed.setTimestamp(new Date());
            if (Array.isArray(embed.fields) && embed.fields.length > 0) {
                embed.fields.forEach(f => {
                    if (f.name && f.value) {
                        msgEmbed.addField(f.name, f.value, !!f.inline);
                    }
                });
            }
            
            const msgOptions = { embeds: [msgEmbed] };
            if (content) msgOptions.content = content;
            
            await channel.send(msgOptions);
            log(`Embed enviado para #${channel.name} via API`);
            return jsonResponse(res, 200, { success: true, message: 'Embed sent' });
        } catch (err) {
            logError('Erro ao enviar embed via API', err);
            return jsonResponse(res, 500, { error: err.message });
        }
    }

    // GET /api/welcome-config - Obter welcome config actual do bot
    if (urlPath === '/api/welcome-config' && req.method === 'GET') {
        const cfg = getScopedConfig('welcome', CONFIG.GUILD_ID, welcomeConfig);
        return jsonResponse(res, 200, {
            success: true,
            data: cfg
        });
    }

    const welcomeMatch = urlPath.match(/^\/api\/welcome\/(\d{17,20})$/);
    if (welcomeMatch && req.method === 'GET') {
        const guildId = welcomeMatch[1];
        return jsonResponse(res, 200, { success: true, data: getScopedConfig('welcome', guildId, welcomeConfig) });
    }

    if (welcomeMatch && req.method === 'PUT') {
        try {
            const guildId = welcomeMatch[1];
            const body = await parseBody(req);
            const merged = { ...getScopedConfig('welcome', guildId, welcomeConfig), ...body };
            setScopedConfig('welcome', guildId, merged);
            saveConfig();
            log(`Welcome config atualizada para guild ${guildId}`);
            return jsonResponse(res, 200, { success: true, data: merged });
        } catch (err) {
            return jsonResponse(res, 500, { error: err.message });
        }
    }

    // GET /api/roles - Lista de roles do servidor
    if (urlPath === '/api/roles' && req.method === 'GET') {
        try {
            const guild = getGuildFromReq(req);
            if (!guild) return jsonResponse(res, 503, { error: 'Guild not found or bot not in guild' });
            
            const roles = guild.roles.cache
                .filter(r => r.id !== guild.id && !r.managed) // Exclude @everyone and bot roles
                .map(r => ({ id: r.id, name: r.name, color: r.hexColor, position: r.position }))
                .sort((a, b) => b.position - a.position);
            
            return jsonResponse(res, 200, { success: true, data: roles });
        } catch (err) {
            return jsonResponse(res, 500, { error: err.message });
        }
    }

    const rolesMatch = urlPath.match(/^\/api\/roles\/(\d{17,20})$/);
    if (rolesMatch && req.method === 'GET') {
        try {
            const guild = getGuildFromReq(req, rolesMatch[1]);
            if (!guild) return jsonResponse(res, 503, { error: 'Guild not found or bot not in guild' });

            const roles = guild.roles.cache
                .filter(r => r.id !== guild.id && !r.managed)
                .map(r => ({ id: r.id, name: r.name, color: r.hexColor, position: r.position }))
                .sort((a, b) => b.position - a.position);

            return jsonResponse(res, 200, { success: true, data: roles });
        } catch (err) {
            return jsonResponse(res, 500, { error: err.message });
        }
    }

    // GET /api/autorole - Obter configuração de autorole
    if (urlPath === '/api/autorole' && req.method === 'GET') {
        return jsonResponse(res, 200, { success: true, data: autoroleConfig });
    }

    const autoroleMatch = urlPath.match(/^\/api\/autorole\/(\d{17,20})$/);
    if (autoroleMatch && req.method === 'GET') {
        const guildId = autoroleMatch[1];
        return jsonResponse(res, 200, { success: true, data: getScopedConfig('autorole', guildId, autoroleConfig) });
    }

    // PUT /api/autorole - Guardar configuração de autorole
    if (urlPath === '/api/autorole' && req.method === 'PUT') {
        try {
            const body = await parseBody(req);
            if (body.enabled !== undefined) autoroleConfig.enabled = body.enabled;
            if (body.roles) autoroleConfig.roles = body.roles;
            if (body.require_message !== undefined) autoroleConfig.require_message = body.require_message;
            if (body.delay_seconds !== undefined) autoroleConfig.delay_seconds = body.delay_seconds;
            saveConfig();
            log(`Autorole config atualizada via API: ${JSON.stringify(autoroleConfig)}`);
            return jsonResponse(res, 200, { success: true, message: 'Autorole config saved' });
        } catch (err) {
            return jsonResponse(res, 500, { error: err.message });
        }
    }

    if (autoroleMatch && req.method === 'PUT') {
        try {
            const guildId = autoroleMatch[1];
            const body = await parseBody(req);
            const merged = { ...getScopedConfig('autorole', guildId, autoroleConfig), ...body };
            setScopedConfig('autorole', guildId, merged);
            saveConfig();
            log(`Autorole config atualizada para guild ${guildId}`);
            return jsonResponse(res, 200, { success: true, data: merged });
        } catch (err) {
            return jsonResponse(res, 500, { error: err.message });
        }
    }

    // GET /api/suggestions - Obter configuração de sugestões
    if (urlPath === '/api/suggestions' && req.method === 'GET') {
        return jsonResponse(res, 200, { success: true, data: suggestionConfig });
    }

    const suggestionsMatch = urlPath.match(/^\/api\/suggestions\/(\d{17,20})$/);
    if (suggestionsMatch && req.method === 'GET') {
        const guildId = suggestionsMatch[1];
        return jsonResponse(res, 200, { success: true, data: getScopedConfig('suggestions', guildId, suggestionConfig) });
    }

    // PUT /api/suggestions - Guardar configuração de sugestões
    if (urlPath === '/api/suggestions' && req.method === 'PUT') {
        try {
            const body = await parseBody(req);
            if (body.enabled !== undefined) suggestionConfig.enabled = body.enabled;
            if (body.channel_id !== undefined) suggestionConfig.channel_id = body.channel_id;
            if (body.create_thread !== undefined) suggestionConfig.create_thread = body.create_thread;
            saveConfig();
            log(`Suggestion config atualizada via API: ${JSON.stringify(suggestionConfig)}`);
            return jsonResponse(res, 200, { success: true, message: 'Suggestion config saved' });
        } catch (err) {
            return jsonResponse(res, 500, { error: err.message });
        }
    }

    if (suggestionsMatch && req.method === 'PUT') {
        try {
            const guildId = suggestionsMatch[1];
            const body = await parseBody(req);
            const merged = { ...getScopedConfig('suggestions', guildId, suggestionConfig), ...body };
            setScopedConfig('suggestions', guildId, merged);
            saveConfig();
            log(`Suggestion config atualizada para guild ${guildId}`);
            return jsonResponse(res, 200, { success: true, data: merged });
        } catch (err) {
            return jsonResponse(res, 500, { error: err.message });
        }
    }

    // GET /api/scheduled - Obter mensagens agendadas
    if (urlPath === '/api/scheduled' && req.method === 'GET') {
        return jsonResponse(res, 200, { success: true, data: scheduledMessages });
    }

    // POST /api/scheduled - Criar mensagem agendada
    if (urlPath === '/api/scheduled' && req.method === 'POST') {
        try {
            const body = await parseBody(req);
            const id = Date.now().toString(36) + Math.random().toString(36).substr(2, 5);

            // Convert frequency+time to cron if provided
            let cron = body.cron || '0 12 * * *';
            if (body.frequency && body.time) {
                const [h, m] = body.time.split(':').map(Number);
                switch (body.frequency) {
                    case 'hour': cron = `${m || 0} * * * *`; break;
                    case 'day': cron = `${m || 0} ${h || 12} * * *`; break;
                    case 'week': cron = `${m || 0} ${h || 12} * * ${body.weekday || 1}`; break;
                    case 'month': cron = `${m || 0} ${h || 12} ${body.monthday || 1} * *`; break;
                    default: break;
                }
            }

            const newMsg = {
                id,
                channel_id: body.channel_id,
                content: body.content || '',
                embed: body.useEmbed ? body.embed : null,
                cron,
                frequency: body.frequency || 'day',
                time: body.time || '12:00',
                weekday: body.weekday || 1,
                monthday: body.monthday || 1,
                enabled: true,
                next_run: '',
                description: body.description || ''
            };
            scheduledMessages.push(newMsg);
            saveConfig();
            setupScheduledMessages(); // Re-setup cron timers
            log(`Mensagem agendada criada: ${id} - ${newMsg.description} (cron: ${cron})`);
            return jsonResponse(res, 200, { success: true, data: newMsg });
        } catch (err) {
            return jsonResponse(res, 500, { error: err.message });
        }
    }

    // DELETE /api/scheduled/:id
    const scheduledDeleteMatch = urlPath.match(/^\/api\/scheduled\/(.+)$/);
    if (scheduledDeleteMatch && req.method === 'DELETE') {
        const msgId = scheduledDeleteMatch[1];
        scheduledMessages = scheduledMessages.filter(m => m.id !== msgId);
        saveConfig();
        setupScheduledMessages();
        log(`Mensagem agendada removida: ${msgId}`);
        return jsonResponse(res, 200, { success: true, message: 'Scheduled message deleted' });
    }

    // POST /api/test-welcome - Testar mensagem de boas-vindas
    if (urlPath === '/api/test-welcome' && req.method === 'POST') {
        try {
            const guild = getMainGuild();
            if (!guild) return jsonResponse(res, 503, { error: 'Bot not connected' });
            
            const botMember = guild.members.cache.get(client.user.id);
            if (!botMember) return jsonResponse(res, 503, { error: 'Bot member not found' });
            
            // Emit a fake guildMemberAdd to test
            client.emit('guildMemberAdd', botMember);
            
            return jsonResponse(res, 200, { success: true, message: 'Test welcome sent' });
        } catch (err) {
            return jsonResponse(res, 500, { error: err.message });
        }
    }

    // GET /api/tickets - Obter configuração de tickets
    if (urlPath === '/api/tickets' && req.method === 'GET') {
        return jsonResponse(res, 200, { success: true, data: ticketConfig });
    }

    // PUT /api/tickets - Guardar configuração de tickets
    if (urlPath === '/api/tickets' && req.method === 'PUT') {
        try {
            const body = await parseBody(req);
            if (body.enabled !== undefined) ticketConfig.enabled = body.enabled;
            if (body.channel_id !== undefined) ticketConfig.channel_id = body.channel_id;
            if (body.category_id !== undefined) ticketConfig.category_id = body.category_id;
            if (body.log_channel_id !== undefined) ticketConfig.log_channel_id = body.log_channel_id;
            if (body.categories) ticketConfig.categories = body.categories;
            if (body.embed) ticketConfig.embed = { ...ticketConfig.embed, ...body.embed };
            saveConfig();
            log(`Ticket config atualizada via API: ${JSON.stringify(ticketConfig)}`);
            return jsonResponse(res, 200, { success: true, message: 'Ticket config saved' });
        } catch (err) {
            return jsonResponse(res, 500, { error: err.message });
        }
    }

    // POST /api/tickets/deploy - Enviar embed de tickets para o canal
    if (urlPath === '/api/tickets/deploy' && req.method === 'POST') {
        try {
            const body = await parseBody(req);
            const guild = getMainGuild();
            if (!guild) return jsonResponse(res, 503, { error: 'Bot not connected' });

            const channelId = body.channel_id || ticketConfig.channel_id;
            if (!channelId) return jsonResponse(res, 400, { error: 'channel_id required' });

            const channel = guild.channels.cache.get(channelId);
            if (!channel) return jsonResponse(res, 404, { error: 'Channel not found' });

            // Build embed
            const embedData = body.embed || ticketConfig.embed;
            const embed = new MessageEmbed()
                .setColor(embedData.color || '#5865F2')
                .setTitle(embedData.title || '🎫 Sistema de Tickets')
                .setDescription(embedData.description || 'Seleciona a categoria do teu ticket no menu abaixo.');

            // Build select menu with categories
            const cats = body.categories || ticketConfig.categories;
            const options = cats.filter(c => c.name).map(c => ({
                label: c.name,
                description: c.description || '',
                value: c.id,
                emoji: c.emoji || '📋'
            }));

            if (options.length === 0) {
                return jsonResponse(res, 400, { error: 'At least one category required' });
            }

            const row = new MessageActionRow().addComponents(
                new MessageSelectMenu()
                    .setCustomId('ticket_category')
                    .setPlaceholder('Seleciona a categoria do ticket...')
                    .addOptions(options)
            );

            await channel.send({ embeds: [embed], components: [row] });
            log(`Ticket embed deployed to #${channel.name}`);
            return jsonResponse(res, 200, { success: true, message: 'Ticket embed sent' });
        } catch (err) {
            logError('Erro ao deploy ticket embed', err);
            return jsonResponse(res, 500, { error: err.message });
        }
    }

    // GET /api/leave - Obter configuração de leave
    if (urlPath === '/api/leave' && req.method === 'GET') {
        return jsonResponse(res, 200, { success: true, data: leaveConfig });
    }

    const leaveMatch = urlPath.match(/^\/api\/leave\/(\d{17,20})$/);
    if (leaveMatch && req.method === 'GET') {
        const guildId = leaveMatch[1];
        return jsonResponse(res, 200, { success: true, data: getScopedConfig('leave', guildId, leaveConfig) });
    }

    // PUT /api/leave - Guardar configuração de leave
    if (urlPath === '/api/leave' && req.method === 'PUT') {
        try {
            const body = await parseBody(req);
            if (body.enabled !== undefined) leaveConfig.enabled = body.enabled;
            if (body.channel_id !== undefined) leaveConfig.channel_id = body.channel_id;
            if (body.message !== undefined) leaveConfig.message = body.message;
            if (body.show_member_count !== undefined) leaveConfig.show_member_count = body.show_member_count;
            saveConfig();
            log(`Leave config atualizada via API: ${JSON.stringify(leaveConfig)}`);
            return jsonResponse(res, 200, { success: true, message: 'Leave config saved' });
        } catch (err) {
            return jsonResponse(res, 500, { error: err.message });
        }
    }

    if (leaveMatch && req.method === 'PUT') {
        try {
            const guildId = leaveMatch[1];
            const body = await parseBody(req);
            const merged = { ...getScopedConfig('leave', guildId, leaveConfig), ...body };
            setScopedConfig('leave', guildId, merged);
            saveConfig();
            log(`Leave config atualizada para guild ${guildId}`);
            return jsonResponse(res, 200, { success: true, data: merged });
        } catch (err) {
            return jsonResponse(res, 500, { error: err.message });
        }
    }

    if (urlPath === '/api/general' && req.method === 'GET') {
        return jsonResponse(res, 200, { success: true, data: generalConfig });
    }

    const generalMatch = urlPath.match(/^\/api\/general\/(\d{17,20})$/);
    if (generalMatch && req.method === 'GET') {
        const guildId = generalMatch[1];
        return jsonResponse(res, 200, { success: true, data: getScopedConfig('general', guildId, generalConfig) });
    }

    if (urlPath === '/api/general' && req.method === 'PUT') {
        try {
            const body = await parseBody(req);
            generalConfig = { ...generalConfig, ...body };
            saveConfig();
            return jsonResponse(res, 200, { success: true, data: generalConfig });
        } catch (err) {
            return jsonResponse(res, 500, { error: err.message });
        }
    }

    if (generalMatch && req.method === 'PUT') {
        try {
            const guildId = generalMatch[1];
            const body = await parseBody(req);
            const merged = { ...getScopedConfig('general', guildId, generalConfig), ...body };
            setScopedConfig('general', guildId, merged);
            saveConfig();
            return jsonResponse(res, 200, { success: true, data: merged });
        } catch (err) {
            return jsonResponse(res, 500, { error: err.message });
        }
    }

    if (urlPath === '/api/team-feed' && req.method === 'GET') {
        return jsonResponse(res, 200, { success: true, data: teamFeedConfig });
    }

    const teamFeedMatch = urlPath.match(/^\/api\/team-feed\/(\d{17,20})$/);
    if (teamFeedMatch && req.method === 'GET') {
        const guildId = teamFeedMatch[1];
        return jsonResponse(res, 200, { success: true, data: getScopedConfig('teamFeed', guildId, teamFeedConfig) });
    }

    if (urlPath === '/api/team-feed' && req.method === 'PUT') {
        try {
            const body = await parseBody(req);
            teamFeedConfig = { ...teamFeedConfig, ...body };
            saveConfig();
            return jsonResponse(res, 200, { success: true, data: teamFeedConfig });
        } catch (err) {
            return jsonResponse(res, 500, { error: err.message });
        }
    }

    if (teamFeedMatch && req.method === 'PUT') {
        try {
            const guildId = teamFeedMatch[1];
            const body = await parseBody(req);
            const merged = { ...getScopedConfig('teamFeed', guildId, teamFeedConfig), ...body };
            setScopedConfig('teamFeed', guildId, merged);
            saveConfig();
            return jsonResponse(res, 200, { success: true, data: merged });
        } catch (err) {
            return jsonResponse(res, 500, { error: err.message });
        }
    }

    // GET /api/serverstats - Obter configuração de server stats
    if (urlPath === '/api/serverstats' && req.method === 'GET') {
        return jsonResponse(res, 200, { success: true, data: serverStatsConfig });
    }

    // PUT /api/serverstats - Guardar configuração de server stats
    if (urlPath === '/api/serverstats' && req.method === 'PUT') {
        try {
            const body = await parseBody(req);
            const wasEnabled = serverStatsConfig.enabled;
            if (body.enabled !== undefined) serverStatsConfig.enabled = body.enabled;
            if (body.category_id !== undefined) serverStatsConfig.category_id = body.category_id;
            if (body.channels) {
                for (const [key, val] of Object.entries(body.channels)) {
                    if (serverStatsConfig.channels[key]) {
                        serverStatsConfig.channels[key] = { ...serverStatsConfig.channels[key], ...val };
                    }
                }
            }
            saveConfig();
            log(`ServerStats config atualizada via API: ${JSON.stringify(serverStatsConfig)}`);

            // If just enabled, trigger update
            if (serverStatsConfig.enabled && !wasEnabled) {
                const guild = getMainGuild();
                if (guild) updateServerStats(guild);
            }

            // If disabled, delete stats channels
            if (!serverStatsConfig.enabled && wasEnabled) {
                const guild = getMainGuild();
                if (guild) {
                    for (const [key, chId] of statsChannelIds.entries()) {
                        try {
                            const ch = guild.channels.cache.get(chId);
                            if (ch) await ch.delete('Server stats disabled');
                            statsChannelIds.delete(key);
                        } catch (e) { logError(`Erro ao apagar stats channel ${key}`, e); }
                    }
                }
            }

            return jsonResponse(res, 200, { success: true, message: 'ServerStats config saved' });
        } catch (err) {
            return jsonResponse(res, 500, { error: err.message });
        }
    }

    // GET /api/serverstats/:guildId - Guild-scoped server stats config
    const ssGetMatch = urlPath.match(/^\/api\/serverstats\/(\d{17,20})$/);
    if (ssGetMatch && req.method === 'GET') {
        const guildId = ssGetMatch[1];
        return jsonResponse(res, 200, { success: true, data: getScopedConfig('serverStats', guildId, serverStatsConfig) });
    }

    // PUT /api/serverstats/:guildId - Guild-scoped server stats config
    if (ssGetMatch && req.method === 'PUT') {
        try {
            const guildId = ssGetMatch[1];
            const body = await parseBody(req);
            const current = getScopedConfig('serverStats', guildId, serverStatsConfig);
            const wasEnabled = current.enabled;
            const merged = { ...current, ...body };
            if (body.channels && current.channels) {
                merged.channels = { ...current.channels };
                for (const [key, val] of Object.entries(body.channels)) {
                    if (merged.channels[key]) {
                        merged.channels[key] = { ...merged.channels[key], ...val };
                    }
                }
            }
            setScopedConfig('serverStats', guildId, merged);
            saveConfig();
            log(`ServerStats config atualizada para guild ${guildId}`);

            // Trigger update if just enabled
            if (merged.enabled && !wasEnabled) {
                const guild = getGuildById(guildId);
                if (guild) updateServerStats(guild);
            }

            return jsonResponse(res, 200, { success: true, data: merged });
        } catch (err) {
            return jsonResponse(res, 500, { error: err.message });
        }
    }

    // Not found
    jsonResponse(res, 404, { error: 'Not Found' });
});

function formatUptime(seconds) {
    const d = Math.floor(seconds / 86400);
    const h = Math.floor((seconds % 86400) / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    if (d > 0) return `${d}d ${h}h ${m}m`;
    if (h > 0) return `${h}h ${m}m`;
    return `${m}m`;
}

server.listen(PORT, () => {
    log(`✅ HTTP Server na porta ${PORT}`);
});

// ============================================
// REVERSE PUSH — Sync guild data to site + poll config updates
// ============================================
const SITE_API_URL = (process.env.SITE_API_URL || 'https://overfrag.pt').replace(/\/+$/, '');
const SYNC_ENDPOINT = `${SITE_API_URL}/backend/bot/public/internal/sync`;
const POLL_ENDPOINT = `${SITE_API_URL}/backend/bot/public/internal/config-updates`;

async function syncToSite() {
    if (!client.user || !isConnected) return;
    try {
        const guilds = client.guilds.cache.map(g => ({
            id: g.id, name: g.name,
            icon: g.iconURL({ dynamic: true, size: 128 }),
            memberCount: g.memberCount
        }));

        const guildData = {};
        const configs = {};
        for (const guild of client.guilds.cache.values()) {
            guildData[guild.id] = {
                channels: guild.channels.cache
                    .filter(c => ['GUILD_TEXT','GUILD_NEWS','GUILD_VOICE','GUILD_CATEGORY'].includes(c.type))
                    .map(c => ({
                        id: c.id, name: c.name,
                        type: c.type === 'GUILD_VOICE' ? 'voice' : c.type === 'GUILD_CATEGORY' ? 'category' : 'text',
                        parent: c.parent?.name || null
                    }))
                    .sort((a, b) => a.name.localeCompare(b.name)),
                roles: guild.roles.cache
                    .filter(r => r.id !== guild.id && !r.managed)
                    .map(r => ({ id: r.id, name: r.name, color: r.hexColor, position: r.position }))
                    .sort((a, b) => b.position - a.position),
                info: {
                    id: guild.id, name: guild.name,
                    icon: guild.iconURL({ dynamic: true, size: 128 }),
                    memberCount: guild.memberCount
                }
            };
            configs[guild.id] = {
                welcome: getScopedConfig('welcome', guild.id, welcomeConfig),
                leave: getScopedConfig('leave', guild.id, leaveConfig),
                autorole: getScopedConfig('autorole', guild.id, autoroleConfig),
                suggestions: getScopedConfig('suggestions', guild.id, suggestionConfig),
                general: getScopedConfig('general', guild.id, generalConfig),
                teamFeed: getScopedConfig('teamFeed', guild.id, teamFeedConfig),
                serverStats: getScopedConfig('serverStats', guild.id, serverStatsConfig),
            };
        }

        const res = await fetch(SYNC_ENDPOINT, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${BOT_API_SECRET}`
            },
            body: JSON.stringify({ guilds, guildData, configs }),
            timeout: 15000
        });

        if (res.ok) {
            log('✅ Sync com site concluído');
        } else {
            logError('Sync com site falhou', { status: res.status, text: await res.text().catch(() => '') });
        }
    } catch (err) {
        logError('Erro ao sincronizar com site', err);
    }
}

async function pollConfigUpdates() {
    if (!client.user || !isConnected) return;
    try {
        const res = await fetch(POLL_ENDPOINT, {
            headers: { 'Authorization': `Bearer ${BOT_API_SECRET}` },
            timeout: 10000
        });

        if (!res.ok) return;
        const { updates } = await res.json();
        if (!Array.isArray(updates) || updates.length === 0) return;

        for (const update of updates) {
            const { guildId, section, data } = update;
            if (!guildId || !section || !data) continue;

            log(`📥 Config update recebido: ${section} para guild ${guildId}`);
            setScopedConfig(section, guildId, data);

            // Also update top-level config for main guild
            if (guildId === CONFIG.GUILD_ID) {
                switch (section) {
                    case 'welcome': welcomeConfig = { ...welcomeConfig, ...data }; break;
                    case 'leave': leaveConfig = { ...leaveConfig, ...data }; break;
                    case 'autorole': autoroleConfig = { ...autoroleConfig, ...data }; break;
                    case 'suggestions': suggestionConfig = { ...suggestionConfig, ...data }; break;
                    case 'general': generalConfig = { ...generalConfig, ...data }; break;
                    case 'teamFeed': teamFeedConfig = { ...teamFeedConfig, ...data }; break;
                    case 'serverStats': serverStatsConfig = { ...serverStatsConfig, ...data }; break;
                }
            }
        }

        saveConfig();
        log(`✅ ${updates.length} config update(s) aplicados`);
    } catch (err) {
        logError('Erro ao poll config updates', err);
    }
}

// Start sync + polling after bot connects
client.once('ready', () => {
    // Initial sync after 5 seconds (let caches populate)
    setTimeout(() => syncToSite(), 5000);
    // Re-sync every 5 minutes
    setInterval(() => syncToSite(), 5 * 60 * 1000);
    // Poll for config updates every 30 seconds
    setInterval(() => pollConfigUpdates(), 30 * 1000);
    log('🔄 Reverse push: sync + poll timers iniciados');
});

// ============================================
// SCHEDULED MESSAGES (simple cron with setInterval)
// ============================================
let scheduledTimers = [];

function parseCron(cron) {
    // Simple cron parser: minute hour dayOfMonth month dayOfWeek
    const parts = cron.trim().split(/\s+/);
    if (parts.length !== 5) return null;
    return { minute: parts[0], hour: parts[1], dayOfMonth: parts[2], month: parts[3], dayOfWeek: parts[4] };
}

function cronMatches(cron, now) {
    const c = parseCron(cron);
    if (!c) return false;
    const matches = (field, value) => {
        if (field === '*') return true;
        // Handle */n
        if (field.startsWith('*/')) {
            const n = parseInt(field.substring(2));
            return value % n === 0;
        }
        // Handle comma-separated
        return field.split(',').some(v => parseInt(v) === value);
    };
    return matches(c.minute, now.getMinutes()) &&
           matches(c.hour, now.getHours()) &&
           matches(c.dayOfMonth, now.getDate()) &&
           matches(c.month, now.getMonth() + 1) &&
           matches(c.dayOfWeek, now.getDay());
}

function setupScheduledMessages() {
    // Clear existing timers
    scheduledTimers.forEach(t => clearInterval(t));
    scheduledTimers = [];

    // Check every 60 seconds
    const timer = setInterval(async () => {
        if (!isConnected) return;
        const now = new Date();
        if (now.getSeconds() > 5) return; // Only fire in first 5 seconds of each minute

        for (const msg of scheduledMessages) {
            if (!msg.enabled) continue;
            if (!cronMatches(msg.cron, now)) continue;

            try {
                const guild = getMainGuild();
                if (!guild) continue;
                const channel = guild.channels.cache.get(msg.channel_id);
                if (!channel) continue;

                const sendOpts = {};
                if (msg.content) sendOpts.content = msg.content;
                if (msg.embed) {
                    const embed = new MessageEmbed();
                    if (msg.embed.title) embed.setTitle(msg.embed.title);
                    if (msg.embed.description) embed.setDescription(msg.embed.description);
                    if (msg.embed.color) embed.setColor(msg.embed.color);
                    if (msg.embed.image) embed.setImage(msg.embed.image);
                    if (msg.embed.thumbnail) embed.setThumbnail(msg.embed.thumbnail);
                    if (msg.embed.footer?.text) embed.setFooter({ text: msg.embed.footer.text, iconURL: msg.embed.footer.icon_url || undefined });
                    if (msg.embed.author?.name) embed.setAuthor({ name: msg.embed.author.name, url: msg.embed.author.url || undefined, iconURL: msg.embed.author.icon_url || undefined });
                    if (msg.embed.timestamp) embed.setTimestamp();
                    if (msg.embed.fields?.length > 0) msg.embed.fields.forEach(f => { if (f.name && f.value) embed.addField(f.name, f.value, !!f.inline); });
                    sendOpts.embeds = [embed];
                }

                if (sendOpts.content || sendOpts.embeds) {
                    await channel.send(sendOpts);
                    log(`Mensagem agendada enviada: ${msg.description || msg.id} -> #${channel.name}`);
                }
            } catch (err) {
                logError(`Erro ao enviar mensagem agendada ${msg.id}`, err);
            }
        }
    }, 60000); // Check every minute

    scheduledTimers.push(timer);
    log(`Scheduled messages setup: ${scheduledMessages.filter(m => m.enabled).length} ativas`);
}

// Setup after bot connects
client.once('ready', () => {
    setupScheduledMessages();
});

// ============================================
// GRACEFUL SHUTDOWN
// ============================================
process.on('SIGINT', async () => {
    log('SIGINT recebido, a desligar...');
    crons.stopAll();
    try { await asyncPersistState(); } catch(e) {}
    client.destroy();
    server.close();
    try { await cache.close(); } catch(e) {}
    try { await state.close(); } catch(e) {}
    process.exit(0);
});

process.on('SIGTERM', async () => {
    log('SIGTERM recebido, a desligar...');
    crons.stopAll();
    try { await asyncPersistState(); } catch(e) {}
    client.destroy();
    server.close();
    try { await cache.close(); } catch(e) {}
    try { await state.close(); } catch(e) {}
    process.exit(0);
});

process.on('uncaughtException', err => {
    logError('Uncaught Exception', err);
});

process.on('unhandledRejection', (reason, promise) => {
    logError('Unhandled Rejection', reason);
});

log('Bot inicializado, a aguardar conexão...');
