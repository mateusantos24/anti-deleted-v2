// ATENCÃO.....
// Colocar igual no exemplo de código.
// Se for ESLint usando isso, pode ignorar — não é bug nem erro.

/*
    Esse local é restrito em nível máximo, usar ele na exec pode causar danos.
    Portanto, não existe função Ambient ou demais funções de exports, não utilize.
    NÃO DELETE ESSA PASTA OU ARQUIVO!
*/

/* Requires */
const ffmpeglocation = require('@ffmpeg-installer/ffmpeg');
global.fluent_ffmpeg_1 = require('fluent-ffmpeg');
const Indexer = require('../../index');
const extender = require('./messages');

// Sistema Anti-Delete
const AntiDeleteEventManager = require('./antiDeleteEventManager');
const AntiDeleteDB = require('./deletev2'); // ✅ Usando versão v2

const EVENTOLOGS = 'ID_DO_SEU_GRUPO_DE_LOGS_AQUI@g.us'; // Coloque o ID do grupo de logs aqui exemplo "123456789@g.us"

// ✅ FUNÇÃO: Validar se o grupo de logs está configurado corretamente
function isValidGroupId(groupId) {
    // Verifica se não é o placeholder padrão
    if (groupId === 'ID_DO_SEU_GRUPO_DE_LOGS_AQUI@g.us') {
        return false;
    }

    // Verifica se tem o formato correto: números@g.us
    const validGroupPattern = /^\d+@g\.us$/;
    return validGroupPattern.test(groupId);
}

// ✅ VERIFICAR SE O ANTI-DELETE DEVE SER ATIVO
const ANTI_DELETE_ENABLED = isValidGroupId(EVENTOLOGS);
// ✅ LOGS DE STATUS DO ANTI-DELETE
if (!ANTI_DELETE_ENABLED) {
    console.warn('[ANTI-DELETE]: Grupo de logs NÃO está configurado corretamente. Anti-Delete desabilitado.');
    console.warn('[ANTI-DELETE]: Por favor configure EVENTOLOGS com um valor válido, exemplo: "123456789@g.us"');
} else {
    console.log('[ANTI-DELETE]: Grupo de logs configurado com sucesso! Anti-Delete ativado.');
    console.log(`[ANTI-DELETE]: Monitorando grupo: ${EVENTOLOGS}`);
}

// ✅ FUNÇÃO: Extrair coordenadas e dados da descrição
function parseLocationData(content) {
    const data = {};

    // Extrair coordenadas
    const coordMatch = content.match(/🌍 Coordenadas:\s*([-\d.]+),\s*([-\d.]+)/);
    if (coordMatch) {
        data.latitude = parseFloat(coordMatch[1]);
        data.longitude = parseFloat(coordMatch[2]);
    }

    // Extrair nome
    const nameMatch = content.match(/📍 Nome:\s*(.+)/);
    if (nameMatch) {
        data.name = nameMatch[1].trim();
    }

    // Extrair endereço
    const addressMatch = content.match(/📮 Endereço:\s*(.+)/);
    if (addressMatch) {
        data.address = addressMatch[1].trim();
    }

    // Extrair URL
    const urlMatch = content.match(/🔗 URL:\s*(.+)/);
    if (urlMatch) {
        data.url = urlMatch[1].trim();
    }
    return data;
}

