import { logger } from './logger.js';
import { injectSCORMApis } from './scorm-api.js';

document.addEventListener('DOMContentLoaded', () => {
  const urlInput = document.getElementById('course-url');
  const loadBtn = document.getElementById('load-btn');
  const clearBtn = document.getElementById('clear-logs-btn');
  const iframe = document.getElementById('course-iframe');
  const placeholder = document.getElementById('iframe-placeholder');
  const uploadBtn = document.getElementById('upload-btn');
  const fileInput = document.getElementById('course-file');
  const filterPills = document.querySelectorAll('.filter-pill');

  logger.info("SCORM Player initialized.");

  filterPills.forEach(pill => {
    pill.addEventListener('click', () => {
      const filter = pill.dataset.filter;
      
      // Update UI active state
      filterPills.forEach(p => p.classList.remove('active'));
      pill.classList.add('active');

      // Update Logger
      logger.setFilter(filter);
    });
  });

  clearBtn.addEventListener('click', () => {
    logger.clear();
    logger.info("Logs cleared.");
  });

  loadBtn.addEventListener('click', () => loadCourse(urlInput.value));

  urlInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      loadCourse(urlInput.value);
    }
  });

  uploadBtn.addEventListener('click', () => {
    fileInput.click();
  });

  fileInput.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    logger.info(`Uploading package: ${file.name}...`);
    uploadBtn.disabled = true;
    uploadBtn.textContent = "Uploading...";

    const formData = new FormData();
    formData.append('file', file);

    try {
      const response = await fetch('/api/upload', {
        method: 'POST',
        body: formData
      });

      const data = await response.json();

      // Print validation logs first
      if (data.validationLogs && data.validationLogs.length > 0) {
        logger.info("--- SCORM PACKAGE VALIDATION REPORT ---");
        data.validationLogs.forEach(log => {
          if (log.type === 'info') logger.info(log.msg);
          else if (log.type === 'warn') logger.warn(log.msg);
          else if (log.type === 'error') logger.error(log.msg);
          else if (log.type === 'scorm') logger.scorm("VALID", log.msg);
        });
        logger.info("---------------------------------------");
      }

      if (response.ok) {
        logger.info(`Upload successful. Launch URL: ${data.url}`);
        loadCourse(data.url);
      } else {
        logger.error(`Upload failed: ${data.error}`, data.details || "");
      }
    } catch (err) {
      logger.error(`Upload error: ${err.message}`);
    } finally {
      uploadBtn.disabled = false;
      uploadBtn.textContent = "Upload Local ZIP";
      fileInput.value = ''; // reset
    }
  });

  function loadCourse(url) {
    if (!url) {
      logger.warn("Please enter a valid URL.");
      return;
    }

    try {
      // Validate URL format if it's absolute, otherwise assume relative path from current origin
      new URL(url, window.location.origin);
    } catch (e) {
      logger.error("Invalid URL format: " + url);
      return;
    }

    logger.info(`Loading course from: ${url}`);
    
    // Reset iframe to clear previous content and listeners
    iframe.src = 'about:blank';
    
    setTimeout(() => {
      iframe.src = url;
      iframe.classList.add('active');
      placeholder.style.display = 'none';
      
      // We must inject SCORM APIs before scripts run, but for cross-origin we cannot intercept easily.
      // We can try to inject when the load starts if same-origin.
    }, 50);
  }

  // Inject APIs and console interceptors into iframe
  function setupIframeInterceptors() {
    try {
      const contentWindow = iframe.contentWindow;
      
      if (!contentWindow) return;

      // Inject SCORM API
      injectSCORMApis(contentWindow);

      // Intercept console
      const originalConsole = {
        log: contentWindow.console.log,
        warn: contentWindow.console.warn,
        error: contentWindow.console.error,
        info: contentWindow.console.info,
      };

      contentWindow.console.log = function(...args) {
        logger.info("[IFRAME LOG]", args.length === 1 ? args[0] : args);
        originalConsole.log.apply(contentWindow.console, args);
      };

      contentWindow.console.warn = function(...args) {
        logger.warn("[IFRAME WARN]", args.length === 1 ? args[0] : args);
        originalConsole.warn.apply(contentWindow.console, args);
      };

      contentWindow.console.error = function(...args) {
        logger.error("[IFRAME ERROR]", args.length === 1 ? args[0] : args);
        originalConsole.error.apply(contentWindow.console, args);
      };

      contentWindow.console.info = function(...args) {
        logger.info("[IFRAME INFO]", args.length === 1 ? args[0] : args);
        originalConsole.info.apply(contentWindow.console, args);
      };

      // Intercept errors
      contentWindow.addEventListener('error', (event) => {
        logger.error(`[IFRAME EXCEPTION] ${event.message}`, {
          filename: event.filename,
          lineno: event.lineno,
          colno: event.colno
        });
      });

      contentWindow.addEventListener('unhandledrejection', (event) => {
        logger.error(`[IFRAME UNHANDLED REJECTION]`, event.reason);
      });

      logger.info("Successfully attached iframe interceptors.");
    } catch (e) {
      // Cross-origin restriction
      if (e.name === "SecurityError") {
        logger.warn("Cross-origin iframe detected. Cannot intercept console logs or inject APIs directly into the window. SCORM communication will only work if the course uses postMessage or is served from the same origin.", e.message);
        
        // Wait, SCORM requires window.API to exist on the parent if it's in an iframe.
        // A SCORM course in an iframe will typically look for `window.parent.API`.
        // So we MUST expose the APIs on our own window!
      } else {
        logger.error("Failed to setup iframe interceptors", e.message);
      }
    }
  }

  iframe.addEventListener('load', () => {
    // Attempt to setup interceptors for same-origin iframes
    setupIframeInterceptors();
  });

  // CRITICAL: Expose SCORM APIs on the main window so cross-origin iframes can find it via window.parent.API
  // Some courses do: while (win.parent && win.parent != win) { if (win.parent.API) return win.parent.API; }
  injectSCORMApis(window);
});
