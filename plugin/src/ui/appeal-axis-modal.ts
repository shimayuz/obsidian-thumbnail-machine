/**
 * Appeal Axis Selection Modal - 訴求軸選択用モーダルUI
 * 25種類の訴求軸から最大3つを選択できるマルチセレクトモーダル
 */

import { App, Modal, Notice } from 'obsidian';
import type { AppealAxis, AppealAxisConfig } from '../types';
import { APPEAL_AXIS_CONFIGS } from '../types';

export interface AppealAxisModalResult {
  selectedAxes: AppealAxis[];
  confirmed: boolean;
}

export class AppealAxisModal extends Modal {
  private selectedAxes: Set<AppealAxis> = new Set();
  private maxSelection = 3;
  private onSubmit: (result: AppealAxisModalResult) => void;
  private checkboxElements: Map<AppealAxis, HTMLInputElement> = new Map();

  constructor(
    app: App,
    onSubmit: (result: AppealAxisModalResult) => void,
    initialSelection?: AppealAxis[]
  ) {
    super(app);
    this.onSubmit = onSubmit;
    
    if (initialSelection) {
      initialSelection.forEach(axis => this.selectedAxes.add(axis));
    }
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass('thumbnail-machine-appeal-modal');

    // ヘッダー
    contentEl.createEl('h2', { text: '🎯 訴求軸を選択' });
    
    const descEl = contentEl.createEl('p', { 
      cls: 'appeal-modal-description'
    });
    descEl.innerHTML = `<strong>3つまで</strong>選択してください。選択した訴求軸に基づいてサムネイルを生成します。`;
    descEl.style.marginBottom = '15px';
    descEl.style.color = 'var(--text-muted)';

    // 選択カウンター
    const counterEl = contentEl.createDiv('appeal-selection-counter');
    counterEl.style.marginBottom = '15px';
    counterEl.style.padding = '10px';
    counterEl.style.backgroundColor = 'var(--background-secondary)';
    counterEl.style.borderRadius = '5px';
    counterEl.style.textAlign = 'center';
    this.updateCounter(counterEl);

    // グリッドコンテナ
    const gridEl = contentEl.createDiv('appeal-axis-grid');
    gridEl.style.display = 'grid';
    gridEl.style.gridTemplateColumns = 'repeat(auto-fill, minmax(200px, 1fr))';
    gridEl.style.gap = '10px';
    gridEl.style.maxHeight = '400px';
    gridEl.style.overflowY = 'auto';
    gridEl.style.padding = '5px';

    // 各訴求軸のカード
    APPEAL_AXIS_CONFIGS.forEach((config, index) => {
      const card = this.createAxisCard(config, index + 1, counterEl);
      gridEl.appendChild(card);
    });

    // ボタンコンテナ
    const buttonContainer = contentEl.createDiv('modal-button-container');
    buttonContainer.style.display = 'flex';
    buttonContainer.style.justifyContent = 'space-between';
    buttonContainer.style.alignItems = 'center';
    buttonContainer.style.marginTop = '20px';
    buttonContainer.style.paddingTop = '15px';
    buttonContainer.style.borderTop = '1px solid var(--background-modifier-border)';

    // クリアボタン
    const clearBtn = buttonContainer.createEl('button', { text: '選択をクリア' });
    clearBtn.style.marginRight = 'auto';
    clearBtn.addEventListener('click', () => {
      this.selectedAxes.clear();
      this.checkboxElements.forEach((checkbox) => {
        checkbox.checked = false;
        const card = checkbox.closest('.appeal-axis-card') as HTMLElement;
        if (card) {
          card.removeClass('selected');
        }
      });
      this.updateCounter(counterEl);
    });

    // 右側のボタングループ
    const rightButtons = buttonContainer.createDiv();
    rightButtons.style.display = 'flex';
    rightButtons.style.gap = '10px';

    const cancelBtn = rightButtons.createEl('button', { text: 'キャンセル' });
    cancelBtn.addEventListener('click', () => {
      this.onSubmit({ selectedAxes: [], confirmed: false });
      this.close();
    });

    const confirmBtn = rightButtons.createEl('button', { 
      text: '決定',
      cls: 'mod-cta'
    });
    confirmBtn.addEventListener('click', () => {
      if (this.selectedAxes.size === 0) {
        new Notice('少なくとも1つの訴求軸を選択してください');
        return;
      }
      if (this.selectedAxes.size > this.maxSelection) {
        new Notice(`最大${this.maxSelection}つまで選択できます`);
        return;
      }
      this.onSubmit({ 
        selectedAxes: Array.from(this.selectedAxes), 
        confirmed: true 
      });
      this.close();
    });
  }