// ✅ FUNÇÃO AVANÇADA: Enviar localização como locationMessage nativo
async function sendLocationMessage(kill, chatId, message, quoted) {
    // Extrair dados da descrição
    const locationData = parseLocationData(message.content);

    if (!locationData.latitude || !locationData.longitude) {
        throw new Error('Coordenadas não encontradas');
    }

    console.log('[LOCATION NATIVE] Enviando como locationMessage:', locationData);

    // ✅ CONSTRUIR COMO BAILEYS NATIVO
    const locationMessage = {
        degreesLatitude: locationData.latitude,
        degreesLongitude: locationData.longitude,
    };

    // Adicionar campos opcionais se disponíveis
    if (locationData.name) {
        locationMessage.name = locationData.name;
    }

    if (locationData.address) {
        locationMessage.address = locationData.address;
    }

    if (locationData.url) {
        locationMessage.url = locationData.url;
    }

    // Adicionar thumbnail se disponível
    if (message.media && Buffer.isBuffer(message.media)) {
        locationMessage.jpegThumbnail = message.media;
    }

    // ✅ ENVIAR COM CONTEXTINFO SE QUOTED
    const messageData = {
        locationMessage,
    };

    if (quoted) {
        messageData.contextInfo = {
            stanzaId: quoted.key.id,
            participant: quoted.key.participant || quoted.key.remoteJid,
            quotedMessage: quoted.message,
            remoteJid: quoted.key.remoteJid,
        };
    }
    await kill.sendMessage(chatId, messageData);
}

/* Ajusta o ffmpeg para sobrepor o uso dos módulos que usem ele */
global.fluent_ffmpeg_1.setFfmpegPath(ffmpeglocation.path);
global.irisNumber = false;

/* Define uma let para armazenar se rodou com sucesso */
let sucessfulInit = false;

/**
 * Cria um listener para processar eventos do WhatsApp.
 * @function createListener
 * @param {Object} kill - Objeto principal que contém a sessão e métodos do WhatsApp.
 * @param {Function} saveCreds - Função para salvar as credenciais da sessão.
 * @param {Function} genSession - Função para gerar ou recarregar a sessão.
 * @param {Object} startOptions - Opções de inicialização para a sessão.
 * @param {number} indexlaunch - Índice de inicialização para controle de múltiplas sessões.
 * @param {Object} launchInstance - Objeto para as configurações de inicialização.
 * @returns {void}
 */
