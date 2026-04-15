// ============================================================
// AGENTE DE ATENCIÓN AL CLIENTE CON IA
// Desarrollado por Aaron Rodriguez
// ============================================================

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs');
const path = require('path');
const Groq = require('groq-sdk');

const app = express();
const PORT = process.env.PORT || 3000;

// ---- Middleware ----
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// ---- Cliente Groq ----
const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY || 'YOUR_GROQ_API_KEY_HERE',
});

// ---- Upload de archivos ----
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, path.join(__dirname, 'uploads')),
  filename: (req, file, cb) => cb(null, `${Date.now()}-${file.originalname}`),
});
const upload = multer({ storage, limits: { fileSize: 10 * 1024 * 1024 } });

// ============================================================
// HELPERS — Leer/Escribir datos locales
// ============================================================
const DATA_DIR = path.join(__dirname, 'data');

function readJSON(filename) {
  try {
    const content = fs.readFileSync(path.join(DATA_DIR, filename), 'utf8');
    return JSON.parse(content);
  } catch {
    return null;
  }
}

function writeJSON(filename, data) {
  fs.writeFileSync(path.join(DATA_DIR, filename), JSON.stringify(data, null, 2), 'utf8');
}

function getConfig() { return readJSON('config.json'); }
function getKnowledge() { return readJSON('knowledge.json'); }
function getConversations() { return readJSON('conversations.json') || []; }
function getLeads() { return readJSON('leads.json') || []; }

