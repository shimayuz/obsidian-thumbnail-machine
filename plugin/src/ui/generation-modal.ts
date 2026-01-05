/**
 * Generation Modal - サムネイル生成用モーダルUI
 */

import { App, Modal, Setting, Notice } from 'obsidian';
import type { 
  PluginSettings, 
  Platform, 
  ImageStyle, 
  ThumbnailRequest,
  ExtractedNoteInfo,
  AppealAxis,
  ReferenceImage,
} from '../types';
import { PLATFORM_CONFIGS as platformConfigs, APPEAL_AXIS_CONFIGS } from '../types';
import { AppealAxisModal } from './appeal-axis-modal';

export interface GenerationModalResult {
  requests: ThumbnailRequest[];
  confirmed: boolean;
}

export class GenerationModal extends Modal {
  private result: GenerationModalResult;
  private onSubmit: (result: GenerationModalResult) => void;
  
  private title: string;
  private subtitle: string;
  private keywords: string;
  private platform: Platform;
  private style: ImageStyle;
  private customPrompt: string;
  private selectedAxes: AppealAxis[] = [];
  private axesDisplayEl: HTMLElement | null = null;
  private referenceImages: ReferenceImage[] = [];
  private imagePreviewEl: HTMLElement | null = null;

  constructor(
    app: App,
    private settings: PluginSettings,
    private extractedInfo: ExtractedNoteInfo,
    onSubmit: (result: GenerationModalResult) => void
  ) {
    super(app);
    this.onSubmit = onSubmit;
    
    // 初期値を設定
    this.title = extractedInfo.title;
    this.subtitle = extractedInfo.subtitle || '';
    this.keywords = extractedInfo.keywords.join(', ');
    this.platform = settings.defaultPlatform;
    this.style = settings.defaultStyle;
    this.customPrompt = '';
    
    this.result = {
      requests: [],
      confirmed: false,
    };
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass('thumbnail-machine-modal');

    contentEl.createEl('h2', { text: '🎨 サムネイル生成' });

    // プラットフォーム選択
    new Setting(contentEl)
      .setName('プラットフォーム')
      .setDesc('サムネイルの用途を選択')
      .addDropdown(dropdown => {
        dropdown
          .addOption('youtube', `YouTube (1280x720)`)
          .addOption('note', `note (1280x670)`)
          .addOption('udemy', `Udemy (1280x720)`)
          .setValue(this.platform)
          .onChange(value => {
            this.platform = value as Platform;
            this.updatePreview();
          });
      });

    // スタイル選択
    new Setting(contentEl)
      .setName('スタイル')
      .setDesc('デザインスタイルを選択')
      .addDropdown(dropdown => {
        dropdown
          .addOption('modern', 'モダン・クリーン')
          .addOption('bold', '大胆・インパクト')
          .addOption('minimal', 'ミニマル')
          .addOption('gradient', 'グラデーション')
          .addOption('photo', '写真ベース')
          .addOption('illustration', 'イラスト風')
          .setValue(this.style)
          .onChange(value => {
            this.style = value as ImageStyle;
          });
      });

    // タイトル入力（必須）
    new Setting(contentEl)
      .setName('タイトル（必須）')
      .setDesc('サムネイルに表示するメインテキスト')
      .addText(text => {
        text
          .setPlaceholder('タイトルを入力してください')
          .setValue(this.title)
          .onChange(value => {
            this.title = value;
          });
        text.inputEl.style.width = '100%';
      });

    // サブタイトル入力
    new Setting(contentEl)
      .setName('サブタイトル（任意）')
      .setDesc('補足テキスト')
      .addText(text => {
        text
          .setPlaceholder('サブタイトルを入力')
          .setValue(this.subtitle)
          .onChange(value => {
            this.subtitle = value;
          });
        text.inputEl.style.width = '100%';
      });

    // キーワード入力
    new Setting(contentEl)
      .setName('キーワード（任意）')
      .setDesc('カンマ区切りでキーワードを入力')
      .addText(text => {
        text
          .setPlaceholder('AI, プログラミング, 入門')
          .setValue(this.keywords)
          .onChange(value => {
            this.keywords = value;
          });
        text.inputEl.style.width = '100%';
      });

    // 訴求軸選択
    const axesSetting = new Setting(contentEl)
      .setName('訴求軸を選択')
      .setDesc('25種類の訴求軸から3つまで選択してサムネイルを生成')
      .addButton(button => {
        button
          .setButtonText('訴求軸を選択...')
          .onClick(() => {
            const axisModal = new AppealAxisModal(
              this.app,
              (result) => {
                if (result.confirmed) {
                  this.selectedAxes = result.selectedAxes;
                  this.updateAxesDisplay();
                }
              },
              this.selectedAxes
            );
            axisModal.open();
          });
      });

    // 選択された訴求軸の表示エリア
    this.axesDisplayEl = contentEl.createDiv('selected-axes-display');
    this.axesDisplayEl.style.marginBottom = '15px';
    this.updateAxesDisplay();

    // カスタムプロンプト
    new Setting(contentEl)
      .setName('追加指示（任意）')
      .setDesc('AIへの追加指示')
      .addTextArea(textarea => {
        textarea
          .setPlaceholder('例: 青色を基調にしてください')
          .setValue(this.customPrompt)
          .onChange(value => {
            this.customPrompt = value;
          });
        textarea.inputEl.style.width = '100%';
        textarea.inputEl.style.height = '80px';
      });

    // 参照画像アップロード
    const imageUploadSetting = new Setting(contentEl)
      .setName('参照画像（任意）')
      .setDesc('合成に使用する画像を最大2枚まで追加（PNG, JPEG, WebP）');

    // ファイル入力を作成
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = 'image/png,image/jpeg,image/webp';
    fileInput.multiple = true;
    fileInput.style.display = 'none';
    fileInput.addEventListener('change', (e) => this.handleImageUpload(e));
    contentEl.appendChild(fileInput);

    imageUploadSetting.addButton(button => {
      button
        .setButtonText('画像を追加...')
        .onClick(() => {
          if (this.referenceImages.length >= 2) {
            new Notice('参照画像は最大2枚までです');
            return;
          }
          fileInput.click();
        });
    });

    // 画像プレビューエリア
    this.imagePreviewEl = contentEl.createDiv('reference-images-preview');
    this.imagePreviewEl.style.marginBottom = '15px';
    this.updateImagePreview();

    // プレビュー情報
    const previewEl = contentEl.createDiv('thumbnail-preview-info');
    this.updatePreviewElement(previewEl);

    // ボタン
    const buttonContainer = contentEl.createDiv('modal-button-container');
    buttonContainer.style.display = 'flex';
    buttonContainer.style.justifyContent = 'flex-end';
    buttonContainer.style.gap = '10px';
    buttonContainer.style.marginTop = '20px';

    const cancelBtn = buttonContainer.createEl('button', { text: 'キャンセル' });
    cancelBtn.addEventListener('click', () => {
      this.result.confirmed = false;
      this.close();
    });

    const generateBtn = buttonContainer.createEl('button', { 
      text: '生成する',
      cls: 'mod-cta'
    });
    generateBtn.addEventListener('click', () => {
      if (!this.title.trim()) {
        new Notice('タイトルを入力してください');
        return;
      }
      if (this.selectedAxes.length === 0) {
        new Notice('訴求軸を少なくとも1つ選択してください');
        return;
      }
      this.result = {
        requests: this.buildRequests(),
        confirmed: true,
      };
      this.close();
    });
  }

