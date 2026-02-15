/**
 * Handler de Interações - Comandos slash
 */

import { MessageEmbed } from 'discord.js';
import { fetchFaceitStats, buildFaceitEmbed } from './faceit.js';
import { CONFIG } from './config.js';
import { handlePlay, handleSkip, handleStop, handlePause, handleResume, handleQueue, handleNowPlaying } from './music.js';

/**
 * Handler principal de interações
 */
export async function handleInteraction(interaction) {
    if (!interaction.isChatInputCommand()) return;
    
    switch (interaction.commandName) {
        case 'faceit':
            await handleFaceitCommand(interaction);
            break;
        case 'ping':
            await handlePingCommand(interaction);
            break;
        case 'info':
            await handleInfoCommand(interaction);
            break;
        case 'site':
            await handleSiteCommand(interaction);
            break;
        // Music commands
        case 'play':
            await handlePlay(interaction);
            break;
        case 'skip':
            await handleSkip(interaction);
            break;
        case 'stop':
            await handleStop(interaction);
            break;
        case 'pause':
            await handlePause(interaction);
            break;
        case 'resume':
            await handleResume(interaction);
            break;
        case 'queue':
            await handleQueue(interaction);
            break;
        case 'np':
            await handleNowPlaying(interaction);
            break;
        default:
            break;
    }
}

/**
 * Comando /faceit - Mostra stats de um jogador
 */
async function handleFaceitCommand(interaction) {
    const nickname = interaction.options.getString('nickname');
    await interaction.deferReply();
    
    try {
        const stats = await fetchFaceitStats(nickname);
        if (!stats) {
            return interaction.editReply(`❌ Jogador **${nickname}** não encontrado na Faceit.`);
        }
        
        const embed = buildFaceitEmbed(stats);
        await interaction.editReply({ embeds: [embed] });
        
    } catch (err) {
        console.error('[Bot] Erro no comando faceit:', err.message);
        await interaction.editReply('❌ Erro ao buscar dados da Faceit.');
    }
}

/**
 * Comando /ping - Verifica latência
 */
async function handlePingCommand(interaction) {
    const latency = Date.now() - interaction.createdTimestamp;
    const apiLatency = Math.round(interaction.client.ws.ping);
    
    const embed = new MessageEmbed()
        .setColor(CONFIG.branding.COLOR_PRIMARY)
        .setTitle('🏓 Pong!')
        .addField('Latência', `${latency}ms`, true)
        .addField('API', `${apiLatency}ms`, true)
        .setFooter({ text: 'OVERFRAG Bot' })
        .setTimestamp();
    
    await interaction.reply({ embeds: [embed] });
}

/**
 * Comando /info - Informação do bot
 */
async function handleInfoCommand(interaction) {
    const embed = new MessageEmbed()
        .setColor(CONFIG.branding.COLOR_PRIMARY)
        .setTitle('ℹ️ OVERFRAG Bot')
        .setDescription('Bot oficial da comunidade OVERFRAG - Esports Portugal')
        .addField('🌐 Site', '[overfrag.pt](https://overfrag.pt)', true)
        .addField('🐦 Twitter', '[@overfrag_pt](https://twitter.com/overfrag_pt)', true)
        .addField('📸 Instagram', '[@overfrag.pt](https://instagram.com/overfrag.pt)', true)
        .addField('Comandos', '`/faceit` - Stats FACEIT\n`/ping` - Latência\n`/site` - Link do site')
        .setThumbnail(CONFIG.branding.LOGO_URL)
        .setFooter({ text: 'OVERFRAG Bot v3.0' })
        .setTimestamp();
    
    await interaction.reply({ embeds: [embed] });
}

/**
 * Comando /site - Link do site
 */
async function handleSiteCommand(interaction) {
    const embed = new MessageEmbed()
        .setColor(CONFIG.branding.COLOR_PRIMARY)
        .setTitle('🌐 OVERFRAG')
        .setDescription('O teu portal de esports português!')
        .setURL('https://overfrag.pt')
        .addField('📰 Notícias', '[overfrag.pt/noticias](https://overfrag.pt/noticias)', true)
        .addField('🏆 Rankings', '[overfrag.pt/rankings](https://overfrag.pt/rankings)', true)
        .addField('👥 Equipas', '[overfrag.pt/equipas](https://overfrag.pt/equipas)', true)
        .setThumbnail(CONFIG.branding.LOGO_URL)
        .setFooter({ text: 'OVERFRAG - Esports Portugal' });
    
    await interaction.reply({ embeds: [embed] });
}

export default { handleInteraction };
