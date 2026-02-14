/**
 * Music Module - OVERFRAG Bot
 * Uses @discordjs/voice + play-dl for YouTube playback
 * discord.js v13
 */

import {
    joinVoiceChannel,
    createAudioPlayer,
    createAudioResource,
    AudioPlayerStatus,
    VoiceConnectionStatus,
    entersState,
    getVoiceConnection,
    NoSubscriberBehavior
} from '@discordjs/voice';
import play from 'play-dl';
import { MessageEmbed } from 'discord.js';
import { CONFIG } from './config.js';

// Per-guild music queues
const queues = new Map();

/**
 * Get or create a queue for a guild
 */
function getQueue(guildId) {
    if (!queues.has(guildId)) {
        queues.set(guildId, {
            songs: [],
            player: null,
            connection: null,
            playing: false,
            currentSong: null,
            volume: 0.5,
            loop: false
        });
    }
    return queues.get(guildId);
}

/**
 * Play a song or add to queue
 */
export async function handlePlay(interaction) {
    const query = interaction.options.getString('query');
    const voiceChannel = interaction.member?.voice?.channel;

    if (!voiceChannel) {
        return interaction.reply({ content: '❌ Precisas de estar num canal de voz!', ephemeral: true });
    }

    await interaction.deferReply();

    try {
        let songInfo;

        // Check if it's a URL or search query
        if (play.yt_validate(query) === 'video') {
            const info = await play.video_info(query);
            songInfo = {
                title: info.video_details.title,
                url: info.video_details.url,
                duration: info.video_details.durationRaw,
                thumbnail: info.video_details.thumbnails?.[0]?.url,
                requestedBy: interaction.user.tag
            };
        } else {
            // Search YouTube
            const results = await play.search(query, { limit: 1 });
            if (!results || results.length === 0) {
                return interaction.editReply('❌ Nenhum resultado encontrado.');
            }
            const video = results[0];
            songInfo = {
                title: video.title,
                url: video.url,
                duration: video.durationRaw,
                thumbnail: video.thumbnails?.[0]?.url,
                requestedBy: interaction.user.tag
            };
        }

        const queue = getQueue(interaction.guildId);

        // Join voice channel if not connected
        if (!queue.connection || queue.connection.state.status === VoiceConnectionStatus.Destroyed) {
            queue.connection = joinVoiceChannel({
                channelId: voiceChannel.id,
                guildId: interaction.guildId,
                adapterCreator: interaction.guild.voiceAdapterCreator,
                selfDeaf: true,
                selfMute: false
            });

            // Create audio player
            queue.player = createAudioPlayer({
                behaviors: { noSubscriber: NoSubscriberBehavior.Pause }
            });
            queue.connection.subscribe(queue.player);

            // Handle player idle (song ended)
            queue.player.on(AudioPlayerStatus.Idle, () => {
                queue.currentSong = null;
                if (queue.songs.length > 0) {
                    playNext(interaction.guildId);
                } else {
                    queue.playing = false;
                    // Disconnect after 2 minutes of inactivity
                    setTimeout(() => {
                        const q = queues.get(interaction.guildId);
                        if (q && !q.playing && q.songs.length === 0) {
                            destroyQueue(interaction.guildId);
                        }
                    }, 2 * 60 * 1000);
                }
            });

            queue.player.on('error', (err) => {
                console.error('[Music] Player error:', err.message);
                queue.currentSong = null;
                if (queue.songs.length > 0) {
                    playNext(interaction.guildId);
                }
            });

            // Handle connection disconnect
            queue.connection.on(VoiceConnectionStatus.Disconnected, async () => {
                try {
                    await Promise.race([
                        entersState(queue.connection, VoiceConnectionStatus.Signalling, 5000),
                        entersState(queue.connection, VoiceConnectionStatus.Connecting, 5000)
                    ]);
                } catch {
                    destroyQueue(interaction.guildId);
                }
            });
        }

        // Add to queue
        queue.songs.push(songInfo);

        if (!queue.playing) {
            playNext(interaction.guildId);
            const embed = new MessageEmbed()
                .setColor(CONFIG.branding.COLOR_PRIMARY)
                .setTitle('🎵 A Tocar')
                .setDescription(`[${songInfo.title}](${songInfo.url})`)
                .addField('Duração', songInfo.duration || 'N/A', true)
                .addField('Pedido por', songInfo.requestedBy, true)
                .setThumbnail(songInfo.thumbnail || '')
                .setFooter({ text: 'OVERFRAG Music' });
            await interaction.editReply({ embeds: [embed] });
        } else {
            const embed = new MessageEmbed()
                .setColor(0x00ff88)
                .setTitle('📋 Adicionado à Fila')
                .setDescription(`[${songInfo.title}](${songInfo.url})`)
                .addField('Posição', `#${queue.songs.length}`, true)
                .addField('Pedido por', songInfo.requestedBy, true)
                .setFooter({ text: 'OVERFRAG Music' });
            await interaction.editReply({ embeds: [embed] });
        }
    } catch (err) {
        console.error('[Music] Play error:', err);
        await interaction.editReply('❌ Erro ao tocar a música. Tenta novamente.');
    }
}

/**
 * Play next song in queue
 */
