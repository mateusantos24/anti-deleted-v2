// antiDeleteEventManager.js - Gerenciador de Eventos Anti-Delete Melhorado
// Usa EventEmitter para modularidade e extensibilidade
// Autor: Rei Ayanami
// Inteligência Artificial: Claude Sonnet v4

const EventEmitter = require('events');

// ✅ FUNÇÃO PARA DETECTAR MÓDULO DINAMICAMENTE
function getBaileysModule() {
    const possibleModules = [
        'baileys', // Original
        '@whiskeysockets/baileys', // Fork mais popular
        '@adiwajshing/baileys', // Fork antigo
    ];

    for (const moduleName of possibleModules) {
        try {
            require.resolve(moduleName);
            return require(moduleName);
        } catch (error) {
            if (error.code !== 'MODULE_NOT_FOUND') {
                throw error; // Re-throw se não for erro de módulo não encontrado
            }
            // Continue tentando o próximo módulo
        }
    }

    console.warn('[BAILEYS] Nenhum módulo Baileys encontrado. Funcionalidades de download desabilitadas.');
    return null;
}

// ✅ USAR O MÓDULO DETECTADO
const BAILEYS_MODULE = getBaileysModule();

class AntiDeleteEventManager extends EventEmitter {
    constructor() {
        super();
        this.eventQueue = [];
        this.rateLimiter = new Map();
        this.messageCache = new Map();
        this.isProcessing = false;
        this.metrics = {
            processed: 0,
            failed: 0,
            rateLimited: 0,
        };
        this.BAILEYS_MODULE = this.getBaileysModule();
        
    }

    // ✅ FUNÇÃO PARA DETECTAR MÓDULO DINAMICAMENTE
    getBaileysModule() {
        const possibleModules = [
            'baileys',                  // Original
            '@whiskeysockets/baileys',  // Fork mais popular
            '@adiwajshing/baileys',     // Fork antigo
        ];

        for (const moduleName of possibleModules) {
            try {
                require.resolve(moduleName);
                const module = require(moduleName);
                console.log(`[BAILEYS] ✅ Detectado: ${moduleName}`);
                return module;
            } catch (error) {
                if (error.code !== 'MODULE_NOT_FOUND') {
                    console.error(`[BAILEYS] Erro ao carregar ${moduleName}:`, error.message);
                }
                // Continue tentando o próximo módulo
            }
        }
        
        console.warn('[BAILEYS]  Nenhum módulo Baileys encontrado. Funcionalidades de download desabilitadas.');
        console.warn('[BAILEYS] Instale um destes: npm install baileys ou npm install @whiskeysockets/baileys');
        return null;
    }

