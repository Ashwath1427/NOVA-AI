// ai.js
window.novaAI = {
  history: [],

  init() {
    this.overlay = document.getElementById('aiChatOverlay');
    this.messagesContainer = document.getElementById('aiChatMessages');
    this.form = document.getElementById('aiChatForm');
    this.input = document.getElementById('aiChatInput');
    
    // Command Palette hooks
    const aiCommandInput = document.getElementById('aiCommandInput');
    const cmdInput = document.getElementById('cmdInput');

    if (this.form) {
      this.form.addEventListener('submit', (e) => {
        e.preventDefault();
        const text = this.input.value.trim();
        if (text) this.sendMessage(text);
      });
    }

    document.getElementById('closeAiChatBtn')?.addEventListener('click', () => {
      this.closeChat();
    });

    // If user presses enter in command palette cmdInput, send to AI if it looks like a natural language prompt
    if (cmdInput) {
      cmdInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          const text = cmdInput.value.trim();
          if (text) {
            document.getElementById('commandPalette').classList.add('hidden');
            this.openChat();
            this.sendMessage(text);
            cmdInput.value = '';
          }
        }
      });
    }
  },

  openChat() {
    this.overlay?.classList.remove('hidden');
    this.input?.focus();
  },

  openAndSend(text) {
    if (!text) return;
    this.openChat();
    this.sendMessage(text);
  },

  closeChat() {
    this.overlay?.classList.add('hidden');
  },

  appendMessage(text, role) {
    const div = document.createElement('div');
    div.className = role === 'user' ? 'user-msg' : (role === 'system' ? 'sys-msg' : 'ai-msg');
    
    // Simple markdown parsing for bold
    let html = text.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    div.innerHTML = html;
    
    this.messagesContainer.appendChild(div);
    this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight;
  },

  showTyping() {
    const div = document.createElement('div');
    div.className = 'typing-indicator';
    div.id = 'aiTyping';
    div.innerHTML = '<span></span><span></span><span></span>';
    this.messagesContainer.appendChild(div);
    this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight;
  },

  hideTyping() {
    const typing = document.getElementById('aiTyping');
    if (typing) typing.remove();
  },

  async sendMessage(text) {
    if (!text) return;
    
    // Append to UI
    this.appendMessage(text, 'user');
    this.input.value = '';
    
    // Show loading
    this.showTyping();

    try {
      const { data: { session } } = await window.supabaseClient.auth.getSession();
      if (!session) throw new Error("Not authenticated");

      // In a real environment, call the edge function
      // For now, if the edge function URL isn't set up, we'll mock it or try to call it.
      let supabaseUrl = window.supabaseClient.supabaseUrl;
      if (supabaseUrl === 'YOUR_SUPABASE_URL_HERE') {
        throw new Error("Supabase URL not configured.");
      }

      const functionUrl = '/api/ai';
      
      const response = await fetch(functionUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`
        },
        body: JSON.stringify({
          prompt: text,
          history: this.history
        })
      });

      this.hideTyping();

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || "Failed to communicate with NOVA AI");
      }

      const data = await response.json();
      
      // Update local history
      this.history.push({ role: "user", parts: [{ text }] });
      this.history.push({ role: "model", parts: [{ text: data.reply }] });

      this.appendMessage(data.reply || "Done.", 'ai');
      
      // Refresh views if tools were executed
      if (data.toolResults && data.toolResults.length > 0) {
        if (window.novaTasks && data.toolResults.some(r => r.name.includes('task'))) window.novaTasks.loadTasks();
        if (window.novaProjects && data.toolResults.some(r => r.name.includes('project'))) window.novaProjects.loadProjects();
      }

    } catch (err) {
      this.hideTyping();
      this.appendMessage(`Error: ${err.message}`, 'system');
      console.error(err);
    }
  }
};

document.addEventListener('DOMContentLoaded', () => {
  window.novaAI.init();
});
