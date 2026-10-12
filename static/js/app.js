/**
 * NOVA AI - Modern Interactive Frontend Controller
 * Multi-turn chat, Flux image studio, Voice input, Speech synthesis & Session persistence
 */

// ============================================================================
// State Management & Storage
// ============================================================================
const STORAGE_KEYS = {
    SESSIONS: 'nova_ai_sessions_v1',
    ACTIVE_ID: 'nova_ai_active_session_v1',
    THEME: 'nova_ai_theme_v1',
    MODE: 'nova_ai_mode_v1',
    IMAGE_STYLE: 'nova_ai_image_style_v1'
};

const AppState = {
    sessions: {},
    activeSessionId: null,
    currentMode: 'auto', // 'auto', 'text', 'image'
    currentStyle: 'default',
    isGenerating: false,
    theme: 'dark',
    recognition: null,
    isListening: false,
    currentSpeakingMsgId: null
};

// ============================================================================
// Initialization
// ============================================================================
document.addEventListener('DOMContentLoaded', () => {
    initTheme();
    initStorage();
    initViewRouter();
    initParticleCanvas();
    initSpeechRecognition();
    setupEventListeners();
    renderSidebarSessions();
    renderCurrentSession();
    checkBackendStatus();
});

// Configure Marked.js for markdown parsing
if (typeof marked !== 'undefined') {
    marked.setOptions({
        breaks: true,
        gfm: true,
        highlight: function (code, lang) {
            if (typeof hljs !== 'undefined' && lang && hljs.getLanguage(lang)) {
                try {
                    return hljs.highlight(code, { language: lang }).value;
                } catch (e) { }
            }
            return typeof hljs !== 'undefined' ? hljs.highlightAuto(code).value : code;
        }
    });
}

// ============================================================================
// Theme Handling
// ============================================================================
function initTheme() {
    const savedTheme = localStorage.getItem(STORAGE_KEYS.THEME) || 'dark';
    AppState.theme = savedTheme;
    document.documentElement.setAttribute('data-theme', savedTheme);
    updateThemeIcon();
}

function toggleTheme() {
    AppState.theme = AppState.theme === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', AppState.theme);
    localStorage.setItem(STORAGE_KEYS.THEME, AppState.theme);
    updateThemeIcon();
    showToast(`Switched to ${AppState.theme} theme`, 'info');
}

function updateThemeIcon() {
    const isLight = AppState.theme === 'light';
    const iconClass = isLight ? 'fas fa-moon' : 'fas fa-sun';
    const icon = document.getElementById('themeToggleIcon');
    if (icon) icon.className = iconClass;
    const landingIcon = document.getElementById('landingThemeIcon');
    if (landingIcon) landingIcon.className = iconClass;
}

// ============================================================================
// Storage & Session Management
// ============================================================================
function initStorage() {
    try {
        const storedSessions = localStorage.getItem(STORAGE_KEYS.SESSIONS);
        if (storedSessions) {
            AppState.sessions = JSON.parse(storedSessions);
        }
    } catch (e) {
        console.error('Failed to parse stored sessions:', e);
        AppState.sessions = {};
    }

    const activeId = localStorage.getItem(STORAGE_KEYS.ACTIVE_ID);
    if (activeId && AppState.sessions[activeId]) {
        AppState.activeSessionId = activeId;
    } else {
        createNewSession(false);
    }

    AppState.currentMode = localStorage.getItem(STORAGE_KEYS.MODE) || 'auto';
    AppState.currentStyle = localStorage.getItem(STORAGE_KEYS.IMAGE_STYLE) || 'default';

    // Sync UI elements
    updateModePillsUI();
    const styleSelect = document.getElementById('imageStyleSelect');
    if (styleSelect) styleSelect.value = AppState.currentStyle;
}

function saveSessions() {
    try {
        localStorage.setItem(STORAGE_KEYS.SESSIONS, JSON.stringify(AppState.sessions));
        localStorage.setItem(STORAGE_KEYS.ACTIVE_ID, AppState.activeSessionId);
    } catch (e) {
        console.warn('Storage quota exceeded, removing oldest sessions:', e);
        const ids = Object.keys(AppState.sessions);
        if (ids.length > 5) {
            delete AppState.sessions[ids[0]];
            saveSessions();
        }
    }
}

function createNewSession(switchNow = true) {
    const id = 'sess_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7);
    const newSession = {
        id: id,
        title: 'New Conversation',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        messages: [] // Array of { id, role, type: 'text'|'image', content, prompt, timestamp, model }
    };

    AppState.sessions[id] = newSession;
    if (switchNow) {
        switchSession(id);
    } else {
        AppState.activeSessionId = id;
    }
    saveSessions();
    renderSidebarSessions();
    return id;
}

function switchSession(id) {
    if (!AppState.sessions[id]) return;
    AppState.activeSessionId = id;
    saveSessions();
    renderSidebarSessions();
    renderCurrentSession();

    // Close sidebar on mobile
    const sidebar = document.getElementById('sidebar');
    if (sidebar && window.innerWidth <= 860) {
        sidebar.classList.remove('open');
    }
}