    // ✅ ADICIONE ESTA FUNÇÃO COMO MÉTODO DA CLASSE:
    formatBytes(bytes, decimals = 2) {
        if (!bytes || isNaN(bytes) || bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        const value = parseFloat((bytes / k ** i).toFixed(decimals));
        return `${value} ${sizes[i]}`;
    }

    // Rate limiting inteligente
    shouldProcessMessage(chatId, userId) {
        const key = `${chatId}:${userId}`;
        const now = Date.now();
        const window = 60000; // 1 minuto
        const limit = 50; // 50 mensagens por minuto

        if (!this.rateLimiter.has(key)) {
            this.rateLimiter.set(key, { count: 1, resetTime: now + window });
            return true;
        }

        const rateData = this.rateLimiter.get(key);

        if (now > rateData.resetTime) {
            rateData.count = 1;
            rateData.resetTime = now + window;
            return true;
        }

        if (rateData.count >= limit) {
            this.metrics.rateLimited++;
            return false;
        }

        rateData.count++;
        return true;
    }

    // Cache com TTL
    cacheMessage(messageId, data, ttl = 300000) { // 5 minutos
        this.messageCache.set(messageId, {
            data,
            expires: Date.now() + ttl,
        });
    }

    getCachedMessage(messageId) {
        const cached = this.messageCache.get(messageId);
        if (cached && Date.now() < cached.expires) {
            return cached.data;
        }
        this.messageCache.delete(messageId);
        return null;
    }

    cleanupCache() {
        const now = Date.now();
        let cleaned = 0;

        for (const [key, value] of this.messageCache.entries()) {
            if (now > value.expires) {
                this.messageCache.delete(key);
                cleaned++;
            }
        }

        if (cleaned > 0) {
            console.log(`[CACHE CLEANUP] ${cleaned} itens removidos do cache`);
        }
    }

    // Download com retry
    async downloadWithRetry(messageObj, maxRetries = 3) {
        // ✅ VERIFICAR SE BAILEYS ESTÁ DISPONÍVEL
        if (!BAILEYS_MODULE) {
            console.warn('[DOWNLOAD] Baileys não encontrado - skip download');
            return null;
        }

        // ✅ EXTRAIR downloadMediaMessage DO MÓDULO DETECTADO
        const { downloadMediaMessage } = BAILEYS_MODULE;
        
        if (!downloadMediaMessage) {
            console.warn('[DOWNLOAD] downloadMediaMessage não disponível nesta versão do Baileys');
            return null;
        }

        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                const { downloadMediaMessage } = require('baileys');
                return await downloadMediaMessage(messageObj, 'buffer');
            } catch (error) {
                console.warn(`[RETRY ${attempt}] Download falhou: ${error.message}`);
                if (attempt === maxRetries) {
                    this.emit('downloadFailed', { messageObj, error });
                    return null;
                }
                const delay = 2 ** attempt * 1000;
                await new Promise((resolve) => setTimeout(resolve, delay));
            }
        }
    }

    // Event processor principal
    async processEvent(eventType, data) {
        if (!this.shouldProcessMessage(data.chatId, data.user)) {
            return { success: false, reason: 'rate_limited' };
        }

        try {
            switch (eventType) {
            case 'message.deleted':
                return await this.handleMessageDeleted(data);
            case 'message.new':
                return await this.handleMessageNew(data);
            case 'message.edited':
                return await this.handleMessageEdited(data);
            case 'media.viewonce':
                return await this.handleViewOnce(data);
            default:
                console.warn(`[EVENT] Tipo desconhecido: ${eventType}`);
                return { success: false, reason: 'unknown_event' };
            }
        } catch (error) {
            console.error(`[EVENT ERROR] ${eventType}:`, error);
            this.metrics.failed++;
            this.emit('processingError', { eventType, data, error });
            return { success: false, error: error.message };
        }
    }

    // Handler para mensagens deletadas
    async handleMessageDeleted(data) {
        const AntiDeleteDB = require('./deletev2');
        const { user, messageId, chatId } = data;

        console.log('[DEBUG] Buscando mensagem deletada:', { messageId, user, chatId });

        // Verificar cache primeiro
        let deletedMessage = this.getCachedMessage(messageId);

        if (!deletedMessage) {
            console.log('[DEBUG] Não encontrado no cache, buscando no banco...');
            deletedMessage = await AntiDeleteDB.getDeletedMessage(user, messageId);
        } else {
            // ✅ CORREÇÃO: Se veio do cache, normalizar os nomes dos campos
            console.log('[DEBUG] Mensagem encontrada no cache, normalizando campos...');
            if (deletedMessage.mediaData && !deletedMessage.media_data) {
                deletedMessage.media_data = deletedMessage.mediaData;
                deletedMessage.compressed = 0; // Dados do cache não estão comprimidos
            }
        }

        if (!deletedMessage) {
            console.error('[ANTI-DELETE MISS] Mensagem não encontrada:', {
                messageId,
                user,
                chatId,
                possibleCause: 'Mensagem não foi salva ou ID incorreto',
            });
            return { success: false, reason: 'message_not_found' };
        }

        console.log('[DEBUG] Mensagem encontrada:', {
            id: deletedMessage.id,
            type: deletedMessage.type,
            status: deletedMessage.status,
            body: deletedMessage.body ? `${deletedMessage.body.substring(0, 50)}...` : 'sem texto',
        });

        // Análise de comportamento suspeito
        await this.analyzeUserBehavior(user, 'message_deleted');

        // Preparar notificação
        const notification = await this.buildDeletedNotification(deletedMessage, data);

        console.log('[DEBUG] Notificação preparada:', notification);

        // Enviar notificação
        this.emit('sendNotification', {
            chatId: data.monitorId,
            message: notification,
            quoted: data.originalMessage,
        });

        // Log do evento
        AntiDeleteDB.logEvent('MESSAGE_DELETED', user, chatId, messageId, {
            type: deletedMessage.type,
            size: deletedMessage.size,
            timestamp: Date.now(),
        });

        this.metrics.processed++;
        return { success: true, messageData: deletedMessage };
    }

    // Download direto para newsletters
    async downloadNewsletterMedia(message) {
        const axios = require('axios');

        try {
            const mediaMsg = message.message.imageMessage || message.message.stickerMessage
                           || message.message.videoMessage || message.message.audioMessage
                           || message.message.documentMessage;

            if (!mediaMsg) {
                console.warn('[NEWSLETTER] Tipo de mídia não encontrado');
                return null;
            }

            let mediaUrl = mediaMsg.url;

            if (!mediaUrl && mediaMsg.directPath) {
                mediaUrl = `https://mmg.whatsapp.net${mediaMsg.directPath}`;
                console.log('[NEWSLETTER] Usando directPath como URL');
            }

            if (!mediaUrl && mediaMsg.jpegThumbnail) {
                console.log('[NEWSLETTER] Usando thumbnail como fallback');
                return Buffer.from(mediaMsg.jpegThumbnail, 'base64');
            }

            if (!mediaUrl) {
                console.warn('[NEWSLETTER] Nem URL nem directPath encontrados');
                return null;
            }

            console.log('[NEWSLETTER] Baixando mídia:', mediaUrl);

            const response = await axios.get(mediaUrl, {
                responseType: 'arraybuffer',
                timeout: 30000,
                headers: {
                    'User-Agent': 'WhatsApp/2.24.1.88 N',
                    DNT: '1',
                    Connection: 'keep-alive',
                    Accept: '*/*',
                    'Accept-Encoding': 'gzip, deflate, br',
                    'Accept-Language': 'en-US,en;q=0.9',
                },
            });

            console.log(`[NEWSLETTER] ✅ Download concluído: ${response.data.byteLength} bytes`);
            return Buffer.from(response.data);
        } catch (error) {
            console.error('[NEWSLETTER] Falha no download direto:', error.message);
            return null;
        }
    }

    // Handler para mensagens novas
    async handleMessageNew(data) {
        const AntiDeleteDB = require('./deletev2');
        const { message, user, chatId } = data;

        // Detectar tipo de mensagem
        const messageType = this.detectMessageType(message);

        if (messageType.status === -1) {
            console.log(`[DEBUG] Tipo inválido não será salvo: ${messageType.type}`);
            return { success: false, reason: 'invalid_message_type' };
        }

        // Download de mídia se necessário
        let mediaData = null;
        // ✅ BYPASS ESPECIAL PARA LOCALIZAÇÕES - USAR THUMBNAIL
        if (message.message.locationMessage && message.message.locationMessage.jpegThumbnail) {
            console.log('[LOCATION BYPASS] Usando jpegThumbnail como mídia');
            try {
                // Converter base64 para buffer
                mediaData = Buffer.from(message.message.locationMessage.jpegThumbnail, 'base64');
                console.log(`[LOCATION] ✅ Thumbnail extraído: ${mediaData.length} bytes`);
                this.cacheMessage(message.key.id, mediaData);
            } catch (error) {
                console.error('[LOCATION BYPASS ERROR]:', error);
                mediaData = null;
            }
        } else if (this.isMediaMessage(message)) {
            try {
                if (chatId.includes('@newsletter')) {
                    console.log('[DEBUG] Newsletter detectado - usando download direto');
                    mediaData = await this.downloadNewsletterMedia(message);
                } else {
                    mediaData = await this.downloadWithRetry(message, 5);
                }

                if (mediaData) {
                    console.log(`[MEDIA] ✅ Download concluído: ${mediaData.length} bytes`);
                    this.cacheMessage(message.key.id, mediaData);
                } else {
                    console.warn(`[MEDIA] ❌ Falha no download para: ${message.key.id}`);
                }
            } catch (error) {
                console.error('[MEDIA ERROR]:', error);
            }
        }

        // Preparar dados para salvar
        const saveData = {
            id: message.key.id,
            user,
            chatId,
            body: this.extractMessageText(message),
            type: messageType.type,
            status: messageType.status,
            ephemeral: message.message.ephemeralMessage ? 1 : 0,
            mimetype: message.message?.locationMessage ? 'image/jpeg' : (message.message?.documentMessage?.mimetype || message.message?.stickerMessage?.mimetype || message.message?.lottieStickerMessage?.message?.stickerMessage?.mimetype),
            mediaData,
            fileLength: mediaData ? mediaData.length : (message.message?.documentMessage?.fileLength || message.message?.stickerMessage?.fileLength || message.message?.lottieStickerMessage?.message?.stickerMessage?.fileLength || 0),
            width: message.message?.stickerMessage?.width || message.message?.lottieStickerMessage?.message?.stickerMessage?.width,
            height: message.message?.stickerMessage?.height || message.message?.lottieStickerMessage?.message?.stickerMessage?.height,
            duration: 0,
        };

        try {
            await AntiDeleteDB.addMessageAdvanced(saveData);
            this.cacheMessage(message.key.id, saveData);

            return { success: true, messageType };
        } catch (error) {
            console.error('[DEBUG] ❌ Erro ao salvar mensagem:', error);
            return { success: false, error: error.message };
        }
    }

    // Análise de comportamento
    async analyzeUserBehavior(userId, action) {
        try {
            const AntiDeleteDB = require('./deletev2');
            const analytics = await AntiDeleteDB.getUserAnalytics(userId);

            const riskFactors = {
                highDeletionRate: analytics.deleted_messages > 50,
                rapidActivity: Date.now() - analytics.last_activity < 60000,
                mediaHeavy: analytics.media_messages > analytics.total_messages * 0.8,
            };

            const riskScore = Object.values(riskFactors).filter(Boolean).length / 3;

            if (riskScore > 0.6) {
                this.emit('suspiciousActivity', { userId, riskScore, factors: riskFactors });
            }

            return { riskScore, factors: riskFactors };
        } catch (error) {
            console.error('[BEHAVIOR ANALYSIS ERROR]:', error);
            return { riskScore: 0, factors: {} };
        }
    }

    // ✅ TEMPLATES FINAIS SUPER ORGANIZADOS E BONITOS
    async buildDeletedNotification(messageData, context) {
        console.log('[DEBUG] Dados da mensagem:', {
            hasMediaData: !!messageData.mediaData,
            hasMedia_data: !!messageData.media_data,
            mediaSize: messageData.media_data ? messageData.media_data.length : 0,
            compressed: messageData.compressed,
        });

        // Função formatBytes
        const formatBytes = (bytes, decimals = 2) => {
            if (!bytes || isNaN(bytes) || bytes === 0) return '0 Bytes';
            const k = 1024;
            const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
            const i = Math.floor(Math.log(bytes) / Math.log(k));
            const value = parseFloat((bytes / k ** i).toFixed(decimals));
            return `${value} ${sizes[i]}`;
        };

        // ✅ FUNÇÃO PARA OCULTAR APENAS NÚMEROS DE TELEFONE
        const hideNumber = (number) => {
            if (!number) return 'Desconhecido';
            // Remove o @s.whatsapp.net se existir
            const cleanNumber = number.replace('@s.whatsapp.net', '');
            // Para números longos (telefones), mostra só os primeiros 5 dígitos + ...
            if (cleanNumber.length > 8) {
                return `${cleanNumber.substring(0, 5)}...`;
            }
            return cleanNumber;
        };

        // Correção do timestamp
        const timestampInSeconds = messageData.timestamp || messageData.messageTimestamp || (Date.now() / 1000);
        const timestampInMillis = timestampInSeconds > 10000000000 ? timestampInSeconds : timestampInSeconds * 1000;
        const formattedDate = new Date(timestampInMillis).toLocaleString('pt-BR');

        // ✅ TEMPLATES SUPER ORGANIZADOS COMO SOLICITADO
        const templates = {
            text: `*🗑️ MENSAGEM DELETADA*\n👤 ${context.userName}`,
            image: `*🖼️ IMAGEM DELETADA*\n👤 ${context.userName}`,
            sticker: `*🏷️ FIGURINHA DELETADA*\n👤 ${context.userName}`,
            video: `*🎬 VÍDEO DELETADO*\n👤 ${context.userName}`,
            audio: `*🔊 ÁUDIO DELETADO*\n👤 ${context.userName}`,
            document: `*📄 DOCUMENTO DELETADO*\n👤 ${context.userName}`,
            poll: `*🗳️ ENQUETE DELETADA*\n👤 ${context.userName}`,
            event: `*📅 EVENTO DELETADO*\n👤 ${context.userName}`,
            contact: `*📇 CONTATO DELETADO*\n👤 ${context.userName}`,
            contacts: `*📇 MÚLTIPLOS CONTATOS DELETADOS*\n👤 ${context.userName}`,
            location: `*📍 LOCALIZAÇÃO DELETADA*\n👤 ${context.userName}`, // ✅ NOVO
        };

        const type = this.getMessageTypeFromStatus(messageData.status);
        let notification = templates[type] || templates.text;

        // ✅ SEÇÃO: AUTO REMOVER (QUEM DELETOU) - SÓ SE VÁLIDO
        if (context.deletedByAdmin !== undefined || context.deletedByAdmin !== null) {
            notification += '\n\n*👀 AUTO-REMOVER (Quem Deletou)*';
            if (context.deletedByAdmin) {
                notification += `\n> Deletado por admin: ${context.adminName || 'Desconhecido'}`;
            } else {
                notification += '\n> Removido pelo próprio autor';
            }
        }

        // ✅ SEÇÃO: DIMENSÕES/INFORMAÇÕES TÉCNICAS - SÓ SE HOUVER DADOS
        if (type === 'image' || type === 'video' || type === 'sticker') {
            const size = messageData.size || messageData.fileLength || messageData.media_data?.length;
            const { width } = messageData;
            const { height } = messageData;

            if (size !== undefined && size !== null && size > 0) {
                notification += '\n\n*🖼️ DIMENSÕES*';
                notification += `\n> ${formatBytes(size)}`;

                if (width && height) {
                    notification += ` • ${width}x${height}`;
                }

                if (type === 'video' && messageData.duration) {
                    notification += ` • ⏱️ ${messageData.duration}s`;
                }
            }
        } else if (type === 'audio') {
            const size = messageData.size || messageData.fileLength || messageData.media_data?.length;

            if (size !== undefined && size !== null && size > 0) {
                notification += '\n\n*🔊 ÁUDIO*';
                notification += `\n> ${formatBytes(size)}`;

                if (messageData.duration) {
                    notification += ` • ⏱️ ${messageData.duration}s`;
                }
            }
        } else if (type === 'document') {
            const { size } = messageData;

            if (size !== undefined && size !== null && size > 0) {
                notification += '\n\n*📊 ARQUIVO*';
                notification += `\n> ${formatBytes(size)}`;

                if (messageData.mimetype) {
                    const fileType = messageData.mimetype.split('/')[1]?.toUpperCase() || 'ARQUIVO';
                    notification += ` • 📎 ${fileType}`;
                }
            }
        }

        // ✅ SEÇÃO: DATA DE REGISTRO - SEMPRE MOSTRAR
        notification += '\n\n*⏰ DATA DE REGISTRO*';
        notification += `\n> ${formattedDate}`;

        // ✅ SEÇÃO: MOSTRAR MENSAGEM TEMPORÁRIA SE FOR O CASO (EFÊMERAS)
        if (messageData.ephemeral && (messageData.ephemeral === 1 || messageData.ephemeral === true)) {
            notification += '\n\n*⏳ MENSAGEM EFÊMERA*';
            notification += '\n> Esta mensagem era efêmera e desapareceria após ser vista.';
        }

        // ✅ SEÇÃO: NÚMERO DO WHATSAPP - COM VALIDAÇÃO E NEWSLETTER LIVRE
        if (messageData.user) {
            if (messageData.user.includes('@s.whatsapp.net')) {
                notification += '\n\n*👤 NÚMERO DO WHATSAPP*';
            } else if (messageData.user.includes('@g.us')) {
                notification += '\n\n*👥 NÚMERO DO GRUPO*';
            } else if (messageData.user.includes('@broadcast')) {
                notification += '\n\n*📢 NÚMERO DA LISTA DE TRANSMISSÃO*';
            } else if (messageData.user.includes('@newsletter')) {
                notification += '\n\n*📰 NÚMERO DO CANAIS*';
            } else if (messageData.user.includes('@lid')) {
                notification += '\n\n*📰 NÚMERO DO LID*';
            } else {
                notification += '\n\n*⚠ NÚMERO DO DESCONHECIDO*';
            }

            // ✅ NEWSLETTER NÃO É OCULTADO
            if (messageData.user.includes('@newsletter') || messageData.chatId?.includes('@newsletter') || messageData.chatId?.includes('@lid')) {
                notification += `\n> ${messageData.user}`;
            } else {
                notification += `\n> ${hideNumber(messageData.user)}`;
            }
        }

        // ✅ SEÇÃO: ID DO CHAT/GRUPO - SÓ SE VÁLIDO
        if (messageData.chatId && messageData.chatId !== undefined && messageData.chatId !== null) {
            if (messageData.chatId.includes('@g.us')) {
                notification += '\n\n*💬 ID DO GRUPO*';
            } else if (messageData.chatId.includes('@newsletter')) {
                notification += '\n\n*📰 ID DO NEWSLETTER*';
            } else if (messageData.chatId.includes('@lid')) {
                notification += '\n\n*📰 ID DO LID*';
            } else {
                notification += '\n\n*💬 ID DO CHAT*';
            }
            notification += `\n> ${messageData.chatId}`;
        }

        // ✅ SEÇÃO: DESCRIÇÃO/BODY - MELHORADA PARA CONTATOS
        if (messageData.body && messageData.body !== undefined && messageData.body !== null && messageData.body.trim() !== '') {
            notification += '\n\n*📝 DESCRIÇÃO*';

            // ✅ FORMATAÇÃO ESPECIAL PARA CONTATOS
            if (type === 'contact' && messageData.body.includes('BEGIN:VCARD')) {
                // Extrair informações do vCard
                const lines = messageData.body.split('\n');
                const displayName = lines.find((line) => line.startsWith('FN:'))?.replace('FN:', '') || 'Nome não disponível';
                const phone = lines.find((line) => line.includes('TEL'))?.match(/\+[\d\s-]+/) || ['Telefone não disponível'];
                notification += `\n> 👤 Nome: ${displayName}`;
                notification += `\n> 📱 Telefone: ${phone[0]}`;
                notification += '\n> 📇 vCard completo salvo';
            }
            // ✅ FORMATAÇÃO MELHORADA PARA MÚLTIPLOS CONTATOS
            else if (type === 'contacts' && messageData.body.includes('--- CONTATO')) {
                const totalContacts = messageData.body.match(/--- CONTATO \d+ ---/g)?.length || 0;
                notification += `\n> 👥 Total: ${totalContacts} contatos`;
                notification += '\n> 📇 Todos os vCards salvos';
                notification += '\n> 📋 Lista completa disponível';
            } else {
                // Formatação normal para outros tipos
                const preview = messageData.body.length > 100 ? `${messageData.body.substring(0, 100)}...` : messageData.body;
                notification += `\n> ${preview}`;
            }
        }

        // Buffer de mídia
        let mediaBuffer = null;

        // Tentar do banco de dados primeiro (comprimido)
        if (messageData.media_data) {
            mediaBuffer = messageData.compressed ? this.decompressMedia(messageData.media_data) : messageData.media_data;
            console.log('[DEBUG] Mídia recuperada do banco de dados');
        }
        // Se não tiver, tentar do cache/memória (não comprimido)
        else if (messageData.mediaData && Buffer.isBuffer(messageData.mediaData)) {
            mediaBuffer = messageData.mediaData;
            console.log('[DEBUG] Mídia recuperada do cache');
        }

        console.log('[DEBUG] Status final da mídia:', {
            hasMediaData: !!messageData.mediaData,
            hasMedia_data: !!messageData.media_data,
            finalBuffer: !!mediaBuffer,
            bufferSize: mediaBuffer ? mediaBuffer.length : 0,
        });

        return {
            type: messageData.status === 0 ? 'text' : type,
            content: notification,
            media: mediaBuffer,
            mimetype: messageData.mimetype,
            // ✅ MELHORAR EXTRAÇÃO DO NOME DO ARQUIVO
            fileName: (type === 'document' && messageData.body) ? messageData.body.match(/📄 (.+)\n/)?.[1] || messageData.body.match(/📄 (.+)$/)?.[1] || 'documento_recuperado' : undefined,
            vcard: (type === 'contact' && messageData.body) ? messageData.body.split('\n').slice(1).join('\n') : (type === 'contacts' && messageData.body) ? messageData.body : undefined,
        };
    }

    // Descompressão
    decompressMedia(buffer) {
        const zlib = require('zlib');
        try {
            if (!Buffer.isBuffer(buffer)) {
                console.warn('[DECOMPRESS] Buffer inválido');
                return buffer;
            }

            return zlib.inflateSync(buffer);
        } catch (error) {
            console.warn('[DECOMPRESS] Usando dados sem descompressão:', error.message);
            return buffer;
        }
    }

    // Detectar tipo de mensagem
    detectMessageType(message) {
        const msg = message.message;

        // ✅ NOVO: VERIFICAR MENSAGENS EFÊMERAS PRIMEIRO
        if (msg.ephemeralMessage?.message) {
            const ephemeralMsg = msg.ephemeralMessage.message;

            if (ephemeralMsg.conversation || ephemeralMsg.extendedTextMessage) {
                return { type: 'text', status: 0 };
            }
            if (ephemeralMsg.imageMessage) return { type: 'imageMessage', status: 1 };
            if (ephemeralMsg.videoMessage) return { type: 'videoMessage', status: 4 };
            if (ephemeralMsg.audioMessage) return { type: 'audioMessage', status: 6 };
            if (ephemeralMsg.documentMessage) return { type: 'documentMessage', status: 7 };
            if (ephemeralMsg.stickerMessage) return { type: 'stickerMessage', status: 3 };
            if (ephemeralMsg.contactMessage) return { type: 'contactMessage', status: 8 };
            if (ephemeralMsg.locationMessage) return { type: 'locationMessage', status: 12 };
        }

        if (msg.conversation || msg.extendedTextMessage) return { type: 'text', status: 0 };
        if (msg.imageMessage) return { type: 'imageMessage', status: 1 };
        if (msg.stickerMessage) return { type: 'stickerMessage', status: 3 };
        if (msg.lottieStickerMessage) return { type: 'stickerMessage', status: 3 };
        if (msg.videoMessage) return { type: 'videoMessage', status: 4 };
        if (msg.audioMessage) return { type: 'audioMessage', status: 6 };
        if (msg.documentMessage) return { type: 'documentMessage', status: 7 };
        if (msg.contactMessage) return { type: 'contactMessage', status: 8 };
        if (msg.contactsArrayMessage) return { type: 'contactsArrayMessage', status: 11 };

        // ✅ ADICIONAR SUPORTE PARA LOCALIZAÇÃO
        if (msg.locationMessage) return { type: 'locationMessage', status: 12 };

        if (msg.pollCreationMessage || msg.pollCreationMessageV2 || msg.pollCreationMessageV3) {
            return { type: 'pollCreationMessage', status: 9 };
        }
        if (msg.eventMessage) return { type: 'eventMessage', status: 10 };
        if (msg.protocolMessage) return { type: 'protocolMessage', status: -1 };
        return { type: 'unknown', status: -1 };
    }

    isMediaMessage(message) {
        const msg = message.message;
        // ✅ NOVO: VERIFICAR MÍDIA EM MENSAGENS EFÊMERAS
        if (msg.ephemeralMessage?.message) {
            const ephemeralMsg = msg.ephemeralMessage.message;

            if (ephemeralMsg.locationMessage?.jpegThumbnail) {
                return true;
            }

            return !!(ephemeralMsg.imageMessage || ephemeralMsg.videoMessage || ephemeralMsg.audioMessage || ephemeralMsg.documentMessage || ephemeralMsg.stickerMessage);
        }

        // ✅ LOCALIZAÇÃO SEMPRE TEM THUMBNAIL COMO MÍDIA
        if (msg.locationMessage && msg.locationMessage.jpegThumbnail) {
            return true;
        }

        return !!(msg.imageMessage || msg.videoMessage || msg.audioMessage || msg.documentMessage || msg.stickerMessage || msg.lottieStickerMessage);
    }

    extractMessageText(message) {
        const msg = message.message;

        // ✅ NOVO: SUPORTE PARA MENSAGENS EFÊMERAS
        if (msg.ephemeralMessage?.message) {
            const ephemeralMsg = msg.ephemeralMessage.message;

            if (ephemeralMsg.conversation) {
                return ephemeralMsg.conversation;
            }

            if (ephemeralMsg.extendedTextMessage?.text) {
                return ephemeralMsg.extendedTextMessage.text;
            }

            if (ephemeralMsg.imageMessage?.caption) {
                return ephemeralMsg.imageMessage.caption;
            }

            // Outros tipos de mídia efêmera...
            if (ephemeralMsg.videoMessage?.caption) {
                return ephemeralMsg.videoMessage.caption;
            }

            if (ephemeralMsg.documentMessage) {
                const doc = ephemeralMsg.documentMessage;
                const fileName = doc.fileName || doc.title || 'Documento Efêmero';
                const fileSize = doc.fileLength ? this.formatBytes(parseInt(doc.fileLength)) : 'Tamanho desconhecido';
                return `📄 ${fileName}\n📊 ${fileSize}`;
            }
        }

        // ✅ MELHORAR: MENSAGENS DE LOCALIZAÇÃO
        if (msg.locationMessage) {
            const loc = msg.locationMessage;
            let locationText = '📍 Localização compartilhada';

            // Adicionar coordenadas com mais precisão
            if (loc.degreesLatitude && loc.degreesLongitude) {
                locationText += `\n🌍 Coordenadas: ${loc.degreesLatitude.toFixed(6)}, ${loc.degreesLongitude.toFixed(6)}`;
            }

            // Adicionar nome do local se disponível
            if (loc.name) {
                locationText += `\n📍 Nome: ${loc.name}`;
            }

            // Adicionar endereço se disponível
            if (loc.address) {
                locationText += `\n📮 Endereço: ${loc.address}`;
            }

            // Adicionar URL se disponível
            if (loc.url) {
                locationText += `\n🔗 URL: ${loc.url}`;
            }

            return locationText;
        }

        // 📄 MELHORADO: DOCUMENTOS COM INFORMAÇÕES DETALHADAS
        if (msg.documentMessage) {
            const doc = msg.documentMessage;
            const fileName = doc.fileName || doc.title || 'Documento';
            const fileSize = doc.fileLength ? this.formatBytes(parseInt(doc.fileLength)) : 'Tamanho desconhecido';
            const mimeType = doc.mimetype?.split('/')[1]?.toUpperCase() || 'ARQUIVO';
            return `📄 ${fileName}\n📊 ${fileSize} • 📎 ${mimeType}`;
        }

        // ✅ MELHORADO: CONTATOS COM VCARD COMPLETO
        if (msg.contactMessage) {
            const contact = msg.contactMessage;
            const displayName = contact.displayName || 'Nome não disponível';
            const vcard = contact.vcard || '';
            return `Contato: ${displayName}\n${vcard}`;
        }

        // ✅ NOVO: MÚLTIPLOS CONTATOS
        if (msg.contactsArrayMessage) {
            const contacts = msg.contactsArrayMessage.contacts || [];
            const displayName = msg.contactsArrayMessage.displayName || 'Contatos';
            let contactsText = `${displayName}\n`;

            contacts.forEach((contact, index) => {
                contactsText += `\n--- CONTATO ${index + 1} ---\n`;
                contactsText += `Nome: ${contact.displayName || 'Sem nome'}\n`;
                contactsText += `${contact.vcard || 'Sem vCard'}\n`;
            });

            return contactsText;
        }

        // ✅ NOVO: LOTTIE STICKERS
        if (msg.lottieStickerMessage) {
            return 'Lottie Sticker Animado';
        }

        // Enquetes
        if (msg.pollCreationMessage || msg.pollCreationMessageV2 || msg.pollCreationMessageV3) {
            const poll = msg.pollCreationMessage || msg.pollCreationMessageV2 || msg.pollCreationMessageV3;
            const options = poll.options?.map((opt) => opt.optionName).join(' | ') || '';
            return `${poll.name || 'Enquete'} [${options}]`;
        }

        // Eventos
        if (msg.eventMessage) {
            const event = msg.eventMessage;
            const startDate = new Date(parseInt(event.startTime) * 1000).toLocaleString('pt-BR');
            const endDate = new Date(parseInt(event.endTime) * 1000).toLocaleString('pt-BR');
            const status = event.isCanceled ? '❌ CANCELADO' : '✅ ATIVO';
            const callInfo = event.isScheduleCall ? '📞 Chamada agendada' : '';
            const guestsInfo = event.extraGuestsAllowed ? '👥 Convidados extras permitidos' : '👥 Lista fechada';
            return `${event.name}\n📝 ${event.description || 'Sem descrição'}\n📅 Início: ${startDate}\n📅 Fim: ${endDate}\n${status} ${callInfo}\n${guestsInfo}`;
        }

        return msg.conversation
            || msg.extendedTextMessage?.text
            || msg.imageMessage?.caption
            || msg.videoMessage?.caption
            || msg.documentMessage?.caption || '';
    }

    // ✅ CORRIGIR a função getMessageTypeFromStatus
    getMessageTypeFromStatus(status) {
        const types = {
            0: 'text',
            1: 'image',
            3: 'sticker',
            4: 'video',
            6: 'audio',
            7: 'document',
            8: 'contact',
            9: 'poll',
            10: 'event',
            11: 'contacts',
            12: 'location', // ✅ NOVO
        };
        return types[status] || 'text';
    }

    // Métricas do sistema
    getMetrics() {
        return {
            ...this.metrics,
            cacheSize: this.messageCache.size,
            rateLimiterSize: this.rateLimiter.size,
            uptime: process.uptime(),
        };
    }
}

module.exports = new AntiDeleteEventManager();