// ============================================================
// HELPER — Verificar horario de atención
// ============================================================
function isWithinBusinessHours(config) {
  if (!config.schedule || !config.schedule.enabled) return true;
  const now = new Date();
  const day = now.getDay(); // 0=Dom, 1=Lun...6=Sab
  const timeStr = `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;

  if (day === 0) return !config.schedule.sunday?.closed;
  if (day === 6) {
    if (config.schedule.saturday?.closed) return false;
    return timeStr >= config.schedule.saturday.start && timeStr <= config.schedule.saturday.end;
  }
  return timeStr >= config.schedule.weekdays.start && timeStr <= config.schedule.weekdays.end;
}

// ============================================================
// HELPER — Construir system prompt desde la config y knowledge base
// ============================================================
function buildSystemPrompt(config, knowledge) {
  const biz = config.business;
  const agent = config.agent;

  let faqText = '';
  if (knowledge.faq && knowledge.faq.length > 0) {
    faqText = '\n\n## PREGUNTAS FRECUENTES\n' + knowledge.faq
      .map(f => `P: ${f.question}\nR: ${f.answer}`).join('\n\n');
  }

  let productsText = '';
  if (knowledge.products && knowledge.products.length > 0) {
    productsText = '\n\n## PRODUCTOS Y SERVICIOS\n' + knowledge.products
      .map(p => `- ${p.name}: ${p.description} | Precio: ${p.price}`).join('\n');
  }

  let policiesText = '';
  if (knowledge.policies) {
    const pol = knowledge.policies;
    policiesText = '\n\n## POLÍTICAS\n';
    if (pol.returns) policiesText += `- Devoluciones: ${pol.returns}\n`;
    if (pol.shipping) policiesText += `- Envíos: ${pol.shipping}\n`;
    if (pol.warranty) policiesText += `- Garantía: ${pol.warranty}\n`;
  }

  let customDocsText = '';
  if (knowledge.customDocs && knowledge.customDocs.length > 0) {
    customDocsText = '\n\n## INFORMACIÓN ADICIONAL\n' + knowledge.customDocs
      .map(d => d.content).join('\n\n');
  }

  let trainedText = '';
  if (knowledge.trainedAnswers && knowledge.trainedAnswers.length > 0) {
    trainedText = '\n\n## RESPUESTAS ENTRENADAS\n' + knowledge.trainedAnswers
      .map(t => `P: ${t.question}\nR: ${t.answer}`).join('\n\n');
  }

  return `Eres ${agent.name}, el asistente virtual de atención al cliente de "${biz.name}".

## TU PERSONALIDAD
Eres ${agent.personality}. Tu tono es ${agent.tone}. Siempre hablás en ${agent.language === 'es' ? 'español' : agent.language}.

## INFORMACIÓN DEL NEGOCIO
- Nombre: ${biz.name}
- Descripción: ${biz.description}
- Teléfono: ${biz.phone}
- Email: ${biz.email}
- Web: ${biz.website}
- Dirección: ${biz.address}
- Horario: Lunes a Viernes ${config.schedule?.weekdays?.start || '9:00'} - ${config.schedule?.weekdays?.end || '18:00'}hs, Sábados ${config.schedule?.saturday?.start || '9:00'} - ${config.schedule?.saturday?.end || '13:00'}hs
${faqText}${productsText}${policiesText}${customDocsText}${trainedText}

## INSTRUCCIONES IMPORTANTES
1. Respondé siempre con información real y precisa del negocio. Si no sabés algo, decí que lo vas a consultar.
2. Sé conciso pero completo. No des respuestas demasiado largas.
3. Si alguien pregunta por algo que no está en tu base de conocimiento, indicá que no tenés esa información y ofrecé conectarlos con un humano.
4. Si detectás que el cliente está frustrado, mostrá empatía y ofrecé escalar a un humano.
5. Si alguien dice "hablar con humano", "agente humano", "persona real" o similar, respondé que entendiste y que vas a escalarlo.
6. Usá emojis con moderación para dar calidez, pero no exagerés.
7. NUNCA inventes precios ni información que no esté en tu base de conocimiento.
8. Si el cliente proporciona su email, confirmá que lo registraste para el seguimiento.

Cuando necesites escalar a un humano, terminá tu respuesta con exactamente este texto: [ESCALAR_A_HUMANO]
Cuando captures el email de un cliente, terminá con: [EMAIL_CAPTURADO: email@ejemplo.com]`;
}

// ============================================================
// HELPER — Notificación por email (si está configurado)
// ============================================================
async function sendEmailNotification(subject, body) {
  if (!process.env.SMTP_USER || !process.env.NOTIFICATION_EMAIL) return;
  try {
    const nodemailer = require('nodemailer');
    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST || 'smtp.gmail.com',
      port: parseInt(process.env.SMTP_PORT) || 587,
      secure: false,
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    });
    await transporter.sendMail({
      from: process.env.SMTP_USER,
      to: process.env.NOTIFICATION_EMAIL,
      subject: `🤖 Agente IA: ${subject}`,
      html: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto">
        <h2 style="color:#D4AF37">🤖 Agente IA - Notificación</h2>
        <div style="background:#f5f5f5;padding:20px;border-radius:8px">${body}</div>
        <p style="color:#888;font-size:12px;margin-top:20px">Sistema de Atención al Cliente IA</p>
      </div>`,
    });
  } catch (err) {
    console.log('Email no configurado o error al enviar:', err.message);
  }
}

