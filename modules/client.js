/**
 * Cliente Discord - Criação e gestão
 * discord.js v13 (compatível com shared hosting)
 */

import { Client, Intents } from 'discord.js';

let client = null;
let isConnected = false;
let startTime = null;
let onlineCount = 0;

/**
 * Criar instância do cliente Discord
 */
export function createClient() {
    return new Client({
        intents: [
            Intents.FLAGS.GUILDS,
            Intents.FLAGS.GUILD_MEMBERS,
            Intents.FLAGS.GUILD_MESSAGES,
            Intents.FLAGS.MESSAGE_CONTENT,
            Intents.FLAGS.GUILD_VOICE_STATES,
            Intents.FLAGS.GUILD_MESSAGE_REACTIONS
        ],
        partials: ['MESSAGE', 'CHANNEL', 'REACTION']
    });
}

/**
 * Obter cliente atual
 */
export function getClient() {
    return client;
}

/**
 * Definir cliente
 */
export function setClient(c) {
    client = c;
}

/**
 * Estado de conexão
 */
export function isClientConnected() {
    return isConnected;
}

export function setConnected(state) {
    isConnected = state;
    if (state) {
        startTime = Date.now();
    } else {
        startTime = null;
    }
}

/**
 * Obter uptime
 */
export function getUptime() {
    return startTime ? Date.now() - startTime : 0;
}

/**
 * Definir presença do bot
 */
export function setPresence(activityName = 'overfrag.pt', type = 'WATCHING') {
    if (client && isConnected) {
        client.user.setPresence({
            activities: [{ name: activityName, type }],
            status: 'online'
        });
    }
}

/**
 * Update presence showing online member count
 */
export async function updateOnlineCount() {
    if (!client || !isConnected) return 0;
    try {
        const guildId = process.env.DISCORD_GUILD_ID || '1260254650964119716';
        const guild = client.guilds.cache.get(guildId);
        if (!guild) return 0;
        
        // Fetch all members to get accurate presence data
        await guild.members.fetch({ withPresences: true });
        
        const count = guild.members.cache.filter(m => 
            m.presence && m.presence.status !== 'offline' && !m.user.bot
        ).size;
        
        onlineCount = count;
        
        // Update bot presence to show online count
        setPresence(`${count} membros online`, 'WATCHING');
        
        return count;
    } catch (err) {
        console.error('Error updating online count:', err.message);
        return onlineCount;
    }
}

/**
 * Get current cached online count
 */
export function getOnlineCount() {
    return onlineCount;
}

/**
 * Obter status do bot
 */
export function getBotStatus() {
    return {
        online: isConnected,
        tag: client?.user?.tag || 'Offline',
        uptime: getUptime(),
        ping: client?.ws?.ping || 0,
        guilds: client?.guilds?.cache?.size || 0,
        onlineMembers: onlineCount
    };
}

export default {
    createClient,
    getClient,
    setClient,
    isClientConnected,
    setConnected,
    getUptime,
    setPresence,
    updateOnlineCount,
    getOnlineCount,
    getBotStatus
};