  onClose() {
    this.onSubmit(this.result);
    this.contentEl.empty();
  }

  private buildRequests(): ThumbnailRequest[] {
    return this.selectedAxes.map(axis => ({
      title: this.title,
      subtitle: this.subtitle || undefined,
      keywords: this.keywords 
        ? this.keywords.split(',').map(k => k.trim()).filter(k => k)
        : undefined,
      platform: this.platform,
      style: this.style,
      language: this.settings.language,
      customPrompt: this.customPrompt || undefined,
      appealAxis: axis,
      referenceImages: this.referenceImages.length > 0 ? this.referenceImages : undefined,
    }));
  }

  /**
   * 画像アップロード処理
   */
  private async handleImageUpload(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const files = input.files;
    if (!files) return;

    for (let i = 0; i < files.length; i++) {
      if (this.referenceImages.length >= 2) {
        new Notice('参照画像は最大2枚までです');
        break;
      }

      const file = files[i];
      
      // MIMEタイプチェック
      if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) {
        new Notice(`${file.name}: サポートされていない形式です（PNG, JPEG, WebPのみ）`);
        continue;
      }

      // ファイルサイズチェック（10MB制限）
      if (file.size > 10 * 1024 * 1024) {
        new Notice(`${file.name}: ファイルサイズが大きすぎます（10MB以下）`);
        continue;
      }

      try {
        const base64 = await this.fileToBase64(file);
        this.referenceImages.push({
          base64: base64,
          mimeType: file.type as 'image/png' | 'image/jpeg' | 'image/webp',
          fileName: file.name,
        });
      } catch (error) {
        new Notice(`${file.name}: 読み込みに失敗しました`);
      }
    }

