/**
 * Progress Modal - 生成進捗表示用モーダル
 */

import { App, Modal } from 'obsidian';
import type { GenerationProgress } from '../types';

export class ProgressModal extends Modal {
  private progressEl: HTMLElement | null = null;
  private messageEl: HTMLElement | null = null;
  private progressBarEl: HTMLElement | null = null;

  constructor(app: App) {
    super(app);
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass('thumbnail-progress-modal');

    contentEl.createEl('h3', { text: '🎨 サムネイル生成中...' });

    // プログレスバー
    const progressContainer = contentEl.createDiv('progress-container');
    progressContainer.style.marginTop = '20px';
    progressContainer.style.marginBottom = '10px';
    
    const progressBarBg = progressContainer.createDiv('progress-bar-bg');
    progressBarBg.style.width = '100%';
    progressBarBg.style.height = '8px';
    progressBarBg.style.backgroundColor = 'var(--background-modifier-border)';
    progressBarBg.style.borderRadius = '4px';
    progressBarBg.style.overflow = 'hidden';

    this.progressBarEl = progressBarBg.createDiv('progress-bar');
    this.progressBarEl.style.width = '0%';
    this.progressBarEl.style.height = '100%';
    this.progressBarEl.style.backgroundColor = 'var(--interactive-accent)';
    this.progressBarEl.style.transition = 'width 0.3s ease';

    // メッセージ
    this.messageEl = contentEl.createDiv('progress-message');
    this.messageEl.style.textAlign = 'center';
    this.messageEl.style.marginTop = '15px';
    this.messageEl.style.color = 'var(--text-muted)';
    this.messageEl.setText('準備中...');

    // スピナー
    const spinnerEl = contentEl.createDiv('spinner');
    spinnerEl.style.textAlign = 'center';
    spinnerEl.style.marginTop = '20px';
    spinnerEl.style.fontSize = '24px';
    spinnerEl.setText('⏳');
  }

  onClose() {
    this.contentEl.empty();
  }

  updateProgress(progress: GenerationProgress) {
    if (this.messageEl) {
      this.messageEl.setText(progress.message);
    }

    if (this.progressBarEl && progress.progress !== undefined) {
      this.progressBarEl.style.width = `${progress.progress}%`;
    }

    // フェーズに応じた進捗
    const phaseProgress: Record<string, number> = {
      preparing: 10,
      generating: 50,
      saving: 80,
      done: 100,
      error: 0,
    };

    if (this.progressBarEl && progress.progress === undefined) {
      const percent = phaseProgress[progress.phase] || 0;
      this.progressBarEl.style.width = `${percent}%`;
    }
  }
}