// ============================================================
// API — CHAT (Prompt 01 + 02 + 03 + 06)
// ============================================================
app.post('/api/chat', async (req, res) => {
  const { message, conversationId, channel = 'web', clientName, clientEmail } = req.body;

  if (!message) return res.status(400).json({ error: 'Mensaje requerido' });

  const config = getConfig();
  const knowledge = getKnowledge();
  const conversations = getConversations();

  // Buscar o crear conversación
  let convo = conversations.find(c => c.id === conversationId);
  const isNew = !convo;

  if (!convo) {
    convo = {
      id: conversationId || uuidv4(),
      channel,
      clientName: clientName || 'Visitante',
      clientEmail: clientEmail || null,
      messages: [],
      status: 'active',
      escalated: false,
      leadCaptured: false,
      startedAt: new Date().toISOString(),
      lastActivity: new Date().toISOString(),
      tags: [],
    };
    conversations.push(convo);
  }

  // Verificar horario
  const withinHours = isWithinBusinessHours(config);

  // Agregar mensaje del usuario
  convo.messages.push({ role: 'user', content: message, timestamp: new Date().toISOString() });
  convo.lastActivity = new Date().toISOString();

  try {
    // Construir historial para Claude (últimos 20 mensajes)
    const systemPrompt = buildSystemPrompt(config, knowledge);
    const messageHistory = convo.messages.slice(-20).map(m => ({
      role: m.role === 'user' ? 'user' : 'assistant',
      content: m.content,
    }));

    // Agregar contexto de horario si está fuera de horario
    let contextualSystem = systemPrompt;
    if (!withinHours) {
      contextualSystem += `\n\nIMPORTANTE: En este momento estamos FUERA DEL HORARIO DE ATENCIÓN. Informá al cliente amablemente y decile que su consulta quedó registrada.`;
    }

    // Llamar a Groq
    const response = await groq.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      max_tokens: 1024,
      messages: [
        { role: 'system', content: contextualSystem },
        ...messageHistory,
      ],
    });

    let assistantMessage = response.choices[0].message.content;

    // Detectar escalado
    let needsEscalation = false;
    if (assistantMessage.includes('[ESCALAR_A_HUMANO]')) {
      needsEscalation = true;
      assistantMessage = assistantMessage.replace('[ESCALAR_A_HUMANO]', '').trim();
      convo.escalated = true;
      convo.status = 'escalated';
      convo.tags.push('escalado');

      // Notificar por email
      await sendEmailNotification(
        'Conversación escalada a humano',
        `<p><strong>Cliente:</strong> ${convo.clientName}</p>
         <p><strong>Email:</strong> ${convo.clientEmail || 'No proporcionado'}</p>
         <p><strong>Canal:</strong> ${channel}</p>
         <p><strong>Último mensaje:</strong> ${message}</p>
         <p><strong>ID Conversación:</strong> ${convo.id}</p>
         <p><a href="http://localhost:${PORT}">Ver en Dashboard →</a></p>`
      );
    }

    // Detectar email capturado
    const emailMatch = assistantMessage.match(/\[EMAIL_CAPTURADO:\s*([^\]]+)\]/);
    if (emailMatch) {
      const capturedEmail = emailMatch[1].trim();
      assistantMessage = assistantMessage.replace(emailMatch[0], '').trim();
      convo.clientEmail = capturedEmail;
      convo.leadCaptured = true;

      // Guardar lead
      const leads = getLeads();
      const existingLead = leads.find(l => l.email === capturedEmail);
      if (!existingLead) {
        leads.push({
          id: uuidv4(),
          email: capturedEmail,
          name: convo.clientName,
          channel,
          conversationId: convo.id,
          capturedAt: new Date().toISOString(),
          source: 'chat-widget',
        });
        writeJSON('leads.json', leads);

        await sendEmailNotification(
          'Nuevo lead capturado',
          `<p><strong>Email:</strong> ${capturedEmail}</p>
           <p><strong>Nombre:</strong> ${convo.clientName}</p>
           <p><strong>Canal:</strong> ${channel}</p>
           <p><strong>Fecha:</strong> ${new Date().toLocaleString('es-AR')}</p>`
        );
      }
    }

    // Guardar mensaje del asistente
    convo.messages.push({
      role: 'assistant',
      content: assistantMessage,
      timestamp: new Date().toISOString(),
    });

    // Guardar conversaciones
    writeJSON('conversations.json', conversations);

    // Respuesta al cliente
    res.json({
      conversationId: convo.id,
      message: assistantMessage,
      escalated: needsEscalation,
      withinHours,
      isNew,
    });

  } catch (err) {
    console.error('Error de Claude:', err.message);

    let errorMsg = config.agent.unknownResponse;
    if (err.message && err.message.includes('API key')) {
      errorMsg = 'Error de configuración: GROQ_API_KEY no válida. Verificá tu archivo .env';
    }

    convo.messages.push({ role: 'assistant', content: errorMsg, timestamp: new Date().toISOString() });
    writeJSON('conversations.json', conversations);

    res.json({ conversationId: convo.id, message: errorMsg, error: true });
  }
});

