/**
 * Handler de Voice - Join to Create
 * discord.js v13 (compatível com shared hosting)
 */

import { Permissions } from 'discord.js';
import { CONFIG } from './config.js';

// Mapa de canais temporários: owner_id => channel_id
const tempChannels = new Map();

/**
 * Handler de mudança de estado de voz
 */
export async function handleVoiceStateUpdate(oldState, newState) {
    const member = newState.member || oldState.member;
    if (!member || member.guild.id !== CONFIG.GUILD_ID) return;
    
    // Entrou no canal "Join to Create"
    if (newState.channelId === CONFIG.channels.JOIN_TO_CREATE) {
        await createTempChannel(newState, member);
    }
    
    // Saiu de um canal - verificar se é temporário e está vazio
    if (oldState.channelId && oldState.channelId !== CONFIG.channels.JOIN_TO_CREATE) {
        await checkAndDeleteTempChannel(oldState);
    }
}

/**
 * Criar canal temporário
 */
async function createTempChannel(state, member) {
    try {
        const category = state.channel?.parent;
        const newChannel = await state.guild.channels.create(`🎮 ${member.displayName}`, {
            type: 'GUILD_VOICE',
            parent: category,
            permissionOverwrites: [
                {
                    id: member.id,
                    allow: [Permissions.FLAGS.MANAGE_CHANNELS, Permissions.FLAGS.MOVE_MEMBERS]
                }
            ]
        });
        
        await member.voice.setChannel(newChannel);
        tempChannels.set(member.id, newChannel.id);
        console.log(`[Bot] Canal temporário criado para ${member.displayName}`);
        
    } catch (err) {
        console.error('[Bot] Erro ao criar canal temporário:', err.message);
    }
}

/**
 * Verificar e eliminar canal temporário vazio
 */
async function checkAndDeleteTempChannel(oldState) {
    const channelId = oldState.channelId;
    const isTempChannel = Array.from(tempChannels.values()).includes(channelId);
    
    if (!isTempChannel) return;
    
    const channel = oldState.guild.channels.cache.get(channelId);
    if (channel && channel.members.size === 0) {
        setTimeout(async () => {
            try {
                const ch = await oldState.guild.channels.fetch(channelId).catch(() => null);
                if (ch && ch.members.size === 0) {
                    await ch.delete();
                    // Remover do map
                    for (const [ownerId, chId] of tempChannels) {
                        if (chId === channelId) {
                            tempChannels.delete(ownerId);
                            break;
                        }
                    }
                    console.log(`[Bot] Canal temporário eliminado`);
                }
            } catch (err) {
                console.error('[Bot] Erro ao eliminar canal:', err.message);
            }
        }, CONFIG.settings.TEMP_CHANNEL_DELETE_DELAY);
    }
}

/**
 * Obter lista de canais temporários
 */
export function getTempChannels() {
    return new Map(tempChannels);
}

export default { handleVoiceStateUpdate, getTempChannels };
