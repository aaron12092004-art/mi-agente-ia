# 🤖 Agente de Atención al Cliente con IA
**Construido con Claude Code · by [Nicolás Sosa](https://nicolassosa.com)**

Un sistema completo de atención al cliente con IA que incluye chat web, base de conocimiento, dashboard, captura de leads y más — sin bases de datos externas.

---

## 🚀 Inicio Rápido

### 1. Configurar la API Key

```bash
# Copiá el archivo de configuración
cp .env.example .env
```

Abrí el archivo `.env` y reemplazá `tu_api_key_aqui` con tu API Key de Claude.
Conseguila gratis en: **https://console.anthropic.com/**

### 2. Instalar dependencias

```bash
npm install
```

### 3. Encender el agente

```bash
npm start
```

### 4. Abrir en el navegador

| URL | Descripción |
|-----|-------------|
| http://localhost:3000 | 📊 Dashboard de control |
| http://localhost:3000/demo | 🎮 Demo del chat |
| http://localhost:3000/widget | 💬 Widget standalone |

---

## ✅ Funcionalidades Incluidas

| Prompt | Función |
|--------|---------|
| 01 | Chat con IA (Claude) + estilo dark premium con dorado |
| 02 | Base de conocimiento: FAQ, productos, políticas, PDFs |
| 03 | Personalidad personalizable: nombre, tono, idioma |
| 04 | Dashboard: conversaciones en tiempo real + métricas |
| 05 | WhatsApp Business API (webhook listo) |
| 06 | Captura de leads + escalado automático a humano |
| +  | Horarios de atención, entrenamiento continuo, exportar CSV |

---

## ⚙️ Configuración del `.env`

```env
ANTHROPIC_API_KEY=sk-ant-...         # Requerido
PORT=3000                             # Opcional (default: 3000)

# Notificaciones por email (opcional)
NOTIFICATION_EMAIL=tu@email.com
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=tu@gmail.com
SMTP_PASS=contraseña_de_aplicacion

# WhatsApp Business API (opcional)
WHATSAPP_TOKEN=
WHATSAPP_PHONE_NUMBER_ID=
WHATSAPP_VERIFY_TOKEN=mi_token_secreto
```

---

## 🌐 Integrar en tu web

Pegá este código antes del cierre de `</body>` en tu página:

```html
<script>
  window.AgenteIA = {
    serverUrl: 'http://TU-SERVIDOR:3000'
  };
</script>
<script src="http://TU-SERVIDOR:3000/js/widget-embed.js"></script>
```

---

## 📁 Estructura del Proyecto

```
mi-agente-ia/
├── server.js              ← Servidor Express + Claude API
├── package.json
├── .env                   ← Tu configuración (no subir a Git)
├── .env.example           ← Plantilla de configuración
├── data/
│   ├── config.json        ← Config del agente y negocio
│   ├── knowledge.json     ← FAQ, productos, políticas
│   ├── conversations.json ← Historial de chats
│   └── leads.json         ← Leads capturados
├── public/
│   ├── index.html         ← Dashboard
│   ├── widget.html        ← Widget de chat
│   ├── demo.html          ← Página de demo
│   └── js/
│       └── widget-embed.js ← Script para incrustar en webs
└── uploads/               ← PDFs y documentos subidos
```

---

## 💰 Costo Estimado

| Uso | Costo mensual |
|-----|--------------|
| Negocio pequeño (~100 chats/mes) | ~$2-5 USD |
| Negocio mediano (~1000 chats/mes) | ~$10-20 USD |
| Negocio grande (~5000 chats/mes) | ~$40-80 USD |

---

## 🆚 Comparativa

| Servicio | Precio/mes |
|----------|-----------|
| Intercom | $39-99 USD |
| Zendesk | $55-115 USD |
| **Tu agente** | **~$5-20 USD** |

---

## 📖 Aprender Más

Visitá **[nicolassosa.com](https://nicolassosa.com)** para:
- Cursos de vibe coding con IA
- Comunidad privada
- Tutoriales para subir esto a internet con tu dominio
- Plantillas para venderlo como servicio

---

*Hecho con 🤖 y ❤️ — [nicolassosa.com](https://nicolassosa.com)*