// ============================================================
// API — CONFIGURACIÓN (Prompt 03)
// ============================================================
app.get('/api/config', (req, res) => {
  res.json(getConfig());
});

app.post('/api/config', (req, res) => {
  const current = getConfig();
  const updated = deepMerge(current, req.body);
  writeJSON('config.json', updated);
  res.json({ success: true, config: updated });
});

function deepMerge(target, source) {
  const result = { ...target };
  for (const key of Object.keys(source)) {
    if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
      result[key] = deepMerge(target[key] || {}, source[key]);
    } else {
      result[key] = source[key];
    }
  }
  return result;
}

// ============================================================
// API — BASE DE CONOCIMIENTO (Prompt 02)
// ============================================================
app.get('/api/knowledge', (req, res) => {
  res.json(getKnowledge());
});

app.post('/api/knowledge', (req, res) => {
  const current = getKnowledge();
  const updated = { ...current, ...req.body };
  writeJSON('knowledge.json', updated);
  res.json({ success: true });
});

// Subir PDF o texto como documento de conocimiento
app.post('/api/knowledge/upload', upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No se subió ningún archivo' });

  const knowledge = getKnowledge();
  let content = '';
  const filename = req.file.originalname;

  try {
    if (req.file.mimetype === 'application/pdf') {
      const pdfParse = require('pdf-parse');
      const buffer = fs.readFileSync(req.file.path);
      const data = await pdfParse(buffer);
      content = data.text;
    } else {
      content = fs.readFileSync(req.file.path, 'utf8');
    }

    const doc = {
      id: uuidv4(),
      filename,
      content: content.substring(0, 10000), // Máximo 10k chars
      uploadedAt: new Date().toISOString(),
    };

    if (!knowledge.customDocs) knowledge.customDocs = [];
    knowledge.customDocs.push(doc);
    writeJSON('knowledge.json', knowledge);

    // Limpiar archivo temporal
    fs.unlinkSync(req.file.path);

    res.json({ success: true, doc });
  } catch (err) {
    res.status(500).json({ error: 'Error procesando el archivo: ' + err.message });
  }
});

app.delete('/api/knowledge/doc/:id', (req, res) => {
  const knowledge = getKnowledge();
  knowledge.customDocs = (knowledge.customDocs || []).filter(d => d.id !== req.params.id);
  writeJSON('knowledge.json', knowledge);
  res.json({ success: true });
});

// ============================================================
// API — DASHBOARD (Prompt 04)
// ============================================================
app.get('/api/conversations', (req, res) => {
  const convos = getConversations();
  const { status, channel, limit = 50 } = req.query;

  let filtered = convos;
  if (status) filtered = filtered.filter(c => c.status === status);
  if (channel) filtered = filtered.filter(c => c.channel === channel);

  filtered.sort((a, b) => new Date(b.lastActivity) - new Date(a.lastActivity));
  res.json(filtered.slice(0, parseInt(limit)));
});

app.get('/api/conversations/:id', (req, res) => {
  const convos = getConversations();
  const convo = convos.find(c => c.id === req.params.id);
  if (!convo) return res.status(404).json({ error: 'No encontrada' });
  res.json(convo);
});

app.patch('/api/conversations/:id', (req, res) => {
  const convos = getConversations();
  const idx = convos.findIndex(c => c.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'No encontrada' });
  convos[idx] = { ...convos[idx], ...req.body };
  writeJSON('conversations.json', convos);
  res.json(convos[idx]);
});

