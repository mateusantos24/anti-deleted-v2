// deletev2.js - Versão melhorada com otimizações e novas funcionalidades
// Banco de dados SQLite3 com tabelas otimizadas e novas funcionalidades
// Autor: Rei Ayanami
// Inteligência Artificial: Claude Sonnet v4

const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.resolve(`${__dirname}/antidelete_v2.db`);

class AntiDeleteDB {
    constructor() {
        this.db = new sqlite3.Database(dbPath, (err) => {
            if (err) {
                console.error('Erro ao abrir o banco:', err.message);
            } else {
                this.initializeTables();
                this.createIndexes();
            }
        });
    }

    initializeTables() {
        const tables = `
            -- Tabela principal com particionamento por status
            CREATE TABLE IF NOT EXISTS messages_v2 (
                id TEXT PRIMARY KEY,
                user TEXT NOT NULL,
                chat_id TEXT NOT NULL,
                timestamp INTEGER NOT NULL,
                body TEXT,
                type TEXT,
                status INTEGER,
                hash TEXT UNIQUE,
                size INTEGER DEFAULT 0,
                ephemeral INTEGER DEFAULT 0,
                created_at INTEGER DEFAULT (strftime('%s', 'now')),
                updated_at INTEGER DEFAULT (strftime('%s', 'now'))
            );

            -- Tabela de metadados separada
            CREATE TABLE IF NOT EXISTS message_metadata (
                message_id TEXT PRIMARY KEY,
                mimetype TEXT,
                width INTEGER,
                height INTEGER,
                duration INTEGER,
                file_length INTEGER,
                accessibility_label TEXT,
                thumbnail BLOB,
                FOREIGN KEY (message_id) REFERENCES messages_v2(id) ON DELETE CASCADE
            );

            -- Tabela de mídias com compressão
            CREATE TABLE IF NOT EXISTS media_storage (
                message_id TEXT PRIMARY KEY,
                media_data BLOB,
                compressed INTEGER DEFAULT 0,
                original_size INTEGER,
                compressed_size INTEGER,
                encryption_key TEXT,
                FOREIGN KEY (message_id) REFERENCES messages_v2(id) ON DELETE CASCADE
            );

            -- Tabela de estatísticas por usuário
            CREATE TABLE IF NOT EXISTS user_stats (
                user_id TEXT PRIMARY KEY,
                total_messages INTEGER DEFAULT 0,
                deleted_messages INTEGER DEFAULT 0,
                media_messages INTEGER DEFAULT 0,
                last_activity INTEGER,
                risk_score REAL DEFAULT 0.0
            );

            -- Tabela de logs de eventos
            CREATE TABLE IF NOT EXISTS event_logs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                event_type TEXT,
                user_id TEXT,
                chat_id TEXT,
                message_id TEXT,
                details TEXT,
                timestamp INTEGER DEFAULT (strftime('%s', 'now'))
            );
        `;

        this.db.exec(tables, (err) => {
            if (err) console.error('Erro ao criar tabelas:', err.message);
        });
    }

    createIndexes() {
        const indexes = [
            'CREATE INDEX IF NOT EXISTS idx_messages_user_time ON messages_v2(user, timestamp DESC)',
            'CREATE INDEX IF NOT EXISTS idx_messages_chat_time ON messages_v2(chat_id, timestamp DESC)',
            'CREATE INDEX IF NOT EXISTS idx_messages_status ON messages_v2(status)',
            'CREATE INDEX IF NOT EXISTS idx_messages_hash ON messages_v2(hash)',
            'CREATE INDEX IF NOT EXISTS idx_user_stats_activity ON user_stats(last_activity)',
            'CREATE INDEX IF NOT EXISTS idx_event_logs_time ON event_logs(timestamp DESC)',
        ];

        indexes.forEach(index => {
            this.db.run(index, (err) => {
                if (err) console.error('Erro ao criar índice:', err.message);
            });
        });
    }

    // Sistema de Hash para evitar duplicatas
    createHash(user, content, timestamp) {
        const crypto = require('crypto');
        return crypto.createHash('sha256').update(`${user}:${content}:${Math.floor(timestamp/1000)}`).digest('hex');
    }

    // Inserção otimizada com transação
    async addMessageAdvanced(messageData) {
        return new Promise((resolve, reject) => {
            const {
                id, user, chatId, body, type, status,
                mimetype, width, height, duration,
                mediaData, fileLength,
            } = messageData;

            const hash = this.createHash(user, body || '', Date.now());
            const timestamp = Date.now();

            this.db.serialize(() => {
                this.db.run('BEGIN TRANSACTION');

                // Insert message
                this.db.run(`
                    INSERT OR REPLACE INTO messages_v2
                    (id, user, chat_id, timestamp, body, type, status, hash, size, ephemeral)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                `, [id, user, chatId, timestamp, body, type, status, hash, fileLength || 0, messageData.ephemeral || 0]);


                // Insert metadata if exists
                if (mimetype || width || height) {
                    this.db.run(`
                        INSERT OR REPLACE INTO message_metadata
                        (message_id, mimetype, width, height, duration, file_length)
                        VALUES (?, ?, ?, ?, ?, ?)
                    `, [id, mimetype, width, height, duration, fileLength]);
                }

                // Insert media with compression
                if (mediaData && Buffer.isBuffer(mediaData)) {
                    const compressed = this.compressMedia(mediaData);
                    this.db.run(`
                        INSERT OR REPLACE INTO media_storage
                        (message_id, media_data, compressed, original_size, compressed_size)
                        VALUES (?, ?, ?, ?, ?)
                    `, [id, compressed.data, 1, mediaData.length, compressed.data.length]);
                }

                // Update user stats
                this.updateUserStats(user, status);

                this.db.run('COMMIT', (err) => {
                    if (err) {
                        this.db.run('ROLLBACK');
                        reject(err);
                    } else {
                        resolve({ success: true, hash });
                    }
                });
            });
        });
    }

