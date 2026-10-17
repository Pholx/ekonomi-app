// ════════════════════════════════════════════════════════════════════
// VIEWBAR – injicerar top-bar i båda apparna
// ════════════════════════════════════════════════════════════════════
// Anropas så här från respektive apps index.html:
//   <script src="../shared/viewbar.js"></script>
//   <script>buildViewbar('budget');</script>
// ════════════════════════════════════════════════════════════════════

(function() {
    const VIEWS = {
    budget: {
      emoji: '📋',
      label: 'Budget',
      path:  '../budget/budget.html'
    },
    fire: {
      emoji: '🔥',
      label: 'FIRE',
      path:  '../fire/fire.html'
    }
  };

  window.buildViewbar = function(currentView) {
    if (!VIEWS[currentView]) {
      console.warn('[viewbar] Okänt vy-namn:', currentView);
      return;
    }

    const bar = document.createElement('div');
    bar.className = 'viewbar';

    const tabs = Object.entries(VIEWS).map(([key, v]) => {
      const active = key === currentView ? 'active' : '';
      return `<button class="viewbar-tab ${active}" data-view="${key}">
        ${v.emoji} ${v.label}
      </button>`;
    }).join('');

    bar.innerHTML = `
      <span class="viewbar-brand">💰 Ekonomi</span>
      ${tabs}
    `;

    // Lägg överst i body
    document.body.insertBefore(bar, document.body.firstChild);

    // Koppla klick
    bar.querySelectorAll('[data-view]').forEach(btn => {
      btn.addEventListener('click', () => {
        const view = btn.dataset.view;
        if (view === currentView) return;
        window.location.href = VIEWS[view].path;
      });
    });
  };
})();