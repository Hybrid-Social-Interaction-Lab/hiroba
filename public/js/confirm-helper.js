/**
 * Helper utilities for handling async confirm/prompt with existing sync code
 * Provides backward-compatible wrappers
 */

// Legacy async wrapper for confirm - handles the promise returned by our modal
window.confirmAsync = async function(message) {
  return window.modalSystem.showConfirm(message);
};

// Legacy async wrapper for alert
window.alertAsync = async function(message, title) {
  return window.modalSystem.showAlert(message, title);
};

// Legacy async wrapper for prompt
window.promptAsync = async function(message, defaultValue) {
  return window.modalSystem.showPrompt(message, defaultValue || '');
};

console.log('[Confirm Helper] Async wrappers available: confirmAsync(), alertAsync(), promptAsync()');