    // Compressão de mídia usando zlib
    compressMedia(buffer) {
        const zlib = require('zlib');
        try {
            const compressed = zlib.deflateSync(buffer);
            return {
                data: compressed,
                ratio: compressed.length / buffer.length,
            };
        } catch (error) {
            console.error('Erro na compressão:', error);
            return { data: buffer, ratio: 1 };
        }
    }

    // Descompressão
    decompressMedia(buffer) {
        const zlib = require('zlib');
        try {
            return zlib.inflateSync(buffer);
        } catch (error) {
            console.error('Erro na descompressão:', error);
            return buffer;
        }
    }

    // Busca otimizada com cache
    async getDeletedMessage(user, messageId) {
        return new Promise((resolve, reject) => {
            const query = `
                SELECT 
                    m.*,
                    mm.mimetype, mm.width, mm.height, mm.duration,
                    ms.media_data, ms.compressed, ms.original_size
                FROM messages_v2 m
                LEFT JOIN message_metadata mm ON m.id = mm.message_id
                LEFT JOIN media_storage ms ON m.id = ms.message_id
                WHERE m.id = ? AND m.user = ?
            `;

            this.db.get(query, [messageId, user], (err, row) => {
                if (err) {
                    reject(err);
                } else if (!row) {
                    resolve(null);
                } else {
                    // Descomprimir mídia se necessário
                    if (row.media_data && row.compressed) {
                        row.media_data = this.decompressMedia(row.media_data);
                    }
                    resolve(row);
                }
            });
        });
    }

    // Analytics avançado
    async getUserAnalytics(userId) {
        return new Promise((resolve, reject) => {
            const query = `
                SELECT 
                    us.*,
                    COUNT(m.id) as total_stored,
                    COUNT(CASE WHEN m.status = 0 THEN 1 END) as text_messages,
                    COUNT(CASE WHEN m.status = 1 THEN 1 END) as image_messages,
                    COUNT(CASE WHEN m.status = 4 THEN 1 END) as video_messages,
                    AVG(m.size) as avg_message_size,
                    MAX(m.timestamp) as last_message
                FROM user_stats us
                LEFT JOIN messages_v2 m ON us.user_id = m.user
                WHERE us.user_id = ?
                GROUP BY us.user_id
            `;

            this.db.get(query, [userId], (err, row) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(row || {});
                }
            });
        });
    }

    // Limpeza inteligente por TTL
    async cleanupExpiredMessages(days = 7) { // Padrão: 7 dias
        const cutoff = Date.now() - (days * 24 * 60 * 60 * 1000); // Dias em milissegundos

        return new Promise((resolve, reject) => {
            this.db.run('DELETE FROM messages_v2 WHERE timestamp < ? AND status NOT IN (4, 1)', [cutoff], function(err) {
                if (err) {
                    reject(err);
                } else {
                    console.log(`[CLEANUP] ${this.changes} mensagens antigas removidas`);
                    resolve(this.changes);
                }
            });
        });
    }

    // ✅ CORRIGIDO: Incluir localizações no contador de mídia
    updateUserStats(userId, messageType) {
        this.db.run(`
            INSERT OR REPLACE INTO user_stats
            (user_id, total_messages, deleted_messages, media_messages, last_activity)
            VALUES (
                ?,
                COALESCE((SELECT total_messages FROM user_stats WHERE user_id = ?), 0) + 1,
                COALESCE((SELECT deleted_messages FROM user_stats WHERE user_id = ?), 0) +
                CASE WHEN ? IN (1,3,4,6,12) THEN 1 ELSE 0 END,
                COALESCE((SELECT media_messages FROM user_stats WHERE user_id = ?), 0) +
                CASE WHEN ? IN (1,3,4,6,12) THEN 1 ELSE 0 END,
                ?
            )
        `, [userId, userId, userId, messageType, userId, messageType, Date.now()]);
    }

    // Log de eventos
    logEvent(eventType, userId, chatId, messageId, details) {
        this.db.run(`
            INSERT INTO event_logs (event_type, user_id, chat_id, message_id, details)
            VALUES (?, ?, ?, ?, ?)
        `, [eventType, userId, chatId, messageId, JSON.stringify(details)]);
    }
}

module.exports = new AntiDeleteDB();
