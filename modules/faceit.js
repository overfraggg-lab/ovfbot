/**
 * Faceit API - Buscar stats de jogadores
 * discord.js v13 (compatível com shared hosting)
 */

import { MessageEmbed } from 'discord.js';
import { CONFIG } from './config.js';

// Cache de stats
const faceitCache = new Map();

/**
 * Buscar stats de um jogador na Faceit
 */
export async function fetchFaceitStats(nickname) {
    // Check cache
    const cached = faceitCache.get(nickname.toLowerCase());
    if (cached && Date.now() - cached.timestamp < CONFIG.faceit.CACHE_TTL) {
        return cached.data;
    }
    
    if (!CONFIG.faceit.API_KEY) {
        console.warn('[Bot] Faceit API key não configurada');
        return null;
    }
    
    try {
        // Buscar jogador
        const playerRes = await fetch(`${CONFIG.faceit.BASE_URL}/players?nickname=${encodeURIComponent(nickname)}&game=cs2`, {
            headers: { 'Authorization': `Bearer ${CONFIG.faceit.API_KEY}` }
        });
        
        if (!playerRes.ok) return null;
        const player = await playerRes.json();
        
        // Buscar stats
        const statsRes = await fetch(`${CONFIG.faceit.BASE_URL}/players/${player.player_id}/stats/cs2`, {
            headers: { 'Authorization': `Bearer ${CONFIG.faceit.API_KEY}` }
        });
        
        let stats = {};
        if (statsRes.ok) {
            stats = await statsRes.json();
        }
        
        const result = { player, stats };
        
        // Guardar em cache
        faceitCache.set(nickname.toLowerCase(), {
            timestamp: Date.now(),
            data: result
        });
        
        return result;
        
    } catch (err) {
        console.error('[Bot] Erro Faceit API:', err.message);
        return null;
    }
}

/**
 * Construir embed com stats do jogador
 */
export function buildFaceitEmbed(data) {
    const { player, stats } = data;
    const cs2 = player.games?.cs2 || player.games?.csgo || {};
    const lifetime = stats.lifetime || {};
    
    const level = cs2.skill_level || 1;
    const elo = cs2.faceit_elo || 0;
    const wins = parseInt(lifetime.Wins) || 0;
    const matches = parseInt(lifetime['Total Matches']) || parseInt(lifetime.Matches) || 0;
    const kd = parseFloat(lifetime['Average K/D Ratio']) || 0;
    const hs = parseFloat(lifetime['Average Headshots %']) || 0;
    const winrate = matches > 0 ? Math.round((wins / matches) * 100) : 0;
    
    // Cor baseada no level
    const levelColors = {
        1: 0xEE4B2B, 2: 0xEE4B2B,
        3: 0xFF7F00, 4: 0xFF7F00,
        5: 0xFFBF00, 6: 0xFFBF00,
        7: 0x32CD32, 8: 0x32CD32,
        9: 0xFF4500, 10: 0xFF4500
    };
    
    return new MessageEmbed()
        .setColor(levelColors[level] || 0xFF6600)
        .setAuthor(player.nickname, player.avatar || undefined, `https://www.faceit.com/en/players/${player.nickname}`)
        .setThumbnail(`https://cdn-frontend.faceit.com/web/960/src/app/assets/images-compress/skill-icons/skill_level_${level}_svg.svg`)
        .addFields(
            { name: '🎯 Level', value: `**${level}** (${elo} ELO)`, inline: true },
            { name: '🏆 Win Rate', value: `${winrate}%`, inline: true },
            { name: '📊 K/D', value: kd.toFixed(2), inline: true },
            { name: '🎮 Partidas', value: `${matches}`, inline: true },
            { name: '✅ Vitórias', value: `${wins}`, inline: true },
            { name: '🎯 HS%', value: `${hs.toFixed(1)}%`, inline: true }
        )
        .setFooter('Dados da Faceit', 'https://www.faceit.com/favicon.ico')
        .setTimestamp();
}

/**
 * Limpar cache
 */
export function clearCache() {
    faceitCache.clear();
}

export default { fetchFaceitStats, buildFaceitEmbed, clearCache };
