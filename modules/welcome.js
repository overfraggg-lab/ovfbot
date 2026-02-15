/**
 * Handler de Welcome - Mensagens de boas-vindas
 * Estilo com banner, links clicáveis para canais e branding OVERFRAG
 */

import { MessageEmbed } from 'discord.js';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { CONFIG } from './config.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// IDs dos canais para os links
const CHANNELS = {
    INFORMACOES: '1260254653439021218',
    TICKET:      '1260254653749268572',
    NOTICIAS:    '1461833008418914569',
    FACEIT_CLUB: '1466661867815698553',
};

/**
 * Handler quando um membro entra no servidor
 */
export async function handleMemberJoin(member) {
    if (member.guild.id !== CONFIG.GUILD_ID) return;

    try {
        const welcomeChannel = member.guild.channels.cache.get(CONFIG.channels.WELCOME);
        if (!welcomeChannel) {
            console.warn('[Bot] Canal de welcome não encontrado');
            return;
        }

        // Assets
        const bannerPath = path.join(__dirname, '..', 'assets', 'banner.jpg');
        const logoPath   = path.join(__dirname, '..', 'assets', 'logo.png');
        const files = [];

        if (fs.existsSync(bannerPath)) files.push({ attachment: bannerPath, name: 'banner.jpg' });
        if (fs.existsSync(logoPath))   files.push({ attachment: logoPath,   name: 'logo.png' });

        // Hora atual formatada
        const now = new Date();
        const hora = now.toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' });

        const embed = new MessageEmbed()
            .setColor(CONFIG.branding.COLOR_PRIMARY)
            .setTitle(`Bem-vindo à OVERFRAG!`)
            .setDescription(
                `Olá <@${member.id}>! Bem-vindo ao servidor da **OVERFRAG**, a casa do CS2 português!\n`
            )
            .addFields(
                {
                    name: '🏆 CS2 Português',
                    value:
                        `A maior comunidade de CS2 em Portugal\n` +
                        `➜ <#${CHANNELS.INFORMACOES}>\n` +
                        `➜ <#${CHANNELS.FACEIT_CLUB}>`,
                    inline: true,
                },
                {
                    name: '📰 Notícias',
                    value:
                        `Fica a par de tudo em [overfrag.pt](${CONFIG.branding.SITE_URL})\n` +
                        `➜ <#${CHANNELS.NOTICIAS}>`,
                    inline: true,
                },
                {
                    name: '\u200B',   // separador
                    value: '\u200B',
                    inline: false,
                },
                {
                    name: '👋 Introdução',
                    value: `Fica a saber mais e confere o canal\n➜ <#${CHANNELS.INFORMACOES}>`,
                    inline: true,
                },
                {
                    name: '🎫 Precisas de ajuda?',
                    value: `Caso tenhas alguma dúvida ou problema, abre um\n➜ <#${CHANNELS.TICKET}>`,
                    inline: true,
                },
            )
            .setThumbnail(member.user.displayAvatarURL({ dynamic: true, size: 256 }))
            .setFooter({
                text: `OVERFRAG – A tua fonte de CS2 • Hoje às ${hora}`,
                iconURL: 'attachment://logo.png',
            });

        // Banner em baixo do embed (como a Loritta)
        if (files.some(f => f.name === 'banner.jpg')) {
            embed.setImage('attachment://banner.jpg');
        }

        await welcomeChannel.send({ embeds: [embed], files });
        console.log(`[Bot] Welcome enviado para ${member.user.tag}`);

        // Agendar role após delay
        scheduleRoleAssignment(member);

    } catch (err) {
        console.error('[Bot] Erro no welcome:', err.message);
    }
}

/**
 * Agendar atribuição de role após delay
 */
function scheduleRoleAssignment(member) {
    setTimeout(async () => {
        try {
            const role = member.guild.roles.cache.find(r => r.name === CONFIG.roles.COMUNIDADE);
            if (role) {
                const currentMember = await member.guild.members.fetch(member.id).catch(() => null);
                if (currentMember) {
                    await currentMember.roles.add(role);
                    console.log(`[Bot] Role adicionada a ${member.user.tag}`);
                }
            }
        } catch (err) {
            console.error('[Bot] Erro ao adicionar role:', err.message);
        }
    }, CONFIG.settings.WELCOME_ROLE_DELAY);
}

export default { handleMemberJoin };
