export class Logger {
  constructor(containerId) {
    this.container = document.getElementById(containerId);
    this.currentFilter = 'all';
    this.counts = {
      all: 0,
      scorm: 0,
      info: 0,
      warn: 0,
      error: 0
    };
  }

  log(type, message, args = null) {
    if (!this.container) return;

    this.counts.all++;
    if (this.counts[type] !== undefined) {
      this.counts[type]++;
    }
    this.updateUI();

    const entry = document.createElement('div');
    entry.className = `log-entry ${type}`;
    entry.dataset.type = type;

    // Apply filtering immediately to new entries
    if (this.currentFilter !== 'all' && this.currentFilter !== type) {
      entry.style.display = 'none';
    }

    const timestamp = new Date().toISOString().split('T')[1].slice(0, 12); // HH:mm:ss.SSS

    let argsHtml = '';
    if (args) {
      try {
        const formattedArgs = typeof args === 'string' ? args : JSON.stringify(args, null, 2);
        argsHtml = `<div class="log-args">${this.escapeHtml(formattedArgs)}</div>`;
      } catch (e) {
        argsHtml = `<div class="log-args">[Unserializable Data]</div>`;
      }
    }

    entry.innerHTML = `
      <div class="log-header">
        <span class="log-type">${type}</span>
        <span class="log-timestamp">${timestamp}</span>
      </div>
      <div class="log-content">${this.escapeHtml(message)}</div>
      ${argsHtml}
    `;

    this.container.appendChild(entry);
    this.scrollToBottom();
  }

  info(message, args) { this.log('info', message, args); }
  warn(message, args) { this.log('warn', message, args); }
  error(message, args) { this.log('error', message, args); }
  scorm(method, args) { this.log('scorm', method, args); }

  setFilter(filter) {
    this.currentFilter = filter;
    const entries = this.container.querySelectorAll('.log-entry');
    entries.forEach(entry => {
      if (filter === 'all' || entry.dataset.type === filter) {
        entry.style.display = 'block';
      } else {
        entry.style.display = 'none';
      }
    });
    this.scrollToBottom();
  }

  updateUI() {
    Object.keys(this.counts).forEach(key => {
      const el = document.getElementById(`count-${key}`);
      if (el) el.textContent = this.counts[key];
    });
  }

  clear() {
    if (this.container) {
      this.container.innerHTML = '';
      this.counts = { all: 0, scorm: 0, info: 0, warn: 0, error: 0 };
      this.updateUI();
    }
  }

  scrollToBottom() {
    if (this.container) {
      this.container.scrollTop = this.container.scrollHeight;
    }
  }

  escapeHtml(unsafe) {
    if (typeof unsafe !== 'string') return unsafe;
    return unsafe
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }
}

export const logger = new Logger('logs-container');
