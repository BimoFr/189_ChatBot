(() => {
  "use strict";

  const chatBox = document.getElementById("chatBox");
  const chatForm = document.getElementById("chatForm");
  const userInput = document.getElementById("userInput");
  const sendBtn = document.getElementById("sendBtn");
  const scrollBottomBtn = document.getElementById("scrollBottomBtn");
  const themeToggleBtn = document.getElementById("themeToggleBtn");
  const resetChatBtn = document.getElementById("resetChatBtn");
  const brandAvatar = document.getElementById("brandAvatar");
  const statusDot = document.getElementById("statusDot");
  const statusLabel = document.getElementById("statusLabel");

  const conversationHistory = [];
  let isGenerating = false;

  const STARTER_PROMPTS = [
    { label: "✨ Jelaskan REST API", prompt: "Jelaskan konsep REST API dan metode HTTP secara singkat dan mudah dipahami." },
    { label: "💻 Contoh Express.js", prompt: "Berikan contoh kode sederhana membuat endpoint GET dan POST di Express.js." },
    { label: "⚡ Apa itu SSE?", prompt: "Apa itu Server-Sent Events (SSE) dan bagaimana cara kerjanya di aplikasi web?" },
    { label: "🚀 Tips Clean Code", prompt: "Berikan 4 tips praktis menulis kode JavaScript yang bersih dan rapi." },
  ];

  // ==================== THEME MANAGEMENT ====================
  const savedTheme = localStorage.getItem("chatbot_theme") || "light";
  document.documentElement.setAttribute("data-theme", savedTheme);

  themeToggleBtn.addEventListener("click", () => {
    const current = document.documentElement.getAttribute("data-theme");
    const next = current === "light" ? "dark" : "light";
    document.documentElement.setAttribute("data-theme", next);
    localStorage.setItem("chatbot_theme", next);
  });

  // ==================== STATUS INDICATOR ====================
  function setAiStatus(busy) {
    if (busy) {
      brandAvatar.classList.add("thinking");
      statusDot.classList.add("busy");
      statusLabel.textContent = "Sedang mengetik jawaban...";
    } else {
      brandAvatar.classList.remove("thinking");
      statusDot.classList.remove("busy");
      statusLabel.textContent = "Online · Siap membantu Anda";
    }
  }

  function getCurrentTime() {
    return new Date().toLocaleTimeString("id-ID", {
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  // ==================== MARKDOWN RENDERER ====================
  function escapeHtml(str) {
    return str
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function formatInline(text) {
    let html = escapeHtml(text);
    html = html.replace(/`([^`\n]+)`/g, '<code class="inline-code">$1</code>');
    html = html.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
    html = html.replace(/(?<!\*)\*(?!\s)(.+?)(?<!\s)\*(?!\*)/g, "<em>$1</em>");
    return html;
  }

  function renderFormattedText(rawText, isStreaming = false) {
    if (!rawText) return "";

    const segments = rawText.split(/```/);
    let result = "";

    segments.forEach((segment, index) => {
      if (index % 2 === 1) {
        const firstLineBreak = segment.indexOf("\n");
        let lang = "code";
        let code = segment;

        if (firstLineBreak !== -1) {
          const maybeLang = segment.slice(0, firstLineBreak).trim();
          if (maybeLang && maybeLang.length <= 18 && !maybeLang.includes(" ")) {
            lang = maybeLang;
          }
          code = segment.slice(firstLineBreak + 1);
        }

        const cleanCode = code.replace(/\n$/, "");
        result += `
          <div class="code-wrapper">
            <div class="code-header">
              <span>${escapeHtml(lang)}</span>
              <button type="button" class="copy-code-btn" data-copy-code>Salin kode</button>
            </div>
            <pre><code>${escapeHtml(cleanCode)}</code></pre>
          </div>
        `;
        return;
      }

      const lines = segment.split("\n");
      let inUl = false;
      let inOl = false;

      for (const line of lines) {
        const trimmed = line.trim();

        if (!trimmed) {
          if (inUl) { result += "</ul>"; inUl = false; }
          if (inOl) { result += "</ol>"; inOl = false; }
          continue;
        }

        const ulMatch = trimmed.match(/^[-*]\s+(.+)$/);
        if (ulMatch) {
          if (inOl) { result += "</ol>"; inOl = false; }
          if (!inUl) { result += "<ul>"; inUl = true; }
          result += `<li>${formatInline(ulMatch[1])}</li>`;
          continue;
        }

        const olMatch = trimmed.match(/^\d+\.\s+(.+)$/);
        if (olMatch) {
          if (inUl) { result += "</ul>"; inUl = false; }
          if (!inOl) { result += "<ol>"; inOl = true; }
          result += `<li>${formatInline(olMatch[1])}</li>`;
          continue;
        }

        if (inUl) { result += "</ul>"; inUl = false; }
        if (inOl) { result += "</ol>"; inOl = false; }

        const headingMatch = trimmed.match(/^#{1,3}\s+(.+)$/);
        if (headingMatch) {
          result += `<p><strong>${formatInline(headingMatch[1])}</strong></p>`;
        } else {
          result += `<p>${formatInline(line)}</p>`;
        }
      }

      if (inUl) result += "</ul>";
      if (inOl) result += "</ol>";
    });

    if (isStreaming) {
      result += '<span class="stream-cursor" aria-hidden="true"></span>';
    }

    return result;
  }

  // ==================== WELCOME & MESSAGES ====================
  function renderWelcomeGreeting() {
    chatBox.innerHTML = "";

    const row = document.createElement("div");
    row.className = "message-row bot";

    const avatar = createBotAvatar();
    const col = document.createElement("div");
    col.className = "message-content-col";

    const bubble = document.createElement("div");
    bubble.className = "message bot-message";
    bubble.innerHTML = `
      <p>Halo! Ada yang bisa saya bantu hari ini?</p>
      <div class="quick-prompts" id="quickPrompts"></div>
    `;

    const promptsContainer = bubble.querySelector("#quickPrompts");
    STARTER_PROMPTS.forEach((item) => {
      const chip = document.createElement("button");
      chip.type = "button";
      chip.className = "prompt-chip";
      chip.textContent = item.label;
      chip.addEventListener("click", () => {
        if (!isGenerating) {
          sendMessage(item.prompt);
        }
      });
      promptsContainer.appendChild(chip);
    });

    const meta = document.createElement("div");
    meta.className = "message-meta";
    meta.textContent = getCurrentTime();

    col.appendChild(bubble);
    col.appendChild(meta);
    row.appendChild(avatar);
    row.appendChild(col);
    chatBox.appendChild(row);
  }

  function createBotAvatar() {
    const avatar = document.createElement("div");
    avatar.className = "bot-avatar";
    avatar.setAttribute("aria-hidden", "true");
    avatar.innerHTML = `
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z" />
      </svg>
    `;
    return avatar;
  }

  function appendUserMessage(text) {
    // Hilangkan quick prompts jika masih ada
    const existingPrompts = document.getElementById("quickPrompts");
    if (existingPrompts) existingPrompts.remove();

    const row = document.createElement("div");
    row.className = "message-row user";

    const col = document.createElement("div");
    col.className = "message-content-col";

    const bubble = document.createElement("div");
    bubble.className = "message user-message";
    bubble.textContent = text;

    const meta = document.createElement("div");
    meta.className = "message-meta";
    meta.textContent = getCurrentTime();

    col.appendChild(bubble);
    col.appendChild(meta);
    row.appendChild(col);
    chatBox.appendChild(row);
    scrollToBottom(true);
  }

  function appendBotBubble() {
    const row = document.createElement("div");
    row.className = "message-row bot";

    const avatar = createBotAvatar();
    const col = document.createElement("div");
    col.className = "message-content-col";

    const bubble = document.createElement("div");
    bubble.className = "message bot-message";
    bubble.innerHTML = `
      <div class="typing-indicator" aria-label="AI sedang mengetik">
        <span></span><span></span><span></span>
      </div>
    `;

    const meta = document.createElement("div");
    meta.className = "message-meta";
    meta.style.display = "none";

    const timeSpan = document.createElement("span");
    timeSpan.textContent = getCurrentTime();

    const copyBtn = document.createElement("button");
    copyBtn.type = "button";
    copyBtn.className = "copy-msg-btn";
    copyBtn.innerHTML = `
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
        <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
      </svg>
      <span>Salin</span>
    `;

    copyBtn.addEventListener("click", () => {
      const raw = bubble.dataset.rawText || bubble.textContent;
      navigator.clipboard.writeText(raw).then(() => {
        const label = copyBtn.querySelector("span");
        label.textContent = "Tersalin!";
        setTimeout(() => {
          label.textContent = "Salin";
        }, 1800);
      });
    });

    meta.appendChild(timeSpan);
    meta.appendChild(copyBtn);

    col.appendChild(bubble);
    col.appendChild(meta);
    row.appendChild(avatar);
    row.appendChild(col);
    chatBox.appendChild(row);
    scrollToBottom(true);

    return { bubble, meta, timeSpan };
  }

  // ==================== SCROLL & INPUT HELPERS ====================
  function scrollToBottom(force = false) {
    const distanceFromBottom =
      chatBox.scrollHeight - chatBox.scrollTop - chatBox.clientHeight;
    if (force || distanceFromBottom < 140) {
      chatBox.scrollTop = chatBox.scrollHeight;
    }
  }

  chatBox.addEventListener("scroll", () => {
    const distanceFromBottom =
      chatBox.scrollHeight - chatBox.scrollTop - chatBox.clientHeight;
    if (distanceFromBottom > 150) {
      scrollBottomBtn.classList.add("visible");
    } else {
      scrollBottomBtn.classList.remove("visible");
    }
  });

  scrollBottomBtn.addEventListener("click", () => {
    scrollToBottom(true);
  });

  function autoResizeInput() {
    userInput.style.height = "auto";
    userInput.style.height = Math.min(userInput.scrollHeight, 140) + "px";
  }

  function syncButtonState() {
    sendBtn.disabled = isGenerating || userInput.value.trim().length === 0;
  }

  // ==================== SEND MESSAGE (SSE STREAM) ====================
  async function sendMessage(text) {
    const trimmed = text.trim();
    if (!trimmed || isGenerating) return;

    isGenerating = true;
    setAiStatus(true);
    appendUserMessage(trimmed);
    conversationHistory.push({ role: "user", content: trimmed });

    userInput.value = "";
    autoResizeInput();
    syncButtonState();

    const { bubble: botBubble, meta, timeSpan } = appendBotBubble();
    let fullReply = "";

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: conversationHistory }),
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || `HTTP Error ${response.status}`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop();

        for (const line of lines) {
          const cleanLine = line.trim();
          if (!cleanLine.startsWith("data:")) continue;

          const dataStr = cleanLine.slice(5).trim();
          if (dataStr === "[DONE]") continue;

          try {
            const parsed = JSON.parse(dataStr);
            if (typeof parsed === "string") {
              fullReply += parsed;
              botBubble.dataset.rawText = fullReply;
              botBubble.innerHTML = renderFormattedText(fullReply, true);
              scrollToBottom(false);
            } else if (parsed && parsed.error) {
              throw new Error(parsed.error);
            }
          } catch (parseErr) {
            if (parseErr.message && !parseErr.message.includes("JSON")) {
              throw parseErr;
            }
          }
        }
      }

      if (fullReply) {
        botBubble.innerHTML = renderFormattedText(fullReply, false);
        conversationHistory.push({ role: "assistant", content: fullReply });
        timeSpan.textContent = getCurrentTime();
        meta.style.display = "flex";
      } else {
        botBubble.classList.add("error-message");
        botBubble.textContent = "Maaf, tidak ada respons dari AI.";
      }
    } catch (error) {
      botBubble.classList.add("error-message");
      botBubble.textContent = `Error: ${error.message}`;
    } finally {
      isGenerating = false;
      setAiStatus(false);
      syncButtonState();
      userInput.focus();
      scrollToBottom(false);
    }
  }

  // ==================== EVENT LISTENERS ====================
  userInput.addEventListener("input", () => {
    autoResizeInput();
    syncButtonState();
  });

  userInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (!sendBtn.disabled) {
        sendMessage(userInput.value);
      }
    }
  });

  chatForm.addEventListener("submit", (e) => {
    e.preventDefault();
    sendMessage(userInput.value);
  });

  resetChatBtn.addEventListener("click", () => {
    if (isGenerating) return;
    conversationHistory.length = 0;
    renderWelcomeGreeting();
    userInput.focus();
  });

  // Delegasi klik untuk tombol "Salin kode" di dalam blok kode
  chatBox.addEventListener("click", (e) => {
    const copyCodeBtn = e.target.closest("[data-copy-code]");
    if (!copyCodeBtn) return;

    const codeEl = copyCodeBtn.closest(".code-wrapper")?.querySelector("code");
    if (!codeEl) return;

    navigator.clipboard.writeText(codeEl.textContent).then(() => {
      copyCodeBtn.textContent = "Tersalin!";
      setTimeout(() => {
        copyCodeBtn.textContent = "Salin kode";
      }, 1800);
    });
  });

  // ==================== INIT ====================
  renderWelcomeGreeting();
})();