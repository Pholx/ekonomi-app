function renderAssets() {
    const container = document.getElementById('allocation-card');
    if (!container) return;

    let html = `
        <div class="asset-row-header">
            <span>Tillgång</span>
            <span class="header-isk">ISK %</span>
            <span class="header-depa">DEPÅ %</span>
            <span>Avkastning %</span>
            <span>Volatilitet %</span>
        </div>`;

    let currentCategory = "";

    assetStructure.forEach(asset => {
        if (asset.category !== currentCategory) {
            html += `<div class="category-title">${asset.category}</div>`;
            currentCategory = asset.category;
        }

        html += `
        <div class="asset-input-group">
            <span class="asset-name">${asset.name}</span>
            <input type="number" value="${asset.allocIsk || 0}" data-id="${asset.id}" data-type="isk" class="input-isk" min="0" max="100" step="1">
            <input type="number" value="${asset.allocDepa || 0}" data-id="${asset.id}" data-type="depa" class="input-depa" min="0" max="100" step="1">
            <input type="number" value="${asset.return}" disabled class="readonly-input">
            <input type="number" value="${asset.vol}" disabled class="readonly-input">
        </div>`;
    });

    html += `
        <div class="allocation-footer">
            <span>Summa:</span>
            <span id="sum-isk" class="sum-val">0%</span>
            <span id="sum-depa" class="sum-val">0%</span>
            <span></span>
            <span></span>
        </div>`;

    container.innerHTML = html;

    // Lägg till event listeners
    container.querySelectorAll('input[type="number"]').forEach(input => {
        // Initiera styling baserat på startvärden (för icke-disabled inputs)
        if (!input.disabled) {
            if (input.value !== "0" && input.value !== 0) {
                input.style.backgroundColor = "#2a3a2a";
                input.style.color = "#aaffaa";
            }
            input.setAttribute('value', input.value);
        }

        input.addEventListener('input', function() {
            updateAllocations();
            if (typeof FireCalc !== 'undefined' && FireCalc.updateFireTable) {
                FireCalc.updateFireTable();
            }

            // Uppdatera value-attributet för CSS-styling (enbart för icke-disabled inputs)
            if (!this.disabled) {
                this.setAttribute('value', this.value);

                // Hantera bakgrundsfärg baserat på värde
                if (this.value === "0" || this.value === 0 || this.value === "") {
                    this.style.backgroundColor = "";
                    this.style.color = "";
                } else {
                    this.style.backgroundColor = "#2a3a2a";
                    this.style.color = "#aaffaa";
                }
            }
        });
    });

    updateAllocations();
}

function updateAllocations() {
    let sums = { isk: 0, depa: 0 };

    document.querySelectorAll('.asset-input-group').forEach(row => {
        const assetId = row.querySelector('.input-isk').dataset.id;
        const asset = assetStructure.find(a => a.id === assetId);

        if (asset) {
            asset.allocIsk = parseFloat(row.querySelector('.input-isk').value) || 0;
            asset.allocDepa = parseFloat(row.querySelector('.input-depa').value) || 0;

            sums.isk += asset.allocIsk;
            sums.depa += asset.allocDepa;
        }
    });

    const sumIskEl = document.getElementById('sum-isk');
    const sumDepaEl = document.getElementById('sum-depa');

    if (sumIskEl) {
        sumIskEl.textContent = sums.isk.toFixed(0) + "%";
        // Validering för ISK
        if (Math.abs(sums.isk - 100) > 0.5 && sums.isk > 0) {
            sumIskEl.style.color = '#ff6b6b';
            sumIskEl.style.fontWeight = 'bold';
            sumIskEl.title = `Summan är ${sums.isk.toFixed(0)}% - rekommenderar 100%`;
        } else if (sums.isk > 0) {
            sumIskEl.style.color = '#4caf50';
            sumIskEl.style.fontWeight = 'normal';
            sumIskEl.title = '';
        }
    }

    if (sumDepaEl) {
        sumDepaEl.textContent = sums.depa.toFixed(0) + "%";
        // Validering för DEPÅ
        if (Math.abs(sums.depa - 100) > 0.5 && sums.depa > 0) {
            sumDepaEl.style.color = '#ff6b6b';
            sumDepaEl.style.fontWeight = 'bold';
            sumDepaEl.title = `Summan är ${sums.depa.toFixed(0)}% - rekommenderar 100%`;
        } else if (sums.depa > 0) {
            sumDepaEl.style.color = '#4caf50';
            sumDepaEl.style.fontWeight = 'normal';
            sumDepaEl.title = '';
        }
    }
}

// Kör render när sidan laddats
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', renderAssets);
} else {
    renderAssets();
}