function deleteSession(id, event) {
    if (event) event.stopPropagation();
    if (!confirm('Are you sure you want to delete this conversation?')) return;

    delete AppState.sessions[id];
    const sessionIds = Object.keys(AppState.sessions);
    if (sessionIds.length === 0) {
        createNewSession(true);
    } else if (AppState.activeSessionId === id) {
        switchSession(sessionIds[sessionIds.length - 1]);
    } else {
        saveSessions();
        renderSidebarSessions();
    }
    showToast('Conversation deleted', 'info');
}

function clearCurrentChat() {
    const current = AppState.sessions[AppState.activeSessionId];
    if (!current || current.messages.length === 0) return;
    if (!confirm('Clear all messages in this conversation?')) return;

    current.messages = [];
    current.updatedAt = new Date().toISOString();
    saveSessions();
    renderCurrentSession();
    showToast('Chat cleared', 'info');
}

// ============================================================================
// Sidebar Rendering
// ============================================================================
function renderSidebarSessions(filterQuery = '') {
    const historyContainer = document.getElementById('sidebarHistory');
    if (!historyContainer) return;

    historyContainer.innerHTML = '';
    const sessionsList = Object.values(AppState.sessions).sort(
        (a, b) => new Date(b.updatedAt) - new Date(a.updatedAt)
    );

    const filtered = filterQuery.trim()
        ? sessionsList.filter(s => s.title.toLowerCase().includes(filterQuery.toLowerCase()) ||
            s.messages.some(m => (m.content || m.prompt || '').toLowerCase().includes(filterQuery.toLowerCase())))
        : sessionsList;

    if (filtered.length === 0) {
        historyContainer.innerHTML = `
            <div style="padding: 20px 10px; text-align: center; color: var(--text-dim); font-size: 0.8rem;">
                No conversations found
            </div>
        `;
        return;
    }

    const titleDiv = document.createElement('div');
    titleDiv.className = 'history-group-title';
    titleDiv.textContent = 'Recent Chats';
    historyContainer.appendChild(titleDiv);

    filtered.forEach(session => {
        const item = document.createElement('div');
        item.className = `history-item ${session.id === AppState.activeSessionId ? 'active' : ''}`;
        item.onclick = () => switchSession(session.id);

        const iconClass = session.messages.some(m => m.type === 'image')
            ? 'fa-palette'
            : 'fa-message';

        item.innerHTML = `
            <div class="history-item-left">
                <i class="fas ${iconClass}"></i>
                <span class="history-title" title="${escapeHtml(session.title)}">${escapeHtml(session.title)}</span>
            </div>
            <div class="history-actions">
                <button class="history-action-btn delete" title="Delete conversation" onclick="deleteSession('${session.id}', event)">
                    <i class="fas fa-trash-alt"></i>
                </button>
            </div>
        `;
        historyContainer.appendChild(item);
    });
}

// ============================================================================
// Chat Render & Message Display
// ============================================================================
function renderCurrentSession() {
    const session = AppState.sessions[AppState.activeSessionId];
    const messagesContainer = document.getElementById('chatMessages');
    const sessionTitle = document.getElementById('chatSessionTitle');

    if (!session || !messagesContainer) return;

    if (sessionTitle) {
        sessionTitle.textContent = session.title || 'New Conversation';
    }

    // If no messages, render welcome hero with prompt suggestions
    if (!session.messages || session.messages.length === 0) {
        messagesContainer.innerHTML = `
            <div class="welcome-hero" id="welcomeHero">
                <div class="welcome-icon-glow">
                    <i class="fas fa-sparkles"></i>
                </div>
                <h1>Welcome to Nova AI</h1>
                <p>Supercharged intelligence powered by Groq LLaMA/GPT-OSS for instant reasoning and Flux for stunning image synthesis.</p>
                
                <div class="suggestions-grid">
                    <div class="suggestion-card" onclick="usePromptSuggestion('generate a cyberpunk samurai standing in a rainy neo-Tokyo street with neon lights', 'image')">
                        <div class="suggestion-header">
                            <i class="fas fa-palette"></i>
                            <span class="suggestion-tag">Flux Image</span>
                        </div>
                        <p class="suggestion-prompt">"Cyberpunk samurai in rainy neo-Tokyo street with glowing neon lights"</p>
                    </div>

                    <div class="suggestion-card" onclick="usePromptSuggestion('Explain how quantum computing works using a real-world analogy in 3 paragraphs', 'text')">
                        <div class="suggestion-header">
                            <i class="fas fa-brain"></i>
                            <span class="suggestion-tag">Insight</span>
                        </div>
                        <p class="suggestion-prompt">"Explain how quantum computing works using a simple analogy"</p>
                    </div>

                    <div class="suggestion-card" onclick="usePromptSuggestion('Write a clean Python script using asyncio and httpx to fetch multiple URLs in parallel with error handling', 'text')">
                        <div class="suggestion-header">
                            <i class="fas fa-code"></i>
                            <span class="suggestion-tag">Code Genius</span>
                        </div>
                        <p class="suggestion-prompt">"Async Python script to fetch multiple URLs concurrently with error handling"</p>
                    </div>

                    <div class="suggestion-card" onclick="usePromptSuggestion('create an image of a majestic crystal dragon flying over floating fantasy islands at sunset', 'image')">
                        <div class="suggestion-header">
                            <i class="fas fa-dragon"></i>
                            <span class="suggestion-tag">Fantasy Art</span>
                        </div>
                        <p class="suggestion-prompt">"Majestic crystal dragon flying over floating fantasy islands at sunset"</p>
                    </div>
                </div>
            </div>
        `;
        return;
    }

    messagesContainer.innerHTML = '';
    session.messages.forEach(msg => {
        appendMessageToDOM(msg, false);
    });

    scrollToBottom(false);
}

