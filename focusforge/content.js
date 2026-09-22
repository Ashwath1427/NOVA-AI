// content.js - NOVA <-> FocusForge Bridge
console.log("FocusForge extension bridge loaded on", window.location.href);

// Notify NOVA that FocusForge extension is installed and ready
window.postMessage({ type: 'FOCUSFORGE_LOADED' }, '*');

// Listen for messages from NOVA web application
window.addEventListener('message', (event) => {
  if (event.source !== window) return;
  if (!event.data || !event.data.type) return;

  if (event.data.type === 'NOVA_START_FOCUS') {
    const duration = event.data.duration || (45 * 60);
    const taskTitle = event.data.taskTitle || 'Deep Work';
    try {
      chrome.runtime.sendMessage({
        action: 'START_FOCUS',
        duration: duration,
        taskTitle: taskTitle
      }, (response) => {
        window.postMessage({ type: 'FOCUSFORGE_STARTED', success: true }, '*');
      });
    } catch (e) {
      console.warn("Could not reach FocusForge background:", e);
    }
  } else if (event.data.type === 'NOVA_STOP_FOCUS') {
    try {
      chrome.runtime.sendMessage({ action: 'STOP_FOCUS' }, (response) => {
        window.postMessage({ type: 'FOCUSFORGE_STOPPED', success: true }, '*');
      });
    } catch (e) {
      console.warn("Could not reach FocusForge background:", e);
    }
  } else if (event.data.type === 'NOVA_PING_EXTENSION') {
    try {
      chrome.runtime.sendMessage({ action: 'GET_FOCUS_STATE' }, (response) => {
        window.postMessage({
          type: 'FOCUSFORGE_PONG',
          connected: true,
          isFocusActive: response?.isFocusActive || false
        }, '*');
      });
    } catch (e) {
      // background worker asleep
    }
  }
});