function createListener(kill, saveCreds, genSession, startOptions, indexlaunch, launchInstance) {
    /* Caso a função raiz seja inválida */
    if (
        typeof kill === 'object'
        && [saveCreds, genSession].some((t) => typeof t === 'function')
        && typeof startOptions === 'object'
        && typeof launchInstance === 'object'
        && /[0-9]+/g.test(indexlaunch)
    ) {
        // ✅ Configurar listener de notificações
        if (ANTI_DELETE_ENABLED) {
            AntiDeleteEventManager.on('sendNotification', async ({ chatId, message, quoted }) => {
                try {
                    console.log('[NOTIFICATION] Enviando notificação:', { chatId, messageType: message.type });

                    // ✅ CONTATO INDIVIDUAL (vCard único)
                    if (message.type === 'contact' && message.vcard) {
                        console.log('[CONTACT START] Processando contato deletado');

                        // Primeira mensagem: Aviso
                        await kill.sendMessage(chatId, {
                            text: message.content || '📇 Contato recuperado:',
                        }, { quoted: quoted });

                        // Aguarda um pouco antes de enviar o cartão
                        await new Promise(resolve => setTimeout(resolve, 2000));

                        try {
                        // Extrai displayName corretamente
                            const displayName = message.vcard.match(/FN:([^\n\r]*)/)?.[1] || 'Contato Recuperado';

                            // Envia como contato funcional
                            await kill.sendMessage(chatId, {
                                contacts: {
                                    displayName: displayName,
                                    contacts: [{
                                        vcard: message.vcard,
                                    }],
                                },
                            });
                        } catch (error) {
                            console.error('[CONTACT ERROR]:', error);
                            await kill.sendMessage(chatId, {
                                text: `📇 **vCard Recuperado:**\n\`\`\`\n${message.vcard}\n\`\`\``,
                            });
                        }
                        return; // Sai após processar o contato individual
                    }

                    // ✅ MÚLTIPLOS CONTATOS (vCard múltiplo)
                    else if (message.type === 'contacts' && message.vcard) {
                        console.log('[CONTACTS MULTIPLO] Processando múltiplos contatos deletados');

                        // Primeira mensagem: Aviso
                        await kill.sendMessage(chatId, {
                            text: message.content || '📇 Múltiplos contatos recuperados:',
                        }, { quoted: quoted });

                        await new Promise(resolve => setTimeout(resolve, 2000));

                        try {
                        // Divide o texto do body em vários vCards
                            const contacts = message.vcard.split('--- CONTATO').slice(1).map(contactText => {
                                const vcardMatch = contactText.match(/BEGIN:VCARD[\s\S]*?END:VCARD/);
                                return vcardMatch ? { vcard: vcardMatch[0] } : null;
                            }).filter(contact => contact !== null);

                            if (contacts.length > 0) {
                                await kill.sendMessage(chatId, {
                                    contacts: {
                                        displayName: `${contacts.length} contatos recuperados`,
                                        contacts: contacts,
                                    },
                                });
                            } else {
                                throw new Error('Nenhum vCard válido encontrado');
                            }
                        } catch (error) {
                            console.error('[CONTACTS ERROR]:', error);
                            await kill.sendMessage(chatId, {
                                text: `📇 **Contatos Recuperados:**\n\`\`\`\n${message.vcard}\n\`\`\``,
                            });
                        }
                        return; // Sai após processar múltiplos contatos
                    }

                    // 📄 NOVO: DOCUMENTOS DELETADOS - COM CAPTION
                    else if (message.type === 'document' && message.media) {
                        console.log('[DOCUMENT START] Processando documento deletado');

                        try {
                        // ✅ ENVIAR DOCUMENTO COM CAPTION (UMA MENSAGEM SÓ)
                            await kill.sendMessage(chatId, {
                                document: message.media,
                                mimetype: message.mimetype || 'application/octet-stream',
                                fileName: message.fileName || 'documento_recuperado',
                                caption: message.content, // ✅ CAPTION COM TODAS AS INFORMAÇÕES!
                            });
                            console.log('[DOCUMENT] ✅ Documento enviado com caption!');
                        } catch (error) {
                            console.error('[DOCUMENT ERROR]:', error);
                            // Fallback: duas mensagens separadas
                            await kill.sendMessage(chatId, {
                                text: message.content || '📄 Documento recuperado',
                            }, { quoted: quoted });

                            await new Promise(resolve => setTimeout(resolve, 2000));

                            await kill.sendMessage(chatId, {
                                document: message.media,
                                mimetype: message.mimetype || 'application/octet-stream',
                                fileName: message.fileName || 'documento_recuperado',
                            });
                        }
                        return;
                    }

                    // ✅ NOVO: LOCALIZAÇÕES DELETADAS - NATIVO COMPLETO
                    else if (message.type === 'location' && message.media) {
                        console.log('[LOCATION START] Processando localização deletada');

                        try {
                        // ✅ TENTAR ENVIO NATIVO PRIMEIRO
                            await sendLocationMessage(kill, chatId, message, quoted);
                            console.log('[LOCATION] ✅ Localização enviada como locationMessage nativo!');
                        } catch (nativeError) {
                            console.warn('[LOCATION NATIVE ERROR]:', nativeError.message);

                            try {
                            // ✅ FALLBACK 1: Como imagem com caption
                                await kill.sendMessage(chatId, {
                                    image: message.media,
                                    caption: message.content,
                                }, { quoted: quoted });
                                console.log('[LOCATION] ✅ Enviada como imagem fallback!');
                            } catch (imageError) {
                                console.error('[LOCATION IMAGE ERROR]:', imageError);

                                // ✅ FALLBACK 2: Apenas texto
                                await kill.sendMessage(chatId, {
                                    text: message.content || '📍 Localização recuperada',
                                }, { quoted: quoted });
                                console.log('[LOCATION] ✅ Enviada como texto fallback!');
                            }
                        }
                        return;
                    }

                    if (message.media) {
                    // ✅ CORREÇÃO PARA STICKERS - ENVIAR TEXTO PRIMEIRO, DEPOIS STICKER
                        if (message.type === 'sticker') {
                        // Enviar texto primeiro
                            await kill.sendMessage(chatId, {
                                text: message.content,
                            }, { quoted: quoted });

                            // tempo 1 segundo
                            await new Promise(resolve => setTimeout(resolve, 1000));

                            // ✅ CORREÇÃO DO MIMETYPE PARA STICKERS
                            let stickerMimetype = message.mimetype;

                            // Se for Lottie (application/was), converter para image/webp
                            if (stickerMimetype === 'application/was') {
                                stickerMimetype = 'image/webp';
                                console.log('[STICKER FIX] Convertendo application/was para image/webp');
                            }

                            // Depois enviar sticker como resposta
                            await kill.sendMessage(chatId, {
                                sticker: message.media,
                                mimetype: stickerMimetype, // ✅ MIMETYPE CORRIGIDO
                            });
                        } else if (message.type === 'audio') { // ✅ CORREÇÃO PARA ÁUDIO - enviar sem quoted
                            await kill.sendMessage(chatId, {
                                text: message.content,
                            }, { quoted: quoted });

                            // tempo 1 segundo
                            await new Promise(resolve => setTimeout(resolve, 1000));

                            // Enviar mensagem de texto como resposta
                            await kill.sendMessage(chatId, {
                                audio: message.media,
                                mimetype: message.mimetype,
                            }, { quoted: quoted });
                        } else {
                        // Para outros tipos de mídia (imagem, vídeo, etc.) - funciona normal
                            await kill.sendMessage(chatId, {
                                [message.type]: message.media,
                                caption: message.content,
                                mimetype: message.mimetype,
                            }, { quoted: quoted });
                        }
                    } else {
                        await kill.sendMessage(chatId, { text: message.content }, { quoted });
                    }

                    console.log('[NOTIFICATION] ✅ Notificação enviada com sucesso');
                } catch (error) {
                    console.error('[NOTIFICATION ERROR]:', error);
                }
            });
        }

        /* Try Catch para evitar erros */
        try {
            /* Processa os eventos um a um */
            kill.ev.process(async (events) => {
                /* Caso a sessão mude de estado */
                if (events['connection.update']) {
                    /* Envia para o reload */
                    await Indexer('states').spec(events['connection.update'], genSession, startOptions, indexlaunch, launchInstance);
                }

                /* Se atualizar a sessão */
                if (events['creds.update']) {
                    /* Salva na pasta de sessões armazenadas */
                    await saveCreds();
                }

                /* Se tiver um evento de alteração no participante de um grupo */
                if (events['group-participants.update']) {
                    /* Roda as funções de greetings */
                    await Indexer('greetings').events(kill, events['group-participants.update']);
                }

                /* Se tiver um evento de caso alguém pedir para entrar */
                if (events['group.join-request']) {
                    /* Roda as funções de approval */
                    await Indexer('approval').events(kill, events['group.join-request']);
                }

                /* ✅ MENSAGENS - INCLUINDO DELETADAS */
                if (events['messages.upsert']) {
                    if (sucessfulInit === false) {
                    /* Define sucesso na inicialização */
                        sucessfulInit = true;
                        /* Reajusta o número da Íris */
                        global.irisNumber = global.irisNumber === false ? `${kill?.user?.id.split('@')[0].split(':')[0]}@s.whatsapp.net` : global.irisNumber;
                        /* Avisa que iniciou */
                        console.log(Indexer('color').echo('----------- [START - OK] -----------', 'brightGreen').value);
                    }

                    const { type, messages } = events['messages.upsert'];
                    console.log(JSON.stringify(events['messages.upsert'], null, 2)); // Log completo do upsert
                    for (const msg of messages) {
                        try {
                        // ✅ IGNORAR MENSAGENS DO PRÓPRIO BOT - PRIMEIRA VERIFICAÇÃO
                            if (msg.key.fromMe) {
                                continue;
                            }

                            // ✅ IGNORAR MENSAGENS DO BOT POR NÚMERO - SEGUNDA VERIFICAÇÃO
                            const senderNumber = msg.key.participant || msg.key.remoteJid;
                            if (senderNumber === global.irisNumber) {
                                continue;
                            }

                            // ✅ IGNORAR MENSAGENS DE BOTS CONHECIDOS - TERCEIRA VERIFICAÇÃO
                            if (senderNumber?.endsWith('@bot') || senderNumber?.includes('bot')) {
                                continue;
                            }

                            // ✅ PULAR MENSAGENS DE SISTEMA (sem conteúdo)
                            if (msg.messageStubType || !msg.message) {
                                console.log(`[INFO] Mensagem de sistema ignorada: ${msg.messageStubType || 'sem message'}`);

                                // ✅ PROCESSAMENTO ANTI-DELETE - SÓ SE HABILITADO
                                if (ANTI_DELETE_ENABLED) {
                                // ✅ NEWSLETTER DELETADO
                                    if (msg.messageStubType === 2 && msg.key.remoteJid?.includes('@newsletter')) {
                                        console.log('[NEWSLETTER DELETED]', {
                                            newsletterId: msg.key.remoteJid,
                                            messageId: msg.key.id,
                                            serverId: msg.newsletterServerId,
                                        });

                                        // ✅ CÓDIGO COMPLETO DE NEWSLETTER
                                        try {
                                            const newsletterMessage = await AntiDeleteDB.getDeletedMessage(msg.key.remoteJid, msg.key.id);
                                            if (newsletterMessage) {
                                                console.log('[NEWSLETTER RECOVERED]', {
                                                    content: newsletterMessage.body,
                                                    timestamp: newsletterMessage.timestamp,
                                                    hasMedia: !!newsletterMessage.media_data,
                                                });

                                                // ✅ USAR O SISTEMA AVANÇADO COM MÍDIA
                                                const notification = await AntiDeleteEventManager.buildDeletedNotification(newsletterMessage, {
                                                    userName: 'Newsletter',
                                                    deletedByAdmin: false,
                                                    adminName: '',
                                                });

                                                // ✅ NOVA LÓGICA: UMA MENSAGEM SÓ COM CAPTION
                                                if (notification.media) {
                                                // Enviar imagem com caption completo (texto + info)
                                                    const captionCompleto = `📰 *NEWSLETTER DELETADO*\n🆔 Canal: ${msg.key.remoteJid}\n\n${notification.content}`;

                                                    if (newsletterMessage.status === 1) { // Imagem
                                                        await kill.sendMessage(EVENTOLOGS, {
                                                            image: notification.media,
                                                            caption: captionCompleto,
                                                        });
                                                    } else if (newsletterMessage.status === 4) { // Vídeo
                                                        await kill.sendMessage(EVENTOLOGS, {
                                                            video: notification.media,
                                                            caption: captionCompleto,
                                                        });
                                                    } else if (newsletterMessage.status === 6) { // Áudio
                                                        await kill.sendMessage(EVENTOLOGS, {
                                                            text: captionCompleto,
                                                        });
                                                        await new Promise(resolve => setTimeout(resolve, 1000));
                                                        // Depois o áudio
                                                        await kill.sendMessage(EVENTOLOGS, {
                                                            audio: notification.media,
                                                            mimetype: notification.mimetype,
                                                        });
                                                    } else if (newsletterMessage.status === 3) { // Sticker
                                                    // Stickers não suportam caption, enviar texto primeiro
                                                        await kill.sendMessage(EVENTOLOGS, {
                                                            text: captionCompleto,
                                                        });
                                                        await new Promise(resolve => setTimeout(resolve, 1000));
                                                        await kill.sendMessage(EVENTOLOGS, {
                                                            sticker: notification.media,
                                                        });
                                                    }
                                                } else {
                                                // Se não tem mídia, só texto
                                                    await kill.sendMessage(EVENTOLOGS, {
                                                        text: `📰 *NEWSLETTER DELETADO*\n🆔 Canal: ${msg.key.remoteJid}\n\n${notification.content}`,
                                                    });
                                                }
                                            }
                                        } catch (error) {
                                            console.error('[NEWSLETTER ERROR]:', error);
                                        }
                                    }
                                }
                                continue;
                            }

                            // ✅ DETECÇÃO DE MENSAGEM DELETADA - SÓ SE ANTI-DELETE HABILITADO
                            if (ANTI_DELETE_ENABLED) {
                                const protoMsg = msg.message?.protocolMessage;
                                const isRevokeString = protoMsg?.type === 'REVOKE';
                                const isRevokeNumber = protoMsg?.type === 0;
                                const isRevoke = isRevokeString || isRevokeNumber;
                                const isStubDelete = msg.messageStubType === 2;
                                const isDeletedMessage = isRevoke || isStubDelete;

                                if (isDeletedMessage) {
                                    const originalMessageId = msg.message?.protocolMessage?.key?.id;
                                    const deletedBy = msg.key.participant || msg.key.remoteJid;
                                    const chatId = msg.key.remoteJid;

                                    console.log('[MESSAGE DELETED DETECTED] ✅', {
                                        protocolId: msg.key.id,
                                        originalId: originalMessageId,
                                        deletedBy: deletedBy,
                                        chatId: chatId,
                                        pushName: msg.pushName,
                                    });

                                    if (originalMessageId) {
                                        try {
                                            const isGroupMessage = chatId.endsWith('@g.us');
                                            const messageAuthor = msg.message?.protocolMessage?.key?.participant;
                                            const whoDeleted = deletedBy;
                                            const deletedByAdmin = isGroupMessage && messageAuthor && messageAuthor !== whoDeleted;

                                            const result = await AntiDeleteEventManager.processEvent('message.deleted', {
                                                messageId: originalMessageId,
                                                protocolId: msg.key.id,
                                                user: messageAuthor || deletedBy,
                                                chatId: chatId,
                                                monitorId: EVENTOLOGS,
                                                originalMessage: msg,
                                                deletedByAdmin: deletedByAdmin,
                                                userName: msg.pushName || 'Desconhecido',
                                                adminName: deletedByAdmin ? (msg.pushName || 'Admin Desconhecido') : '',
                                                whoDeleted: whoDeleted,
                                            });
                                            console.log('[ANTI-DELETE RESULT]', result);
                                        } catch (antiDeleteError) {
                                            console.error('[ANTI-DELETE ERROR]:', antiDeleteError);
                                        }
                                    }
                                    continue;
                                }

                                // ✅ PROCESSAMENTO NORMAL DE MENSAGENS PARA ANTI-DELETE
                                const messageType = AntiDeleteEventManager.detectMessageType(msg);
                                if (messageType.status !== -1) {
                                    if (AntiDeleteEventManager.shouldProcessMessage(msg.key.remoteJid, msg.key.participant || msg.key.remoteJid)) {
                                        await AntiDeleteEventManager.processEvent('message.new', {
                                            message: msg,
                                            user: msg.key.participant || msg.key.remoteJid,
                                            chatId: msg.key.remoteJid,
                                        });
                                    }
                                }
                            }

                            // ✅ SEU BLOCO ORIGINAL - PROCESSAMENTO DE COMANDOS
                            if (type !== 'notify') {
                            // Mensagem não é do tipo 'notify', ignorar (ex: 'append')
                                continue;
                            }

                            msg.currentTimeDate = Date.now();
                            await Indexer('commands').cmds(kill, { messages: [msg], currentTimeDate: msg.currentTimeDate });
                        } catch (err) {
                            console.error('[ERROR]:', err);
                        }
                    }
                }

                /* Injeta o awaitMessages na kill para uso global */
                /* eslint-disable-next-line no-param-reassign */
                kill.awaitMessages = extender.awaitMessages;
            });

            /* Caso der erros em algo */
        } catch (error) {
            /* Printa o erro */
            console.error(error);
        }
    }
}

// Limpeza automática
if (ANTI_DELETE_ENABLED) {
    setInterval(async () => {
        try {
            await AntiDeleteDB.cleanupExpiredMessages(7);
            // AntiDeleteEventManager.cleanupCache(); // ✅ Comentado pois não existe o método

            const metrics = AntiDeleteEventManager.getMetrics();
            console.log('[METRICS]', JSON.stringify(metrics, null, 2));
        } catch (error) {
            console.error('[CLEANUP ERROR]:', error);
        }
    }, 24 * 60 * 60 * 1000);
}

/* Exporta o módulo */
module.exports = createListener;