function appendMessageToDOM(msg, shouldAnimate = true) {
    const messagesContainer = document.getElementById('chatMessages');
    if (!messagesContainer) return;

    // Remove welcome hero if present
    const hero = document.getElementById('welcomeHero');
    if (hero) hero.remove();

    const row = document.createElement('div');
    row.className = `message-row ${msg.role}`;
    row.id = `msg_${msg.id}`;
    if (!shouldAnimate) row.style.animation = 'none';

    const timeStr = msg.timestamp
        ? new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        : '';

    if (msg.role === 'user') {
        row.innerHTML = `
            <div class="message-avatar">
                <i class="fas fa-user"></i>
            </div>
            <div class="message-content-wrapper">
                <div class="message-meta">
                    <span>You</span>
                    <span>${timeStr}</span>
                </div>
                <div class="message-bubble user-bubble">
                    ${escapeHtml(msg.content).replace(/\n/g, '<br>')}
                </div>
            </div>
        `;
    } else {
        // Assistant Message
        let bodyHtml = '';

        if (msg.type === 'image') {
            bodyHtml = `
                <div class="image-card-container">
                    <img src="${msg.content}" alt="${escapeHtml(msg.prompt || 'Generated AI image')}" class="generated-image" onclick="openLightbox('${msg.content}', '${escapeHtml(msg.prompt || '')}')" loading="lazy">
                    <div class="image-overlay">
                        <div class="image-overlay-top">
                            <span class="image-badge"><i class="fas fa-wand-magic-sparkles"></i> Flux AI</span>
                            <div class="image-overlay-actions">
                                <button class="image-action-btn" title="View Fullscreen" onclick="openLightbox('${msg.content}', '${escapeHtml(msg.prompt || '')}')">
                                    <i class="fas fa-expand"></i>
                                </button>
                                <button class="image-action-btn" title="Download Image" onclick="downloadImage('${msg.content}', '${msg.id}.png')">
                                    <i class="fas fa-download"></i>
                                </button>
                                <button class="image-action-btn" title="Copy Prompt" onclick="copyTextToClipboard('${escapeHtml(msg.prompt || '')}', 'Prompt copied!')">
                                    <i class="fas fa-copy"></i>
                                </button>
                            </div>
                        </div>
                        <div class="image-prompt-caption" title="${escapeHtml(msg.prompt || '')}">
                            <i class="fas fa-quote-left" style="font-size: 0.65rem; opacity: 0.7;"></i> ${escapeHtml(msg.prompt || '')}
                        </div>
                    </div>
                </div>
            `;
        } else {
            // Text / Markdown parsing
            let formattedContent = msg.content;
            if (typeof marked !== 'undefined') {
                try {
                    formattedContent = marked.parse(msg.content);
                } catch (e) {
                    formattedContent = `<p>${escapeHtml(msg.content)}</p>`;
                }
            }
            if (typeof DOMPurify !== 'undefined') {
                formattedContent = DOMPurify.sanitize(formattedContent);
            }
            bodyHtml = `<div class="formatted-text">${formattedContent}</div>`;
        }

        const modelLabel = msg.type === 'image' ? 'Flux AI' : (msg.model || 'Nova 120B');

        row.innerHTML = `
            <div class="message-avatar">
                <i class="fas fa-robot"></i>
            </div>
            <div class="message-content-wrapper">
                <div class="message-meta">
                    <span style="font-weight: 600; color: var(--text-main);">Nova</span>
                    <span class="message-model-tag">${modelLabel}</span>
                    <span>${timeStr}</span>
                </div>
                <div class="message-bubble assistant-bubble">
                    ${bodyHtml}
                </div>
                <div class="message-actions-toolbar">
                    <button class="msg-action-btn" onclick="copyMessageContent('${msg.id}')" title="Copy message">
                        <i class="fas fa-copy"></i> Copy
                    </button>
                    ${msg.type === 'text' ? `
                    <button class="msg-action-btn" id="tts_btn_${msg.id}" onclick="toggleSpeakMessage('${msg.id}')" title="Read aloud">
                        <i class="fas fa-volume-up"></i> Listen
                    </button>
                    ` : ''}
                    <button class="msg-action-btn" onclick="regenerateLastResponse()" title="Regenerate">
                        <i class="fas fa-rotate-right"></i> Retry
                    </button>
                </div>
            </div>
        `;
    }

    messagesContainer.appendChild(row);

    // Format code blocks inside assistant message with headers & copy button
    if (msg.role === 'assistant' && msg.type === 'text') {
        enhanceCodeBlocksInMessage(row);
    }
}