// Métricas para el dashboard
app.get('/api/metrics', (req, res) => {
  const convos = getConversations();
  const leads = getLeads();
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const weekStart = new Date(todayStart); weekStart.setDate(weekStart.getDate() - 7);

  const todays = convos.filter(c => new Date(c.startedAt) >= todayStart);
  const thisWeek = convos.filter(c => new Date(c.startedAt) >= weekStart);

  // Preguntas más frecuentes (palabras clave)
  const wordMap = {};
  convos.forEach(c => c.messages
    .filter(m => m.role === 'user')
    .forEach(m => m.content.toLowerCase().split(/\s+/).forEach(w => {
      if (w.length > 4) wordMap[w] = (wordMap[w] || 0) + 1;
    }))
  );
  const topKeywords = Object.entries(wordMap)
    .sort(([,a],[,b]) => b-a).slice(0, 10)
    .map(([word, count]) => ({ word, count }));

  // Tasa de resolución
  const resolved = convos.filter(c => c.status === 'resolved').length;
  const escalated = convos.filter(c => c.escalated).length;
  const resolutionRate = convos.length > 0
    ? Math.round(((convos.length - escalated) / convos.length) * 100)
    : 0;

  // Canales
  const byChannel = {};
  convos.forEach(c => { byChannel[c.channel] = (byChannel[c.channel] || 0) + 1; });

  // Actividad por hora
  const byHour = Array(24).fill(0);
  convos.forEach(c => {
    const h = new Date(c.startedAt).getHours();
    byHour[h]++;
  });

  res.json({
    total: convos.length,
    today: todays.length,
    thisWeek: thisWeek.length,
    active: convos.filter(c => c.status === 'active').length,
    escalated,
    resolved,
    resolutionRate,
    totalLeads: leads.length,
    newLeadsToday: leads.filter(l => new Date(l.capturedAt) >= todayStart).length,
    topKeywords,
    byChannel,
    byHour,
  });
});

// ============================================================
// API — LEADS (Prompt 06)
// ============================================================
app.get('/api/leads', (req, res) => {
  res.json(getLeads());
});

app.post('/api/leads', (req, res) => {
  const { email, name, phone, source = 'manual', conversationId } = req.body;
  if (!email) return res.status(400).json({ error: 'Email requerido' });

  const leads = getLeads();
  const exists = leads.find(l => l.email === email);
  if (exists) return res.json({ success: true, lead: exists, alreadyExists: true });

  const lead = {
    id: uuidv4(),
    email, name, phone, source, conversationId,
    capturedAt: new Date().toISOString(),
  };
  leads.push(lead);
  writeJSON('leads.json', leads);

  sendEmailNotification('Nuevo lead manual', `<p>Email: ${email}</p><p>Nombre: ${name}</p>`);
  res.json({ success: true, lead });
});

app.delete('/api/leads/:id', (req, res) => {
  const leads = getLeads().filter(l => l.id !== req.params.id);
  writeJSON('leads.json', leads);
  res.json({ success: true });
});

// Exportar leads como CSV
app.get('/api/leads/export/csv', (req, res) => {
  const leads = getLeads();
  const csv = [
    'ID,Email,Nombre,Teléfono,Canal,Fecha',
    ...leads.map(l => `${l.id},${l.email},${l.name || ''},${l.phone || ''},${l.source || ''},${l.capturedAt}`)
  ].join('\n');

  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename=leads.csv');
  res.send(csv);
});

// ============================================================
// API — ENTRENAMIENTO (Prompt 13)
// ============================================================
app.get('/api/unresolved', (req, res) => {
  const convos = getConversations();
  // Buscar conversaciones donde el agente dijo que no sabía
  const unresolved = [];
  convos.forEach(c => {
    c.messages.forEach((m, i) => {
      if (m.role === 'assistant' &&
          (m.content.includes('no tengo esa información') ||
           m.content.includes('no cuento con') ||
           m.content.includes('no sé') ||
           c.escalated)) {
        const userMsg = c.messages[i - 1];
        if (userMsg && userMsg.role === 'user') {
          unresolved.push({
            conversationId: c.id,
            userQuestion: userMsg.content,
            agentResponse: m.content,
            timestamp: m.timestamp,
          });
        }
      }
    });
  });
  res.json(unresolved.slice(0, 20));
});

