/**
 * Configuração do OVERFRAG Discord Bot
 * Usa getters para ler variáveis de ambiente no momento do acesso
 */

export const CONFIG = {
    // Token do bot - getter para ler no momento certo
    get TOKEN() {
        return process.env.DISCORD_BOT_TOKEN || process.env.DISCORD_TOKEN;
    },
    
    // Servidor principal
    get GUILD_ID() {
        return process.env.DISCORD_GUILD_ID || '1260254650964119716';
    },
    
    // Canais
    channels: {
        get WELCOME() { return process.env.DISCORD_CHANNEL_WELCOME || '1468000306368483339'; },
        get NEWS() { return process.env.DISCORD_CHANNEL_NEWS || '1461833008418914569'; },
        get JOIN_TO_CREATE() { return process.env.DISCORD_CHANNEL_JOIN_TO_CREATE || '1467990263447425095'; },
        get LOGS() { return process.env.DISCORD_CHANNEL_LOGS || null; }
    },
    
    // Categorias
    categories: {
        get VOICE() { return process.env.DISCORD_CATEGORY_VOICE || '1260254650964119716'; },
        get TICKETS() { return process.env.DISCORD_CATEGORY_TICKETS || '1260254653749268572'; }
    },
    
    // Roles
    roles: {
        COMUNIDADE: '🕹️ - COMUNIDADE - 🕹️'
    },
    
    // Settings
    settings: {
        WELCOME_ROLE_DELAY: 10 * 60 * 1000, // 10 minutos
        TEMP_CHANNEL_DELETE_DELAY: 5000
    },
    
    // Branding
    branding: {
        SITE_URL: 'https://overfrag.pt',
        COLOR_PRIMARY: 0xFF6600,
        COLOR_SUCCESS: 0x00FF00,
        COLOR_ERROR: 0xFF0000,
        LOGO_URL: 'https://overfrag.pt/assets/img/logo.png'
    },
    
    // Faceit
    faceit: {
        get API_KEY() { return process.env.FACEIT_API_KEY || process.env.FACEIT_KEY || ''; },
        BASE_URL: 'https://open.faceit.com/data/v4',
        CACHE_TTL: 60 * 1000
    }
};

export default CONFIG;