function enhanceCodeBlocksInMessage(messageRow) {
    const preBlocks = messageRow.querySelectorAll('pre');
    preBlocks.forEach((pre, index) => {
        // If already enhanced, skip
        if (pre.parentElement.classList.contains('code-container')) return;

        const code = pre.querySelector('code');
        let lang = 'code';
        if (code) {
            code.classList.forEach(cls => {
                if (cls.startsWith('language-')) {
                    lang = cls.replace('language-', '');
                }
            });
        }

        const container = document.createElement('div');
        container.className = 'code-container';

        const header = document.createElement('div');
        header.className = 'code-header';
        header.innerHTML = `
            <span class="code-lang"><i class="fas fa-code"></i> ${lang}</span>
            <button class="copy-code-btn" type="button">
                <i class="fas fa-copy"></i> Copy code
            </button>
        `;

        const copyBtn = header.querySelector('.copy-code-btn');
        copyBtn.addEventListener('click', () => {
            const rawCode = code ? code.innerText : pre.innerText;
            navigator.clipboard.writeText(rawCode).then(() => {
                copyBtn.innerHTML = '<i class="fas fa-check" style="color: #10b981;"></i> Copied!';
                setTimeout(() => {
                    copyBtn.innerHTML = '<i class="fas fa-copy"></i> Copy code';
                }, 2000);
            });
        });

        pre.parentNode.insertBefore(container, pre);
        container.appendChild(header);
        container.appendChild(pre);
    });
}

// ============================================================================
// Message Submission & Backend Call
// ============================================================================
async function handleSendMessage() {
    if (AppState.isGenerating) return;

    const textarea = document.getElementById('chatInput');
    const prompt = textarea.value.trim();
    if (!prompt) return;

    textarea.value = '';
    textarea.style.height = 'auto';

    const session = AppState.sessions[AppState.activeSessionId];
    if (!session) return;

    // Auto title for the session if it's the first message
    if (session.messages.length === 0) {
        session.title = prompt.length > 32 ? prompt.substring(0, 32) + '...' : prompt;
        document.getElementById('chatSessionTitle').textContent = session.title;
    }

    // 1. Add User Message
    const userMsg = {
        id: 'msg_' + Date.now(),
        role: 'user',
        type: 'text',
        content: prompt,
        timestamp: new Date().toISOString()
    };
    session.messages.push(userMsg);
    session.updatedAt = new Date().toISOString();
    saveSessions();
    appendMessageToDOM(userMsg);
    scrollToBottom(true);
    renderSidebarSessions();

    // 2. Determine mode & style
    const effectiveMode = AppState.currentMode;
    const effectiveStyle = AppState.currentStyle !== 'default' ? AppState.currentStyle : '';

    // Check if prompt seems like image generation
    const imageKeywords = ["generate an image", "create an image", "make an image", "draw an image", "draw a picture", "/image", "paint a", "photo of", "image of"];
    const willGenerateImage = effectiveMode === 'image' || (effectiveMode === 'auto' && imageKeywords.some(k => prompt.toLowerCase().includes(k)));

    // 3. Show Loading Indicator
    showTypingIndicator(willGenerateImage ? 'image' : 'text');
    AppState.isGenerating = true;
    setSendButtonState(true);

    // Build context history for multi-turn chat
    const historyPayload = session.messages
        .filter(m => m.type === 'text')
        .slice(-8)
        .map(m => ({ role: m.role, content: m.content }));

    try {
        const response = await fetch('/generate', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                prompt: prompt,
                mode: effectiveMode,
                style: effectiveStyle,
                messages: historyPayload
            })
        });

        const data = await response.json();
        removeTypingIndicator();

        if (data.error) {
            const errorMsg = {
                id: 'msg_' + Date.now(),
                role: 'assistant',
                type: 'text',
                content: `⚠️ **Error**: ${data.error}`,
                model: 'System',
                timestamp: new Date().toISOString()
            };
            session.messages.push(errorMsg);
            appendMessageToDOM(errorMsg);
        } else {
            const assistantMsg = {
                id: 'msg_' + Date.now(),
                role: 'assistant',
                type: data.type || 'text',
                content: data.result,
                prompt: data.prompt || prompt,
                model: data.model || (data.type === 'image' ? 'Flux AI' : 'Groq 120B'),
                timestamp: new Date().toISOString()
            };
            session.messages.push(assistantMsg);
            appendMessageToDOM(assistantMsg);
        }

        session.updatedAt = new Date().toISOString();
        saveSessions();
        renderSidebarSessions();
        scrollToBottom(true);

    } catch (err) {
        removeTypingIndicator();
        console.error('Fetch error:', err);
        const networkErrorMsg = {
            id: 'msg_' + Date.now(),
            role: 'assistant',
            type: 'text',
            content: `⚠️ **Connection Error**: Failed to reach AI service. Please check your network or server status. (${err.message})`,
            model: 'System',
            timestamp: new Date().toISOString()
        };
        session.messages.push(networkErrorMsg);
        appendMessageToDOM(networkErrorMsg);
    } finally {
        AppState.isGenerating = false;
        setSendButtonState(false);
    }
}

// Regenerate the last assistant response
function regenerateLastResponse() {
    const session = AppState.sessions[AppState.activeSessionId];
    if (!session || session.messages.length === 0 || AppState.isGenerating) return;

    // Find the last user prompt
    let lastUserPrompt = '';
    for (let i = session.messages.length - 1; i >= 0; i--) {
        if (session.messages[i].role === 'user') {
            lastUserPrompt = session.messages[i].content;
            break;
        }
    }

    if (!lastUserPrompt) return;

    // Pop the last assistant message if there is one
    if (session.messages[session.messages.length - 1].role === 'assistant') {
        session.messages.pop();
    }

    renderCurrentSession();
    const textarea = document.getElementById('chatInput');
    textarea.value = lastUserPrompt;
    handleSendMessage();
}