app.post('/api/train', (req, res) => {
  const { question, answer } = req.body;
  if (!question || !answer) return res.status(400).json({ error: 'Pregunta y respuesta requeridas' });

  const knowledge = getKnowledge();
  if (!knowledge.trainedAnswers) knowledge.trainedAnswers = [];

  knowledge.trainedAnswers.push({
    id: uuidv4(),
    question, answer,
    trainedAt: new Date().toISOString(),
  });
  writeJSON('knowledge.json', knowledge);
  res.json({ success: true });
});

// ============================================================
// API — WHATSAPP WEBHOOK (Prompt 05)
// ============================================================
app.get('/api/whatsapp/webhook', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === (process.env.WHATSAPP_VERIFY_TOKEN || 'mi_token_secreto')) {
    console.log('✅ WhatsApp webhook verificado');
    res.status(200).send(challenge);
  } else {
    res.sendStatus(403);
  }
});

app.post('/api/whatsapp/webhook', async (req, res) => {
  try {
    const body = req.body;
    if (body.object !== 'whatsapp_business_account') return res.sendStatus(400);

    const entry = body.entry?.[0];
    const changes = entry?.changes?.[0];
    const message = changes?.value?.messages?.[0];

    if (!message || message.type !== 'text') return res.sendStatus(200);

    const from = message.from;
    const text = message.text.body;
    const waId = `wa_${from}`;

    // Procesar como chat normal
    const config = getConfig();
    const knowledge = getKnowledge();
    const conversations = getConversations();

    let convo = conversations.find(c => c.id === waId);
    if (!convo) {
      convo = {
        id: waId,
        channel: 'whatsapp',
        clientName: `WhatsApp ${from}`,
        clientPhone: from,
        clientEmail: null,
        messages: [],
        status: 'active',
        escalated: false,
        leadCaptured: false,
        startedAt: new Date().toISOString(),
        lastActivity: new Date().toISOString(),
        tags: ['whatsapp'],
      };
      conversations.push(convo);
    }

    convo.messages.push({ role: 'user', content: text, timestamp: new Date().toISOString() });

    const response = await groq.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      max_tokens: 512,
      messages: [
        { role: 'system', content: buildSystemPrompt(config, knowledge) },
        ...convo.messages.slice(-10).map(m => ({ role: m.role === 'user' ? 'user' : 'assistant', content: m.content })),
      ],
    });

    const reply = response.choices[0].message.content.replace(/\[ESCALAR_A_HUMANO\]/g, '').replace(/\[EMAIL_CAPTURADO:[^\]]+\]/g, '').trim();
    convo.messages.push({ role: 'assistant', content: reply, timestamp: new Date().toISOString() });
    convo.lastActivity = new Date().toISOString();
    writeJSON('conversations.json', conversations);

    // Enviar respuesta por WhatsApp si está configurado
    if (process.env.WHATSAPP_TOKEN && process.env.WHATSAPP_PHONE_NUMBER_ID) {
      await fetch(`https://graph.facebook.com/v17.0/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${process.env.WHATSAPP_TOKEN}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          to: from,
          type: 'text',
          text: { body: reply },
        }),
      });
    }

    res.sendStatus(200);
  } catch (err) {
    console.error('Error WhatsApp webhook:', err);
    res.sendStatus(500);
  }
});

// ============================================================
// API — REPORTE SEMANAL (Prompt 10)
// ============================================================
app.get('/api/report/weekly', (req, res) => {
  const convos = getConversations();
  const leads = getLeads();
  const weekAgo = new Date(); weekAgo.setDate(weekAgo.getDate() - 7);

  const weekConvos = convos.filter(c => new Date(c.startedAt) >= weekAgo);
  const weekLeads = leads.filter(l => new Date(l.capturedAt) >= weekAgo);

  const escalated = weekConvos.filter(c => c.escalated).length;
  const resolutionRate = weekConvos.length > 0
    ? Math.round(((weekConvos.length - escalated) / weekConvos.length) * 100)
    : 0;

  const wordMap = {};
  weekConvos.forEach(c => c.messages
    .filter(m => m.role === 'user')
    .forEach(m => m.content.toLowerCase().split(/\s+/).forEach(w => {
      if (w.length > 4) wordMap[w] = (wordMap[w] || 0) + 1;
    }))
  );
  const topQuestions = Object.entries(wordMap).sort(([,a],[,b]) => b-a).slice(0, 5);

  res.json({
    period: { from: weekAgo.toISOString(), to: new Date().toISOString() },
    summary: {
      totalConversations: weekConvos.length,
      resolved: weekConvos.length - escalated,
      escalated,
      resolutionRate,
      newLeads: weekLeads.length,
      channels: weekConvos.reduce((acc, c) => { acc[c.channel] = (acc[c.channel]||0)+1; return acc; }, {}),
    },
    topKeywords: topQuestions.map(([w,c]) => ({ word: w, count: c })),
    suggestions: [
      resolutionRate < 70 ? 'Considerá agregar más información a tu base de conocimiento' : null,
      escalated > 5 ? 'Hay muchas escalaciones — revisá las preguntas sin respuesta' : null,
      weekLeads.length === 0 ? 'No se capturaron leads — considerá agregar más llamadas a la acción' : null,
    ].filter(Boolean),
  });
});

// ============================================================
// TEMP — guardar token en .env
// ============================================================
app.post('/api/save-token', (req, res) => {
  const { token } = req.body;
  if (!token) return res.status(400).json({ error: 'no token' });
  const envPath = require('path').join(__dirname, '.env');
  let env = require('fs').readFileSync(envPath, 'utf8');
  env = env.replace(/^WHATSAPP_TOKEN=.*/m, `WHATSAPP_TOKEN=${token}`);
  require('fs').writeFileSync(envPath, env);
  console.log('✅ Token guardado en .env');
  res.json({ ok: true });
});

// ============================================================
// RUTAS PRINCIPALES
// ============================================================
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.get('/widget', (req, res) => res.sendFile(path.join(__dirname, 'public', 'widget.html')));
app.get('/demo', (req, res) => res.sendFile(path.join(__dirname, 'public', 'demo.html')));

// ============================================================
// INICIAR SERVIDOR
// ============================================================
app.listen(PORT, () => {
  console.log('\n');
  console.log('╔════════════════════════════════════════════════════════╗');
  console.log('║       🤖 AGENTE DE ATENCIÓN AL CLIENTE CON IA          ║');
  console.log('╠════════════════════════════════════════════════════════╣');
  console.log(`║  🌐 Dashboard:  http://localhost:${PORT}                  ║`);
  console.log(`║  💬 Widget:     http://localhost:${PORT}/widget            ║`);
  console.log(`║  🎮 Demo:       http://localhost:${PORT}/demo              ║`);
  console.log('╠════════════════════════════════════════════════════════╣');
  console.log('║  👤 by Aaron Rodriguez & Brad Monge                    ║');
  console.log('╚════════════════════════════════════════════════════════╝');
  console.log('\n');

  if (!process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY === 'YOUR_API_KEY_HERE') {
    console.log('⚠️  ATENCIÓN: No hay API Key configurada.');
    console.log('   → Copiá .env.example como .env y agregá tu ANTHROPIC_API_KEY');
    console.log('   → Conseguila en: https://console.anthropic.com/\n');
  }
});