  onClose() {
    this.contentEl.empty();
  }

  private createAxisCard(config: AppealAxisConfig, number: number, counterEl: HTMLElement): HTMLElement {
    const card = document.createElement('div');
    card.className = 'appeal-axis-card';
    card.style.padding = '12px';
    card.style.border = '1px solid var(--background-modifier-border)';
    card.style.borderRadius = '8px';
    card.style.cursor = 'pointer';
    card.style.transition = 'all 0.2s ease';
    card.style.backgroundColor = 'var(--background-primary)';

    if (this.selectedAxes.has(config.id)) {
      card.addClass('selected');
      card.style.borderColor = 'var(--interactive-accent)';
      card.style.backgroundColor = 'var(--background-secondary)';
    }

    // チェックボックス + ラベル
    const headerEl = document.createElement('div');
    headerEl.style.display = 'flex';
    headerEl.style.alignItems = 'center';
    headerEl.style.gap = '8px';
    headerEl.style.marginBottom = '6px';

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = this.selectedAxes.has(config.id);
    checkbox.style.cursor = 'pointer';
    this.checkboxElements.set(config.id, checkbox);

    const numberBadge = document.createElement('span');
    numberBadge.textContent = `${number}`;
    numberBadge.style.backgroundColor = 'var(--interactive-accent)';
    numberBadge.style.color = 'var(--text-on-accent)';
    numberBadge.style.padding = '2px 6px';
    numberBadge.style.borderRadius = '4px';
    numberBadge.style.fontSize = '11px';
    numberBadge.style.fontWeight = 'bold';

    const nameEl = document.createElement('span');
    nameEl.textContent = config.name;
    nameEl.style.fontWeight = 'bold';
    nameEl.style.flex = '1';

    headerEl.appendChild(checkbox);
    headerEl.appendChild(numberBadge);
    headerEl.appendChild(nameEl);

    // 説明
    const descEl = document.createElement('div');
    descEl.textContent = config.description;
    descEl.style.fontSize = '12px';
    descEl.style.color = 'var(--text-muted)';
    descEl.style.marginLeft = '26px';

    card.appendChild(headerEl);
    card.appendChild(descEl);

    // クリックイベント
    const toggleSelection = () => {
      if (this.selectedAxes.has(config.id)) {
        this.selectedAxes.delete(config.id);
        checkbox.checked = false;
        card.removeClass('selected');
        card.style.borderColor = 'var(--background-modifier-border)';
        card.style.backgroundColor = 'var(--background-primary)';
      } else {
        if (this.selectedAxes.size >= this.maxSelection) {
          new Notice(`最大${this.maxSelection}つまで選択できます`);
          return;
        }
        this.selectedAxes.add(config.id);
        checkbox.checked = true;
        card.addClass('selected');
        card.style.borderColor = 'var(--interactive-accent)';
        card.style.backgroundColor = 'var(--background-secondary)';
      }
      this.updateCounter(counterEl);
    };

    card.addEventListener('click', (e) => {
      if (e.target !== checkbox) {
        toggleSelection();
      }
    });

    checkbox.addEventListener('change', () => {
      toggleSelection();
    });

    // ホバーエフェクト
    card.addEventListener('mouseenter', () => {
      if (!this.selectedAxes.has(config.id)) {
        card.style.borderColor = 'var(--background-modifier-border-hover)';
      }
    });

    card.addEventListener('mouseleave', () => {
      if (!this.selectedAxes.has(config.id)) {
        card.style.borderColor = 'var(--background-modifier-border)';
      }
    });

    return card;
  }

  private updateCounter(counterEl: HTMLElement) {
    counterEl.empty();
    const count = this.selectedAxes.size;
    const selectedNames = Array.from(this.selectedAxes)
      .map(id => APPEAL_AXIS_CONFIGS.find(c => c.id === id)?.name)
      .filter(Boolean)
      .join(', ');

    const countText = counterEl.createEl('span');
    countText.innerHTML = `選択中: <strong>${count}/${this.maxSelection}</strong>`;
    
    if (selectedNames) {
      const namesText = counterEl.createEl('div');
      namesText.textContent = selectedNames;
      namesText.style.marginTop = '5px';
      namesText.style.fontSize = '13px';
      namesText.style.color = 'var(--text-accent)';
    }
  }
}
