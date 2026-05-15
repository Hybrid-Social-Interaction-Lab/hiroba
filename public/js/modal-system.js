/**
 * Custom Modal System - Replaces native alert() and confirm()
 * Uses Bootstrap 5 for styling consistency
 */

class CustomModalSystem {
  constructor() {
    this.createModalHTML();
    this.setupEventListeners();
  }

  createModalHTML() {
    // Check if modal system already exists
    if (document.getElementById('custom-modal-container')) {
      return;
    }

    const container = document.createElement('div');
    container.id = 'custom-modal-container';
    container.innerHTML = `
      <!-- Alert Modal -->
      <div class="modal fade" id="alertModal" tabindex="-1" role="dialog" aria-labelledby="alertModalLabel" aria-hidden="true">
        <div class="modal-dialog modal-dialog-centered" role="document">
          <div class="modal-content">
            <div class="modal-header">
              <h5 class="modal-title" id="alertModalLabel">Message</h5>
              <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
            </div>
            <div class="modal-body" id="alertModalBody">
              <!-- Message will be inserted here -->
            </div>
            <div class="modal-footer">
              <button type="button" class="btn btn-primary" id="alertModalBtn" data-bs-dismiss="modal">OK</button>
            </div>
          </div>
        </div>
      </div>

      <!-- Confirm Modal -->
      <div class="modal fade" id="confirmModal" tabindex="-1" role="dialog" aria-labelledby="confirmModalLabel" aria-hidden="true">
        <div class="modal-dialog modal-dialog-centered" role="document">
          <div class="modal-content">
            <div class="modal-header">
              <h5 class="modal-title" id="confirmModalLabel">Confirmation</h5>
              <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
            </div>
            <div class="modal-body" id="confirmModalBody">
              <!-- Message will be inserted here -->
            </div>
            <div class="modal-footer">
              <button type="button" class="btn btn-secondary" id="confirmModalCancelBtn" data-bs-dismiss="modal">Cancel</button>
              <button type="button" class="btn btn-primary" id="confirmModalOkBtn">OK</button>
            </div>
          </div>
        </div>
      </div>

      <!-- Prompt Modal -->
      <div class="modal fade" id="promptModal" tabindex="-1" role="dialog" aria-labelledby="promptModalLabel" aria-hidden="true">
        <div class="modal-dialog modal-dialog-centered" role="document">
          <div class="modal-content">
            <div class="modal-header">
              <h5 class="modal-title" id="promptModalLabel">Input Required</h5>
              <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
            </div>
            <div class="modal-body" id="promptModalBody">
              <p id="promptModalLabel"></p>
              <input type="text" class="form-control" id="promptModalInput" placeholder="Enter your response">
            </div>
            <div class="modal-footer">
              <button type="button" class="btn btn-secondary" id="promptModalCancelBtn" data-bs-dismiss="modal">Cancel</button>
              <button type="button" class="btn btn-primary" id="promptModalOkBtn">OK</button>
            </div>
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(container);
  }

  setupEventListeners() {
    // Alert modal
    const alertBtn = document.getElementById('alertModalBtn');
    if (alertBtn) {
      alertBtn.addEventListener('click', () => {
        this.alertResolve?.(null);
      });
    }

    // Confirm modal
    const confirmOkBtn = document.getElementById('confirmModalOkBtn');
    const confirmCancelBtn = document.getElementById('confirmModalCancelBtn');
    if (confirmOkBtn) {
      confirmOkBtn.addEventListener('click', () => {
        this.confirmResolve?.(true);
        bootstrap.Modal.getInstance(document.getElementById('confirmModal'))?.hide();
      });
    }
    if (confirmCancelBtn) {
      confirmCancelBtn.addEventListener('click', () => {
        this.confirmResolve?.(false);
      });
    }

    // Prompt modal
    const promptOkBtn = document.getElementById('promptModalOkBtn');
    const promptCancelBtn = document.getElementById('promptModalCancelBtn');
    const promptInput = document.getElementById('promptModalInput');

    if (promptOkBtn) {
      promptOkBtn.addEventListener('click', () => {
        this.promptResolve?.(promptInput.value);
        bootstrap.Modal.getInstance(document.getElementById('promptModal'))?.hide();
      });
    }
    if (promptCancelBtn) {
      promptCancelBtn.addEventListener('click', () => {
        this.promptResolve?.(null);
      });
    }

    // Allow Enter key in prompt input
    if (promptInput) {
      promptInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
          promptOkBtn?.click();
        }
      });
    }

    // Cleanup resolvers on modal hide
    ['alertModal', 'confirmModal', 'promptModal'].forEach(id => {
      const modal = document.getElementById(id);
      if (modal) {
        modal.addEventListener('hidden.bs.modal', () => {
          if (id === 'alertModal') this.alertResolve?.(null);
          if (id === 'confirmModal') this.confirmResolve?.(false);
          if (id === 'promptModal') this.promptResolve?.(null);
        });
      }
    });
  }

  showAlert(message, title = 'Message') {
    return new Promise((resolve) => {
      this.alertResolve = resolve;
      const alertModal = document.getElementById('alertModal');
      const alertLabel = document.getElementById('alertModalLabel');
      const alertBody = document.getElementById('alertModalBody');

      if (alertLabel) alertLabel.textContent = title;
      if (alertBody) {
        // Support HTML content
        if (typeof message === 'string' && message.includes('<')) {
          alertBody.innerHTML = message;
        } else {
          alertBody.textContent = message;
        }
      }

      const modal = new bootstrap.Modal(alertModal, { backdrop: 'static', keyboard: false });
      modal.show();

      // Auto-focus OK button
      const okBtn = document.getElementById('alertModalBtn');
      if (okBtn) okBtn.focus();
    });
  }

  showConfirm(message, title = 'Confirmation') {
    return new Promise((resolve) => {
      this.confirmResolve = resolve;
      const confirmModal = document.getElementById('confirmModal');
      const confirmLabel = document.getElementById('confirmModalLabel');
      const confirmBody = document.getElementById('confirmModalBody');

      if (confirmLabel) confirmLabel.textContent = title;
      if (confirmBody) {
        // Support HTML content
        if (typeof message === 'string' && message.includes('<')) {
          confirmBody.innerHTML = message;
        } else {
          confirmBody.textContent = message;
        }
      }

      const modal = new bootstrap.Modal(confirmModal, { backdrop: 'static', keyboard: false });
      modal.show();

      // Auto-focus OK button
      const okBtn = document.getElementById('confirmModalOkBtn');
      if (okBtn) okBtn.focus();
    });
  }

  showPrompt(message, defaultValue = '', title = 'Input Required') {
    return new Promise((resolve) => {
      this.promptResolve = resolve;
      const promptModal = document.getElementById('promptModal');
      const promptLabel = document.getElementById('promptModalLabel');
      const promptInput = document.getElementById('promptModalInput');

      if (promptLabel) promptLabel.textContent = message;
      if (promptInput) {
        promptInput.value = defaultValue;
        promptInput.focus();
        promptInput.select();
      }

      const modal = new bootstrap.Modal(promptModal, { backdrop: 'static', keyboard: false });
      modal.show();
    });
  }
}

// Initialize the modal system globally
window.modalSystem = new CustomModalSystem();

// Store original native functions for reference
window._originalAlert = window.alert;
window._originalConfirm = window.confirm;
window._originalPrompt = window.prompt;

// Override native functions to use modals
window.alert = function(message) {
  // alert() doesn't need to return anything (void)
  window.modalSystem.showAlert(message);
};

window.confirm = function(message) {
  // confirm() returns a promise for async handling
  // For truly synchronous code, use confirmAsync() wrapper instead
  return window.modalSystem.showConfirm(message);
};

window.prompt = function(message, defaultValue = '') {
  // prompt() returns a promise
  return window.modalSystem.showPrompt(message, defaultValue);
};

console.log('[Modal System] Custom modal system initialized - native popups disabled');
