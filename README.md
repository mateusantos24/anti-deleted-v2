# 🛡️ Anti-Deleted v2

**Sistema avançado de recuperação de mensagens deletadas para WhatsApp usando Baileys**

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js Version](https://img.shields.io/badge/node-%3E%3D%2016.0.0-brightgreen)](https://nodejs.org/)
[![Baileys](https://img.shields.io/badge/Baileys-6.0%2B-blue)](https://github.com/WhiskeySockets/Baileys)

> 🚀 Sistema completo de anti-delete com suporte a todos os tipos de mídia do WhatsApp, incluindo localizações, contatos, documentos, stickers e muito mais!

## ✨ **Funcionalidades**

### 📱 **Tipos de Mídia Suportados**
- ✅ **Texto** - Mensagens de texto e texto estendido
- ✅ **Imagens** - JPEG, PNG, WebP com caption
- ✅ **Vídeos** - MP4, AVI com caption e duração
- ✅ **Áudios** - MP3, AAC, OGG com duração
- ✅ **Documentos** - PDF, DOC, XLS com informações de arquivo
- ✅ **Stickers** - Stickers estáticos e animados (Lottie)
- ✅ **Contatos** - vCard individual e múltiplos contatos
- ✅ **Localizações** - Coordenadas, nome, endereço e thumbnail
- ✅ **Enquetes** - Polls com opções e resultados
- ✅ **Eventos** - Eventos do calendário com data/hora
- ✅ **Newsletters** - Canais e mensagens de newsletter

### 🔧 **Recursos Avançados**
- 🗄️ **Banco de dados SQLite** com compressão de mídia
- 🔄 **Sistema de cache** inteligente com TTL
- 📊 **Analytics de usuário** e detecção de comportamento suspeito
- 🛡️ **Rate limiting** para prevenir spam
- 📝 **Logs detalhados** de todos os eventos
- 🎯 **Sistema de fallbacks** para garantir entrega
- 🔒 **Compressão de mídia** para economizar espaço

## 🚀 **Instalação**

### Pré-requisitos
- Node.js 18x ou superior
- NPM ou Yarn

### Dependências
- npm install baileys@v6.7.18 sqlite3 moment-timezone axios zlib events

### Integração com Iris Bot
- Se você está usando o [Iris Bot](https://github.com/KillovSky/iris):
```
cd seu-projeto-iris/lib/Functions/Listener/

# Cole os arquivos do Anti-Delete v2 aqui:

# - index.js (renomeie se necessário) ⚠

# - antiDeleteEventManager.js

# - deletev2.js

```

### Configuração Básica
1. Clone o repositório:
- git clone https://github.com/mateusantos24/anti-deleted-v2.git
- cd anti-deleted-v2

2. Configure as variáveis de ambiente:
- EVENTOLOGS=123456789@g.us

3. Integre os arquivos ao seu bot Baileys:
- const AntiDeleteEventManager = require('./antiDeleteEventManager');
- const AntiDeleteDB = require('./deletev2');

## 📋 **Como Usar**

### Integração Básica
// No seu listener principal
const createListener = require('./index');

### Integração Básica
```javascript
// Configurar o sistema
kill.ev.on('messages.upsert', async ({ messages }) => {
    for (const msg of messages) {
        // O sistema processa automaticamente
        await AntiDeleteEventManager.processEvent('message.new', {
            message: msg,
            user: msg.key.participant || msg.key.remoteJid,
            chatId: msg.key.remoteJid
        });
    }
});
```

### Personalização de Notificações
// Customizar templates de notificação
const templates = {
text: `*🗑️ MENSAGEM DELETADA*
👤 ${userName}`,
image: `*🖼️ IMAGEM DELETADA*
👤 ${userName}`,
location: `*📍 LOCALIZAÇÃO DELETADA*
👤 ${userName}`
};


## 📊 **Exemplo de Notificação**
🗑 MENSAGEM DELETADA
👤 Rei Ayanam

👀 AUTO-REMOVER (Quem Deletou)
> Removido pelo próprio autor

⏰ DATA DE REGISTRO
> 10/09/2025, 05:43:06

👤 NÚMERO DO WHATSAPP
> 55419...

💬 ID DO GRUPO
> 123456789@g.us

📝 DESCRIÇÃO
> teste

## 📈 **Performance**

- **⚡ Cache TTL**: 5 minutos para mensagens recentes
- **🗜️ Compressão**: Até 70% de redução no tamanho das mídias
- **📊 Rate Limit**: 50 mensagens por minuto por usuário
- **🧹 Limpeza automática**: Remove mensagens antigas após 7 dias
- **💾 Banco indexado**: Consultas otimizadas com índices SQLite

## 🔧 **Configurações Avançadas**

### Rate Limiting
// Personalizar limites
const rateLimiter = {
window: 60000, // 1 minuto
limit: 50 // 50 mensagens
};

### Compressão de Mídia
// Configurar compressão
const compressMedia = (buffer) => {
return zlib.deflateSync(buffer);
};

### Analytics
// Obter métricas
const metrics = AntiDeleteEventManager.getMetrics();
console.log('Processadas:', metrics.processed);
console.log('Cache size:', metrics.cacheSize);

## 🐛 **Resolução de Problemas**

### Problemas Comuns

**❌ Erro: "Invalid media type"**
- Solução: O sistema usa fallback automático para imagem

**❌ Mensagens não são salvas**
- Verifique se o evento `message.new` está sendo processado
- Confirme as permissões do banco SQLite

**❌ Rate limit ativado**
- Ajuste os limites no `rateLimiter`
- Implemente whitelist para usuários VIP

## 🤝 **Contribuição**

1. Fork o projeto
2. Crie sua feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit suas mudanças (`git commit -m 'Add some AmazingFeature'`)
4. Push para a branch (`git push origin feature/AmazingFeature`)
5. Abra um Pull Request

## 🙏 **Agradecimentos**

- [Baileys](https://github.com/WhiskeySockets/Baileys) - WhatsApp Web API
- [SQLite](https://www.sqlite.org/) - Banco de dados embarcado

**⭐ Se este projeto te ajudou, não esqueça de dar uma estrela no GitHub!**
// Exemplo rápido de uso
const AntiDeleteEventManager = require('./antiDeleteEventManager');

// Sistema funcionando automaticamente! 🚀
console.log('Anti-Deleted v2 ativado! ✅');