// Quick suggestions click handler
function usePromptSuggestion(promptText, preferredMode) {
    preferredMode = preferredMode || 'auto';
    enterApp();
    const textarea = document.getElementById('chatInput');
    if (!textarea) return;
    textarea.value = promptText;
    setMode(preferredMode);
    handleSendMessage();
}

// ============================================================================
// UI Loaders & Indicators
// ============================================================================
function showTypingIndicator(type = 'text') {
    removeTypingIndicator();
    const messagesContainer = document.getElementById('chatMessages');
    if (!messagesContainer) return;

    const row = document.createElement('div');
    row.className = 'typing-indicator-row';
    row.id = 'activeTypingIndicator';

    if (type === 'image') {
        row.innerHTML = `
            <div class="message-avatar" style="background: var(--bg-tertiary); color: var(--accent-secondary); border: 1px solid var(--border-subtle);">
                <i class="fas fa-palette"></i>
            </div>
            <div class="image-loading-card">
                <i class="fas fa-wand-magic-sparkles"></i>
                <span>Generating artwork with Flux AI...</span>
            </div>
        `;
    } else {
        row.innerHTML = `
            <div class="message-avatar" style="background: var(--bg-tertiary); color: var(--accent-cyan); border: 1px solid var(--border-subtle);">
                <i class="fas fa-robot"></i>
            </div>
            <div class="typing-card">
                <div class="typing-dots">
                    <div class="typing-dot"></div>
                    <div class="typing-dot"></div>
                    <div class="typing-dot"></div>
                </div>
                <span class="typing-text">Nova is thinking...</span>
            </div>
        `;
    }

    messagesContainer.appendChild(row);
    scrollToBottom(true);
}

function removeTypingIndicator() {
    const indicator = document.getElementById('activeTypingIndicator');
    if (indicator) indicator.remove();
}

function setSendButtonState(isLoading) {
    const btn = document.getElementById('btnSend');
    if (!btn) return;
    btn.disabled = isLoading;
    if (isLoading) {
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
    } else {
        btn.innerHTML = '<i class="fas fa-paper-plane"></i>';
    }
}

// ============================================================================
// Speech Recognition (Voice Input) & Speech Synthesis (Read Aloud)
// ============================================================================
function initSpeechRecognition() {
    const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRec) {
        console.warn('Speech recognition not supported in this browser.');
        const micBtn = document.getElementById('btnMic');
        if (micBtn) micBtn.title = 'Voice input not supported in your browser';
        return;
    }

    AppState.recognition = new SpeechRec();
    AppState.recognition.continuous = false;
    AppState.recognition.interimResults = true;
    AppState.recognition.lang = 'en-US';

    AppState.recognition.onstart = () => {
        AppState.isListening = true;
        const micBtn = document.getElementById('btnMic');
        if (micBtn) micBtn.classList.add('recording');
        showToast('Listening... Speak your prompt', 'info');
    };

    AppState.recognition.onresult = (event) => {
        let transcript = '';
        for (let i = event.resultIndex; i < event.results.length; ++i) {
            transcript += event.results[i][0].transcript;
        }
        const textarea = document.getElementById('chatInput');
        if (textarea) {
            textarea.value = transcript;
            autoResizeTextarea(textarea);
        }
    };

    AppState.recognition.onerror = (event) => {
        console.error('Speech recognition error:', event.error);
        stopListening();
        showToast('Voice error: ' + event.error, 'error');
    };

    AppState.recognition.onend = () => {
        stopListening();
    };
}

function toggleVoiceInput() {
    if (!AppState.recognition) {
        showToast('Voice recognition is not supported in this browser.', 'error');
        return;
    }

    if (AppState.isListening) {
        AppState.recognition.stop();
        stopListening();
    } else {
        try {
            AppState.recognition.start();
        } catch (e) {
            console.error('Recognition start error:', e);
        }
    }
}

function stopListening() {
    AppState.isListening = false;
    const micBtn = document.getElementById('btnMic');
    if (micBtn) micBtn.classList.remove('recording');
}