async function playNext(guildId) {
    const queue = queues.get(guildId);
    if (!queue || queue.songs.length === 0) return;

    const song = queue.songs.shift();
    queue.currentSong = song;
    queue.playing = true;

    try {
        const stream = await play.stream(song.url, {
            discordPlayerCompatibility: true,
            quality: 2  // 0=lowest, 1=medium, 2=highest
        });
        const resource = createAudioResource(stream.stream, {
            inputType: stream.type,
            inlineVolume: true
        });
        resource.volume?.setVolume(queue.volume);
        queue.player.play(resource);
        
        // Log successful stream start
        console.log(`[Music] Now streaming: ${song.title}`);
    } catch (err) {
        console.error('[Music] Stream error:', err.message);
        
        // Try refreshing play-dl token and retry once
        try {
            if (play.refreshToken) await play.refreshToken();
            const stream = await play.stream(song.url, { discordPlayerCompatibility: true });
            const resource = createAudioResource(stream.stream, {
                inputType: stream.type,
                inlineVolume: true
            });
            resource.volume?.setVolume(queue.volume);
            queue.player.play(resource);
            console.log(`[Music] Retry succeeded: ${song.title}`);
        } catch (retryErr) {
            console.error('[Music] Retry failed:', retryErr.message);
            queue.currentSong = null;
            // Try next song
            if (queue.songs.length > 0) {
                playNext(guildId);
            } else {
                queue.playing = false;
            }
        }
    }
}

/**
 * Destroy queue and disconnect
 */
function destroyQueue(guildId) {
    const queue = queues.get(guildId);
    if (!queue) return;

    queue.songs = [];
    queue.currentSong = null;
    queue.playing = false;

    if (queue.player) {
        queue.player.stop(true);
    }
    if (queue.connection) {
        try { queue.connection.destroy(); } catch {}
    }

    queues.delete(guildId);
}

/**
 * Skip current song
 */
export async function handleSkip(interaction) {
    const queue = queues.get(interaction.guildId);
    if (!queue || !queue.playing) {
        return interaction.reply({ content: '❌ Nada a tocar de momento.', ephemeral: true });
    }

    const skipped = queue.currentSong?.title || 'Desconhecido';
    queue.player.stop(); // This triggers Idle event which plays next
    await interaction.reply(`⏭️ **${skipped}** saltada!`);
}

/**
 * Stop and clear queue
 */
export async function handleStop(interaction) {
    const queue = queues.get(interaction.guildId);
    if (!queue) {
        return interaction.reply({ content: '❌ Nada a tocar de momento.', ephemeral: true });
    }

    destroyQueue(interaction.guildId);
    await interaction.reply('⏹️ Música parada e fila limpa.');
}

/**
 * Pause current song
 */
export async function handlePause(interaction) {
    const queue = queues.get(interaction.guildId);
    if (!queue || !queue.playing) {
        return interaction.reply({ content: '❌ Nada a tocar de momento.', ephemeral: true });
    }

    if (queue.player.state.status === AudioPlayerStatus.Paused) {
        return interaction.reply({ content: '⏸️ Já está pausado. Usa `/resume` para retomar.', ephemeral: true });
    }

    queue.player.pause();
    await interaction.reply(`⏸️ Pausado: **${queue.currentSong?.title}**`);
}

/**
 * Resume paused song
 */
export async function handleResume(interaction) {
    const queue = queues.get(interaction.guildId);
    if (!queue || !queue.currentSong) {
        return interaction.reply({ content: '❌ Nada para retomar.', ephemeral: true });
    }

    if (queue.player.state.status !== AudioPlayerStatus.Paused) {
        return interaction.reply({ content: '▶️ Já está a tocar.', ephemeral: true });
    }

    queue.player.unpause();
    await interaction.reply(`▶️ Retomado: **${queue.currentSong?.title}**`);
}

/**
 * Show queue
 */
export async function handleQueue(interaction) {
    const queue = queues.get(interaction.guildId);
    if (!queue || (!queue.currentSong && queue.songs.length === 0)) {
        return interaction.reply({ content: '📋 A fila está vazia.', ephemeral: true });
    }

    let description = '';
    if (queue.currentSong) {
        description += `🎵 **A tocar:** [${queue.currentSong.title}](${queue.currentSong.url})\n\n`;
    }

    if (queue.songs.length > 0) {
        description += '**Próximas:**\n';
        queue.songs.slice(0, 10).forEach((song, i) => {
            description += `\`${i + 1}.\` [${song.title}](${song.url}) — ${song.duration || 'N/A'}\n`;
        });
        if (queue.songs.length > 10) {
            description += `\n...e mais ${queue.songs.length - 10} músicas`;
        }
    }

    const embed = new MessageEmbed()
        .setColor(CONFIG.branding.COLOR_PRIMARY)
        .setTitle('📋 Fila de Músicas')
        .setDescription(description)
        .setFooter({ text: `${queue.songs.length + (queue.currentSong ? 1 : 0)} músicas na fila` });

    await interaction.reply({ embeds: [embed] });
}

/**
 * Now playing
 */
export async function handleNowPlaying(interaction) {
    const queue = queues.get(interaction.guildId);
    if (!queue || !queue.currentSong) {
        return interaction.reply({ content: '❌ Nada a tocar de momento.', ephemeral: true });
    }

    const song = queue.currentSong;
    const embed = new MessageEmbed()
        .setColor(CONFIG.branding.COLOR_PRIMARY)
        .setTitle('🎵 A Tocar Agora')
        .setDescription(`[${song.title}](${song.url})`)
        .addField('Duração', song.duration || 'N/A', true)
        .addField('Pedido por', song.requestedBy, true)
        .addField('Na fila', `${queue.songs.length} músicas`, true)
        .setThumbnail(song.thumbnail || '')
        .setFooter({ text: 'OVERFRAG Music' });

    await interaction.reply({ embeds: [embed] });
}

export default {
    handlePlay,
    handleSkip,
    handleStop,
    handlePause,
    handleResume,
    handleQueue,
    handleNowPlaying
};