    // 入力をリセット
    input.value = '';
    this.updateImagePreview();
  }

  /**
   * ファイルをBase64に変換
   */
  private fileToBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        // data:image/png;base64,... の形式から base64 部分のみを抽出
        const base64 = result.split(',')[1];
        resolve(base64);
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  /**
   * 画像プレビューを更新
   */
  private updateImagePreview(): void {
    if (!this.imagePreviewEl) return;
    this.imagePreviewEl.empty();

    if (this.referenceImages.length === 0) {
      const emptyText = this.imagePreviewEl.createEl('p');
      emptyText.textContent = '参照画像なし';
      emptyText.style.color = 'var(--text-muted)';
      emptyText.style.fontStyle = 'italic';
      emptyText.style.fontSize = '12px';
      return;
    }

    const container = this.imagePreviewEl.createDiv();
    container.style.display = 'flex';
    container.style.gap = '10px';
    container.style.flexWrap = 'wrap';

    this.referenceImages.forEach((img, index) => {
      const wrapper = container.createDiv();
      wrapper.style.position = 'relative';
      wrapper.style.display = 'inline-block';

      // サムネイルプレビュー
      const preview = wrapper.createEl('img');
      preview.src = `data:${img.mimeType};base64,${img.base64}`;
      preview.style.width = '80px';
      preview.style.height = '80px';
      preview.style.objectFit = 'cover';
      preview.style.borderRadius = '8px';
      preview.style.border = '2px solid var(--background-modifier-border)';

      // 削除ボタン
      const removeBtn = wrapper.createEl('button');
      removeBtn.textContent = '×';
      removeBtn.style.position = 'absolute';
      removeBtn.style.top = '-8px';
      removeBtn.style.right = '-8px';
      removeBtn.style.width = '20px';
      removeBtn.style.height = '20px';
      removeBtn.style.borderRadius = '50%';
      removeBtn.style.backgroundColor = 'var(--text-error)';
      removeBtn.style.color = 'white';
      removeBtn.style.border = 'none';
      removeBtn.style.cursor = 'pointer';
      removeBtn.style.fontSize = '12px';
      removeBtn.style.lineHeight = '1';
      removeBtn.style.padding = '0';
      removeBtn.addEventListener('click', () => {
        this.referenceImages.splice(index, 1);
        this.updateImagePreview();
      });

      // ファイル名
      const fileName = wrapper.createEl('p');
      fileName.textContent = img.fileName.length > 10 
        ? img.fileName.slice(0, 10) + '...' 
        : img.fileName;
      fileName.style.fontSize = '10px';
      fileName.style.textAlign = 'center';
      fileName.style.margin = '4px 0 0 0';
      fileName.style.color = 'var(--text-muted)';
    });

    // 残り枚数表示
    const countText = this.imagePreviewEl.createEl('p');
    countText.textContent = `${this.referenceImages.length}/2枚`;
    countText.style.fontSize = '12px';
    countText.style.color = 'var(--text-muted)';
    countText.style.marginTop = '8px';
  }

  private updateAxesDisplay() {
    if (!this.axesDisplayEl) return;
    this.axesDisplayEl.empty();

    if (this.selectedAxes.length === 0) {
      const emptyText = this.axesDisplayEl.createEl('p');
      emptyText.textContent = '訴求軸が選択されていません';
      emptyText.style.color = 'var(--text-muted)';
      emptyText.style.fontStyle = 'italic';
      return;
    }

    const container = this.axesDisplayEl.createDiv();
    container.style.display = 'flex';
    container.style.flexWrap = 'wrap';
    container.style.gap = '8px';

    this.selectedAxes.forEach((axisId, index) => {
      const config = APPEAL_AXIS_CONFIGS.find(c => c.id === axisId);
      if (!config) return;

      const badge = container.createEl('span');
      badge.textContent = `#${index + 1} ${config.name}`;
      badge.style.padding = '4px 10px';
      badge.style.backgroundColor = 'var(--interactive-accent)';
      badge.style.color = 'var(--text-on-accent)';
      badge.style.borderRadius = '12px';
      badge.style.fontSize = '12px';
      badge.style.fontWeight = 'bold';
    });

    const infoText = this.axesDisplayEl.createEl('p');
    infoText.textContent = `${this.selectedAxes.length}種類のサムネイルを生成します`;
    infoText.style.marginTop = '8px';
    infoText.style.fontSize = '12px';
    infoText.style.color = 'var(--text-muted)';
  }

  private updatePreview() {
    const previewEl = this.contentEl.querySelector('.thumbnail-preview-info');
    if (previewEl) {
      this.updatePreviewElement(previewEl as HTMLElement);
    }
  }

  private updatePreviewElement(el: HTMLElement) {
    el.empty();
    const config = platformConfigs[this.platform];
    el.createEl('p', { 
      text: `📐 ${config.description}`,
      cls: 'setting-item-description'
    });
  }
}