// Text to Speech
function toggleSpeakMessage(msgId) {
    if (!('speechSynthesis' in window)) {
        showToast('Text-to-speech is not supported in this browser.', 'error');
        return;
    }

    const ttsBtn = document.getElementById(`tts_btn_${msgId}`);

    if (window.speechSynthesis.speaking) {
        window.speechSynthesis.cancel();
        if (AppState.currentSpeakingMsgId === msgId) {
            AppState.currentSpeakingMsgId = null;
            if (ttsBtn) ttsBtn.classList.remove('active-speaking');
            return;
        }
    }

    const session = AppState.sessions[AppState.activeSessionId];
    if (!session) return;
    const msg = session.messages.find(m => m.id === msgId);
    if (!msg) return;

    // Strip markdown formatting for cleaner speech
    const cleanText = msg.content
        .replace(/```[\s\S]*?```/g, 'Code block omitted.')
        .replace(/`([^`]+)`/g, '$1')
        .replace(/[*#_~\[\]]/g, '');

    const utterance = new SpeechSynthesisUtterance(cleanText);
    utterance.rate = 1.0;
    utterance.pitch = 1.0;

    utterance.onstart = () => {
        AppState.currentSpeakingMsgId = msgId;
        if (ttsBtn) {
            ttsBtn.classList.add('active-speaking');
            ttsBtn.innerHTML = '<i class="fas fa-stop"></i> Stop';
        }
    };

    utterance.onend = () => {
        AppState.currentSpeakingMsgId = null;
        if (ttsBtn) {
            ttsBtn.classList.remove('active-speaking');
            ttsBtn.innerHTML = '<i class="fas fa-volume-up"></i> Listen';
        }
    };

    utterance.onerror = () => {
        AppState.currentSpeakingMsgId = null;
        if (ttsBtn) {
            ttsBtn.classList.remove('active-speaking');
            ttsBtn.innerHTML = '<i class="fas fa-volume-up"></i> Listen';
        }
    };

    window.speechSynthesis.speak(utterance);
}

// ============================================================================
// Lightbox & Image Actions
// ============================================================================
function openLightbox(imageUrl, promptText = '') {
    const modal = document.getElementById('lightboxModal');
    const img = document.getElementById('lightboxImg');
    const promptCap = document.getElementById('lightboxPrompt');
    const downloadBtn = document.getElementById('lightboxDownloadBtn');

    if (!modal || !img) return;

    img.src = imageUrl;
    if (promptCap) promptCap.textContent = promptText || 'Generated AI Image';
    if (downloadBtn) {
        downloadBtn.onclick = () => downloadImage(imageUrl, 'flux-artwork.png');
    }

    modal.classList.add('active');
}

function closeLightbox() {
    const modal = document.getElementById('lightboxModal');
    if (modal) modal.classList.remove('active');
}

function downloadImage(url, filename = 'image.png') {
    fetch(url)
        .then(res => res.blob())
        .then(blob => {
            const blobUrl = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.style.display = 'none';
            a.href = blobUrl;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(blobUrl);
            a.remove();
            showToast('Image downloaded!', 'success');
        })
        .catch(err => {
            console.error('Download error:', err);
            // Fallback direct window open
            window.open(url, '_blank');
        });
}

// ============================================================================
// Mode & Style Selectors
// ============================================================================
function setMode(mode) {
    AppState.currentMode = mode;
    localStorage.setItem(STORAGE_KEYS.MODE, mode);
    updateModePillsUI();

    const styleDropdownWrap = document.getElementById('imageStyleWrapper');
    if (styleDropdownWrap) {
        styleDropdownWrap.style.display = (mode === 'image' || mode === 'auto') ? 'flex' : 'none';
    }

    const textarea = document.getElementById('chatInput');
    if (textarea) {
        if (mode === 'image') {
            textarea.placeholder = 'Describe the image you want Flux AI to generate...';
        } else if (mode === 'text') {
            textarea.placeholder = 'Ask Nova anything...';
        } else {
            textarea.placeholder = 'Ask anything or describe an image to create...';
        }
        textarea.focus();
    }
}

function updateModePillsUI() {
    const pills = document.querySelectorAll('.mode-pill');
    pills.forEach(pill => {
        const mode = pill.getAttribute('data-mode');
        if (mode === AppState.currentMode) {
            pill.classList.add('active');
        } else {
            pill.classList.remove('active');
        }
    });
}

function setImageStyle(style) {
    AppState.currentStyle = style;
    localStorage.setItem(STORAGE_KEYS.IMAGE_STYLE, style);
    showToast(`Image style set to: ${style}`, 'info');
}

// ============================================================================
// Export Conversation
// ============================================================================
function exportConversation(format = 'markdown') {
    const session = AppState.sessions[AppState.activeSessionId];
    if (!session || session.messages.length === 0) {
        showToast('No messages to export.', 'info');
        return;
    }

    let output = '';
    let mimeType = 'text/plain';
    let fileExt = 'md';

    if (format === 'json') {
        output = JSON.stringify(session, null, 2);
        mimeType = 'application/json';
        fileExt = 'json';
    } else {
        output += `# ${session.title}\n`;
        output += `*Created on: ${new Date(session.createdAt).toLocaleString()}*\n\n---\n\n`;
        session.messages.forEach(m => {
            const sender = m.role === 'user' ? 'User' : 'Nova AI';
            output += `### ${sender} (${new Date(m.timestamp).toLocaleTimeString()}):\n`;
            if (m.type === 'image') {
                output += `![${m.prompt || 'Generated Image'}](${m.content})\n\n*Prompt: ${m.prompt || ''}*\n\n`;
            } else {
                output += `${m.content}\n\n`;
            }
        });
    }

    const blob = new Blob([output], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${session.title.replace(/[^a-zA-Z0-9_-]/g, '_')}.${fileExt}`;
    document.body.appendChild(a);
    a.click();
    URL.revokeObjectURL(url);
    a.remove();
    showToast(`Conversation exported as .${fileExt}`, 'success');
}

// ============================================================================
// Utilities & Helpers
// ============================================================================
function copyMessageContent(msgId) {
    const session = AppState.sessions[AppState.activeSessionId];
    if (!session) return;
    const msg = session.messages.find(m => m.id === msgId);
    if (!msg) return;

    copyTextToClipboard(msg.content, 'Message copied to clipboard!');
}

function copyTextToClipboard(text, successMsg = 'Copied to clipboard!') {
    navigator.clipboard.writeText(text).then(() => {
        showToast(successMsg, 'success');
    }).catch(err => {
        console.error('Failed to copy:', err);
    });
}

function scrollToBottom(smooth = true) {
    const container = document.getElementById('chatMessages');
    if (!container) return;
    if (smooth) {
        container.scrollTo({ top: container.scrollHeight, behavior: 'smooth' });
    } else {
        container.scrollTop = container.scrollHeight;
    }
}

function autoResizeTextarea(textarea) {
    textarea.style.height = 'auto';
    textarea.style.height = Math.min(textarea.scrollHeight, 160) + 'px';
}

function escapeHtml(string) {
    const entityMap = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
    };
    return String(string).replace(/[&<>"']/g, s => entityMap[s]);
}

function showToast(message, type = 'info') {
    const container = document.getElementById('toastContainer');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = 'toast';

    let iconClass = 'fa-info-circle';
    if (type === 'success') iconClass = 'fa-check-circle';
    if (type === 'error') iconClass = 'fa-exclamation-triangle';

    toast.innerHTML = `<i class="fas ${iconClass}"></i> <span>${message}</span>`;
    container.appendChild(toast);

    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateY(10px)';
        toast.style.transition = 'all 0.3s ease';
        setTimeout(() => toast.remove(), 300);
    }, 2800);
}

async function checkBackendStatus() {
    try {
        const res = await fetch('/status');
        const data = await res.json();
        console.log('Backend connected:', data);
    } catch (e) {
        console.warn('Backend status check returned:', e);
    }
}

// ============================================================================
// Event Listeners Setup
// ============================================================================
function setupEventListeners() {
    // New chat button
    const newChatBtn = document.getElementById('btnNewChat');
    if (newChatBtn) {
        newChatBtn.addEventListener('click', () => createNewSession(true));
    }

    // Sidebar search filter
    const searchInput = document.getElementById('searchChatsInput');
    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            renderSidebarSessions(e.target.value);
        });
    }

    // Mobile sidebar toggle
    const toggleSidebarBtn = document.getElementById('btnToggleSidebar');
    const sidebarCloseBtn = document.getElementById('sidebarCloseBtn');
    const sidebar = document.getElementById('sidebar');

    if (toggleSidebarBtn && sidebar) {
        toggleSidebarBtn.addEventListener('click', () => {
            sidebar.classList.toggle('open');
        });
    }

    if (sidebarCloseBtn && sidebar) {
        sidebarCloseBtn.addEventListener('click', () => {
            sidebar.classList.remove('open');
        });
    }

    // Mode pills
    const modePills = document.querySelectorAll('.mode-pill');
    modePills.forEach(pill => {
        pill.addEventListener('click', () => {
            const mode = pill.getAttribute('data-mode');
            setMode(mode);
        });
    });

    // Image style dropdown
    const styleSelect = document.getElementById('imageStyleSelect');
    if (styleSelect) {
        styleSelect.addEventListener('change', (e) => {
            setImageStyle(e.target.value);
        });
    }

    // Send button & Textarea shortcuts
    const sendBtn = document.getElementById('btnSend');
    const textarea = document.getElementById('chatInput');

    if (sendBtn) {
        sendBtn.addEventListener('click', handleSendMessage);
    }

    if (textarea) {
        textarea.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSendMessage();
            }
        });

        textarea.addEventListener('input', () => {
            autoResizeTextarea(textarea);
        });
    }

    // Mic button
    const micBtn = document.getElementById('btnMic');
    if (micBtn) {
        micBtn.addEventListener('click', toggleVoiceInput);
    }

    // Theme toggle
    const themeBtn = document.getElementById('themeToggleBtn');
    if (themeBtn) {
        themeBtn.addEventListener('click', toggleTheme);
    }
    const landingThemeBtn = document.getElementById('landingThemeToggle');
    if (landingThemeBtn) {
        landingThemeBtn.addEventListener('click', toggleTheme);
    }

    // Clear chat
    const clearChatBtn = document.getElementById('btnClearChat');
    if (clearChatBtn) {
        clearChatBtn.addEventListener('click', clearCurrentChat);
    }

    // Export chat
    const exportBtn = document.getElementById('btnExportChat');
    if (exportBtn) {
        exportBtn.addEventListener('click', () => exportConversation('markdown'));
    }

    // Scroll to bottom floating button
    const scrollBottomBtn = document.getElementById('btnScrollBottom');
    const messagesContainer = document.getElementById('chatMessages');

    if (messagesContainer && scrollBottomBtn) {
        messagesContainer.addEventListener('scroll', () => {
            const distanceFromBottom = messagesContainer.scrollHeight - messagesContainer.scrollTop - messagesContainer.clientHeight;
            if (distanceFromBottom > 150) {
                scrollBottomBtn.classList.add('visible');
            } else {
                scrollBottomBtn.classList.remove('visible');
            }
        });

        scrollBottomBtn.addEventListener('click', () => {
            scrollToBottom(true);
        });
    }

    // Lightbox close events
    const lightboxModal = document.getElementById('lightboxModal');
    const lightboxClose = document.getElementById('lightboxClose');
    if (lightboxClose) {
        lightboxClose.addEventListener('click', closeLightbox);
    }
    if (lightboxModal) {
        lightboxModal.addEventListener('click', (e) => {
            if (e.target === lightboxModal) closeLightbox();
        });
    }

    // ESC key closes modals
    window.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            closeLightbox();
        }
    });
}

// ============================================================================
// Landing Page / App View Navigation
// ============================================================================
function initViewRouter() {
    var currentView = sessionStorage.getItem('nova_current_view');
    var landing = document.getElementById('landingView');
    var appEl = document.getElementById('appLayout');
    if (currentView === 'app') {
        if (landing) landing.style.display = 'none';
        if (appEl) { appEl.style.display = 'flex'; appEl.style.opacity = '1'; }
    } else {
        if (landing) { landing.style.display = 'flex'; landing.style.opacity = '1'; }
        if (appEl) appEl.style.display = 'none';
    }
}

function enterApp(initialPrompt, mode, style) {
    var landing = document.getElementById('landingView');
    var appEl = document.getElementById('appLayout');
    if (landing) { landing.style.transition = 'opacity 0.25s ease'; landing.style.opacity = '0'; setTimeout(function() { landing.style.display = 'none'; }, 250); }
    if (appEl) { appEl.style.display = 'flex'; appEl.style.opacity = '0'; setTimeout(function() { appEl.style.transition = 'opacity 0.3s ease'; appEl.style.opacity = '1'; }, 60); }
    sessionStorage.setItem('nova_current_view', 'app');
    if (style && style !== 'default') setImageStyle(style);
    if (mode) setMode(mode);
    var textarea = document.getElementById('chatInput');
    if (textarea) {
        if (initialPrompt) { textarea.value = initialPrompt; handleSendMessage(); }
        else { setTimeout(function() { textarea.focus(); }, 320); }
    }
}

function showLandingPage() {
    var landing = document.getElementById('landingView');
    var appEl = document.getElementById('appLayout');
    if (appEl) { appEl.style.transition = 'opacity 0.25s ease'; appEl.style.opacity = '0'; setTimeout(function() { appEl.style.display = 'none'; }, 250); }
    if (landing) { landing.style.display = 'flex'; landing.style.opacity = '0'; setTimeout(function() { landing.style.transition = 'opacity 0.3s ease'; landing.style.opacity = '1'; }, 60); window.scrollTo({top:0, behavior:'smooth'}); }
    sessionStorage.setItem('nova_current_view', 'landing');
}

function tryShowcase(promptText, mode, style) {
    enterApp(promptText, mode || 'auto', style || 'default');
}

// ============================================================================
// Particle & Constellation Background Canvas
// ============================================================================
function initParticleCanvas() {
    var canvas = document.getElementById('particleCanvas');
    if (!canvas) return;
    var ctx = canvas.getContext('2d');
    var W = canvas.width = window.innerWidth;
    var H = canvas.height = window.innerHeight;
    var count = Math.min(Math.floor(W * H / 16000), 72);
    var maxDist = 130;
    var mouse = { x: null, y: null, r: 140 };
    window.addEventListener('resize', function() { W = canvas.width = window.innerWidth; H = canvas.height = window.innerHeight; });
    window.addEventListener('mousemove', function(e) { mouse.x = e.clientX; mouse.y = e.clientY; });
    window.addEventListener('mouseleave', function() { mouse.x = null; mouse.y = null; });

    var particles = [];
    for (var i = 0; i < count; i++) {
        particles.push({
            x: Math.random() * W, y: Math.random() * H,
            vx: (Math.random() - 0.5) * 0.6, vy: (Math.random() - 0.5) * 0.6,
            r: Math.random() * 1.8 + 0.8,
            primary: Math.random() > 0.45,
            alpha: Math.random() * 0.45 + 0.2
        });
    }

    function frame() {
        ctx.clearRect(0, 0, W, H);
        for (var a = 0; a < particles.length; a++) {
            for (var b = a + 1; b < particles.length; b++) {
                var dx = particles[a].x - particles[b].x, dy = particles[a].y - particles[b].y;
                var d = Math.sqrt(dx*dx + dy*dy);
                if (d < maxDist) {
                    ctx.strokeStyle = 'rgba(139,92,246,' + ((1 - d/maxDist) * 0.2) + ')';
                    ctx.lineWidth = 0.8;
                    ctx.beginPath(); ctx.moveTo(particles[a].x, particles[a].y); ctx.lineTo(particles[b].x, particles[b].y); ctx.stroke();
                }
            }
        }
        for (var i = 0; i < particles.length; i++) {
            var p = particles[i];
            p.x += p.vx; p.y += p.vy;
            if (p.x < 0) p.x = W; if (p.x > W) p.x = 0;
            if (p.y < 0) p.y = H; if (p.y > H) p.y = 0;
            if (mouse.x !== null) {
                var mdx = mouse.x - p.x, mdy = mouse.y - p.y;
                var md = Math.sqrt(mdx*mdx + mdy*mdy);
                if (md < mouse.r && md > 0) {
                    var force = (mouse.r - md) / mouse.r;
                    p.x -= (mdx/md)*force*1.6; p.y -= (mdy/md)*force*1.6;
                }
            }
            ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI*2);
            ctx.fillStyle = p.primary ? 'rgba(99,102,241,'+p.alpha+')' : 'rgba(236,72,153,'+p.alpha+')';
            ctx.fill();
        }
        requestAnimationFrame(frame);
    }
    frame();
}

