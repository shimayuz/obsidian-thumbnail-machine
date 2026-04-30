/**
 * Thumbnail Machine Plugin - メインエントリポイント
 * YouTube, note, Udemy向けサムネイル生成プラグイン
 */

import {
  App,
  Plugin,
  PluginSettingTab,
  Setting,
  Notice,
  TFile,
  TFolder,
  DropdownComponent,
  TextComponent,
  TextAreaComponent,
  AbstractInputSuggest,
} from 'obsidian';

import type { PluginSettings, GenerationProgress, Platform, ImageStyle, ImageProvider } from './types';
import { DEFAULT_SETTINGS, PLATFORM_CONFIGS, APPEAL_AXIS_CONFIGS } from './types';
import { createApiClient, ApiClient } from './api/api-client';
import { testCodexConnection, startCodexLogin } from './api/codex-cli-client';
import { NoteExtractor } from './core/note-extractor';
import { ImageSaver } from './core/image-saver';
import { GenerationModal } from './ui/generation-modal';
import { ProgressModal } from './ui/progress-modal';

export default class ThumbnailMachinePlugin extends Plugin {
  settings!: PluginSettings;
  private apiClient!: ApiClient;
  private noteExtractor!: NoteExtractor;
  private imageSaver!: ImageSaver;

  async onload() {
    await this.loadSettings();
    this.initializeServices();
    this.registerCommands();
    this.addSettingTab(new ThumbnailMachineSettingTab(this.app, this));

    // サイドバーにリボンアイコンを追加
    this.addRibbonIcon('image', 'Generate Thumbnail', () => {
      this.generateThumbnail();
    });

    console.log('Thumbnail Machine Plugin loaded');
  }

  onunload() {
    console.log('Thumbnail Machine Plugin unloaded');
  }

  private initializeServices() {
    this.noteExtractor = new NoteExtractor();
    this.imageSaver = new ImageSaver(this.app, this.settings);
    
    // API クライアントは設定が有効な場合のみ初期化
    try {
      this.apiClient = createApiClient(this.settings);
    } catch (e) {
      // API キーが未設定の場合は後で初期化
    }
  }

  private registerCommands() {
    // メインコマンド: サムネイル生成
    this.addCommand({
      id: 'generate-thumbnail',
      name: 'Generate Thumbnail',
      callback: () => this.generateThumbnail(),
    });

    // YouTube用サムネイル生成
    this.addCommand({
      id: 'generate-youtube-thumbnail',
      name: 'Generate YouTube Thumbnail',
      callback: () => this.generateThumbnailForPlatform('youtube'),
    });

    // note用サムネイル生成
    this.addCommand({
      id: 'generate-note-thumbnail',
      name: 'Generate note Thumbnail',
      callback: () => this.generateThumbnailForPlatform('note'),
    });

    // Udemy用サムネイル生成
    this.addCommand({
      id: 'generate-udemy-thumbnail',
      name: 'Generate Udemy Thumbnail',
      callback: () => this.generateThumbnailForPlatform('udemy'),
    });
  }

  /**
   * サムネイル生成（モーダル表示）
   */
  async generateThumbnail() {
    const file = this.app.workspace.getActiveFile();
    if (!file || file.extension !== 'md') {
      new Notice('Please open a markdown note first');
      return;
    }

    // Provider 設定チェック
    if (this.settings.imageProvider === 'kie' && !this.settings.kieApiKey) {
      new Notice('Please configure your KIE API key in settings');
      return;
    }

    // ノートから情報を抽出
    const content = await this.app.vault.read(file);
    const extractedInfo = this.noteExtractor.extract(content, file.basename);

    // モーダルを表示
    const modal = new GenerationModal(
      this.app,
      this.settings,
      extractedInfo,
      async (result) => {
        if (result.confirmed && result.requests.length > 0) {
          await this.executeMultipleGenerations(result.requests, file);
        }
      }
    );
    modal.open();
  }

  /**
   * 特定プラットフォーム向けサムネイル生成（クイック）
   */
  async generateThumbnailForPlatform(platform: Platform) {
    const file = this.app.workspace.getActiveFile();
    if (!file || file.extension !== 'md') {
      new Notice('Please open a markdown note first');
      return;
    }

    // Provider 設定チェック
    if (this.settings.imageProvider === 'kie' && !this.settings.kieApiKey) {
      new Notice('Please configure your KIE API key in settings');
      return;
    }

    // ノートから情報を抽出
    const content = await this.app.vault.read(file);
    const extractedInfo = this.noteExtractor.extract(content, file.basename);

    // リクエストを作成
    const request = {
      title: extractedInfo.title,
      subtitle: extractedInfo.subtitle,
      keywords: extractedInfo.keywords,
      platform: platform,
      style: this.settings.defaultStyle,
      language: this.settings.language,
    };

    await this.executeSingleGeneration(request, file);
  }

  /**
   * 複数のサムネイルを生成（訴求軸ごと）
   */
  private async executeMultipleGenerations(
    requests: Parameters<ApiClient['generateThumbnail']>[0][],
    file: TFile
  ) {
    // API クライアントを再初期化
    try {
      this.apiClient = createApiClient(this.settings);
    } catch (e) {
      new Notice(`Provider 初期化エラー: ${e instanceof Error ? e.message : String(e)}`);
      return;
    }

    // プログレスモーダルを表示
    const progressModal = new ProgressModal(this.app);
    progressModal.open();

    const totalCount = requests.length;
    const savedPaths: string[] = [];
    const errors: string[] = [];

    try {
      for (let i = 0; i < requests.length; i++) {
        const request = requests[i];
        const axisName = request.appealAxis 
          ? APPEAL_AXIS_CONFIGS.find(c => c.id === request.appealAxis)?.name || request.appealAxis
          : '';

        // 生成開始
        progressModal.updateProgress({
          phase: 'generating',
          message: `#${i + 1}/${totalCount} ${axisName}型サムネイルを生成中...`,
          progress: Math.round((i / totalCount) * 100),
        });

        try {
          const result = await this.apiClient.generateThumbnail(request);

          // 保存
          progressModal.updateProgress({
            phase: 'saving',
            message: `#${i + 1}/${totalCount} 画像を保存中...`,
            progress: Math.round(((i + 0.5) / totalCount) * 100),
          });

          const filePath = await this.imageSaver.save(
            result, 
            `${request.title}-${axisName}`
          );
          savedPaths.push(filePath);
        } catch (error) {
          const errorMsg = error instanceof Error ? error.message : 'Unknown error';
          errors.push(`#${i + 1} ${axisName}: ${errorMsg}`);
          console.error(`Thumbnail generation error for ${axisName}:`, error);
        }
      }

      // 完了
      progressModal.updateProgress({
        phase: 'done',
        message: `完了！ ${savedPaths.length}/${totalCount}枚生成`,
        progress: 100,
      });

      // 少し待ってからモーダルを閉じる
      setTimeout(async () => {
        progressModal.close();
        
        if (savedPaths.length > 0) {
          // 成功通知
          new Notice(`${savedPaths.length}枚のサムネイルを保存しました`);

          // 画像リンクを生成
          const links = savedPaths.map(p => this.imageSaver.generateWikiLink(p)).join('\n');
          
          // ノートのトップに挿入
          if (this.settings.insertToNote) {
            await this.insertLinksToNoteTop(file, links);
            new Notice('画像をノートのトップに挿入しました');
          } else {
            // クリップボードにリンクをコピー
            navigator.clipboard.writeText(links);
            new Notice('画像リンクをクリップボードにコピーしました');
          }
        }

        if (errors.length > 0) {
          new Notice(`エラー: ${errors.join(', ')}`);
        }
      }, 500);

    } catch (error) {
      progressModal.updateProgress({
        phase: 'error',
        message: `エラー: ${error instanceof Error ? error.message : 'Unknown error'}`,
      });

      setTimeout(() => {
        progressModal.close();
      }, 2000);

      console.error('Thumbnail generation error:', error);
      new Notice(`サムネイル生成エラー: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * 単一のサムネイルを生成（クイック生成用）
   */
  private async executeSingleGeneration(
    request: Parameters<ApiClient['generateThumbnail']>[0],
    file: TFile
  ) {
    // API クライアントを再初期化
    try {
      this.apiClient = createApiClient(this.settings);
    } catch (e) {
      new Notice(`Provider 初期化エラー: ${e instanceof Error ? e.message : String(e)}`);
      return;
    }

    // プログレスモーダルを表示
    const progressModal = new ProgressModal(this.app);
    progressModal.open();

    try {
      // 生成開始
      progressModal.updateProgress({
        phase: 'generating',
        message: `${PLATFORM_CONFIGS[request.platform].name}用サムネイルを生成中...`,
      });

      const result = await this.apiClient.generateThumbnail(request);

      // 保存
      progressModal.updateProgress({
        phase: 'saving',
        message: '画像を保存中...',
      });

      const filePath = await this.imageSaver.save(result, request.title);

      // 完了
      progressModal.updateProgress({
        phase: 'done',
        message: '完了！',
        progress: 100,
      });

      // 少し待ってからモーダルを閉じる
      setTimeout(async () => {
        progressModal.close();
        
        // 成功通知
        new Notice(`サムネイルを保存しました: ${filePath}`);

        // 画像リンクを生成
        const link = this.imageSaver.generateWikiLink(filePath);
        
        // ノートのトップに挿入
        if (this.settings.insertToNote) {
          await this.insertLinksToNoteTop(file, link);
          new Notice('画像をノートのトップに挿入しました');
        } else {
          // クリップボードにリンクをコピー
          navigator.clipboard.writeText(link);
          new Notice('画像リンクをクリップボードにコピーしました');
        }
      }, 500);

    } catch (error) {
      progressModal.updateProgress({
        phase: 'error',
        message: `エラー: ${error instanceof Error ? error.message : 'Unknown error'}`,
      });

      setTimeout(() => {
        progressModal.close();
      }, 2000);

      console.error('Thumbnail generation error:', error);
      new Notice(`サムネイル生成エラー: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * ノートのトップに画像リンクを挿入
   */
  private async insertLinksToNoteTop(file: TFile, links: string): Promise<void> {
    const content = await this.app.vault.read(file);
    
    // frontmatterがある場合はその後に挿入
    const frontmatterMatch = content.match(/^---\n[\s\S]*?\n---\n/);
    
    let newContent: string;
    if (frontmatterMatch) {
      const frontmatter = frontmatterMatch[0];
      const rest = content.slice(frontmatter.length);
      newContent = `${frontmatter}\n${links}\n${rest}`;
    } else {
      newContent = `${links}\n\n${content}`;
    }
    
    await this.app.vault.modify(file, newContent);
  }

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings() {
    await this.saveData(this.settings);
    // サービスを再初期化
    this.initializeServices();
  }
}

/**
 * フォルダサジェスト - 入力に応じてフォルダ候補を表示
 */
class FolderSuggest extends AbstractInputSuggest<TFolder> {
  private inputEl: HTMLInputElement;

  constructor(app: App, inputEl: HTMLInputElement) {
    super(app, inputEl);
    this.inputEl = inputEl;
  }

  getSuggestions(inputStr: string): TFolder[] {
    const abstractFiles = this.app.vault.getAllLoadedFiles();
    const folders: TFolder[] = [];
    const lowerCaseInputStr = inputStr.toLowerCase();

    abstractFiles.forEach((folder) => {
      if (
        folder instanceof TFolder &&
        folder.path.toLowerCase().contains(lowerCaseInputStr)
      ) {
        folders.push(folder);
      }
    });

    // パスの長さでソート（短いものが先）
    return folders.sort((a, b) => a.path.length - b.path.length).slice(0, 20);
  }

  renderSuggestion(folder: TFolder, el: HTMLElement): void {
    el.createEl('div', { text: folder.path || '/' });
  }

  selectSuggestion(folder: TFolder): void {
    this.inputEl.value = folder.path;
    this.inputEl.trigger('input');
    this.close();
  }
}

/**
 * 設定タブ
 */
class ThumbnailMachineSettingTab extends PluginSettingTab {
  plugin: ThumbnailMachinePlugin;

  constructor(app: App, plugin: ThumbnailMachinePlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    containerEl.createEl('h2', { text: 'Thumbnail Machine Settings' });

    // Provider 設定セクション
    containerEl.createEl('h3', { text: 'Provider Settings' });

    new Setting(containerEl)
      .setName('Image Provider')
      .setDesc('画像生成プロバイダーを選択。Codex CLI は ChatGPT サブスク認証で動作（要事前 `codex login`）。')
      .addDropdown((dropdown: DropdownComponent) =>
        dropdown
          .addOption('kie', 'kie.ai (nano-banana-2)')
          .addOption('codex', 'OpenAI Codex CLI (built-in image_gen)')
          .setValue(this.plugin.settings.imageProvider)
          .onChange(async (value: string) => {
            this.plugin.settings.imageProvider = value as ImageProvider;
            await this.plugin.saveSettings();
            this.display();
          })
      );

    if (this.plugin.settings.imageProvider === 'kie') {
      const apiKeySetting = new Setting(containerEl)
        .setName('KIE API Key')
        .setDesc('KIE API key for image generation');

      let apiKeyInput: HTMLInputElement;
      let isVisible = false;

      apiKeySetting.addText((text: TextComponent) => {
        text
          .setPlaceholder('Enter your KIE API key')
          .setValue(this.plugin.settings.kieApiKey)
          .onChange(async (value: string) => {
            this.plugin.settings.kieApiKey = value;
            await this.plugin.saveSettings();
          });
        apiKeyInput = text.inputEl;
        apiKeyInput.type = 'password';
        apiKeyInput.style.width = '100%';
      });

      apiKeySetting.addButton((button) => {
        button
          .setIcon('eye')
          .setTooltip('APIキーを表示/非表示')
          .onClick(() => {
            isVisible = !isVisible;
            apiKeyInput.type = isVisible ? 'text' : 'password';
            button.setIcon(isVisible ? 'eye-off' : 'eye');
          });
      });
    } else if (this.plugin.settings.imageProvider === 'codex') {
      new Setting(containerEl)
        .setName('Codex CLI Binary Path')
        .setDesc('空欄で自動検出 (~/.npm-global/bin/codex, /opt/homebrew/bin/codex, /usr/local/bin/codex の順)。GUI起動時にPATHが通らない場合は絶対パスを指定。')
        .addText((text: TextComponent) =>
          text
            .setPlaceholder('/Users/you/.npm-global/bin/codex')
            .setValue(this.plugin.settings.codexBinaryPath)
            .onChange(async (value: string) => {
              this.plugin.settings.codexBinaryPath = value.trim();
              await this.plugin.saveSettings();
            })
        );

      new Setting(containerEl)
        .setName('Codex Timeout (ms)')
        .setDesc('1枚あたりのタイムアウト。生成は通常1〜3分。')
        .addText((text: TextComponent) =>
          text
            .setPlaceholder('300000')
            .setValue(String(this.plugin.settings.codexTimeoutMs))
            .onChange(async (value: string) => {
              const parsed = Number(value);
              if (Number.isFinite(parsed) && parsed >= 30000) {
                this.plugin.settings.codexTimeoutMs = parsed;
                await this.plugin.saveSettings();
              }
            })
        );

      new Setting(containerEl)
        .setName('Codex Keep Logs (詳細ログを保存)')
        .setDesc('OFF (推奨): 安定動作優先、ログは取れない。ON: 各生成の workDir に stdout/stderr を保存し、エラー時の診断に使えるが Obsidian がフリーズしやすくなる場合がある。トラブル時のみ ON にして再現させる用。')
        .addToggle((toggle) =>
          toggle
            .setValue(this.plugin.settings.codexKeepLogs)
            .onChange(async (value: boolean) => {
              this.plugin.settings.codexKeepLogs = value;
              await this.plugin.saveSettings();
            })
        );

      new Setting(containerEl)
        .setName('Codex CLI Login')
        .setDesc('ChatGPT アカウントでログイン。クリックするとブラウザが開いて OAuth 認証画面が表示されます。認証完了までボタンは無効化されます（最大5分）。')
        .addButton((button) =>
          button
            .setButtonText('ログイン')
            .onClick(async () => {
              button.setDisabled(true).setButtonText('ブラウザで認証中...');
              const progressNotice = new Notice('Codex login を起動しています...', 0);
              try {
                const result = await startCodexLogin(
                  this.plugin.settings,
                  (line) => {
                    progressNotice.setMessage(`Codex login: ${line.slice(0, 200)}`);
                  },
                );
                progressNotice.hide();
                new Notice(result.message, result.ok ? 7000 : 12000);
              } catch (error) {
                progressNotice.hide();
                new Notice(`ログイン失敗: ${error instanceof Error ? error.message : String(error)}`, 10000);
              } finally {
                button.setDisabled(false).setButtonText('ログイン');
              }
            })
        );

      new Setting(containerEl)
        .setName('Codex CLI 接続テスト')
        .setDesc('codex --version と codex login status を確認します。')
        .addButton((button) =>
          button
            .setButtonText('テスト実行')
            .onClick(async () => {
              button.setDisabled(true).setButtonText('テスト中...');
              try {
                const result = await testCodexConnection(this.plugin.settings);
                new Notice(result.message, result.ok ? 5000 : 10000);
              } catch (error) {
                new Notice(`テスト失敗: ${error instanceof Error ? error.message : String(error)}`, 10000);
              } finally {
                button.setDisabled(false).setButtonText('テスト実行');
              }
            })
        );
    }

    // デフォルト設定セクション
    containerEl.createEl('h3', { text: 'Default Settings' });

    new Setting(containerEl)
      .setName('Default Platform')
      .setDesc('Default platform for thumbnail generation')
      .addDropdown((dropdown: DropdownComponent) =>
        dropdown
          .addOption('youtube', 'YouTube')
          .addOption('note', 'note')
          .addOption('udemy', 'Udemy')
          .setValue(this.plugin.settings.defaultPlatform)
          .onChange(async (value: string) => {
            this.plugin.settings.defaultPlatform = value as Platform;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName('Default Style')
      .setDesc('Default design style')
      .addDropdown((dropdown: DropdownComponent) =>
        dropdown
          .addOption('modern', 'Modern / Clean')
          .addOption('bold', 'Bold / Impact')
          .addOption('minimal', 'Minimal')
          .addOption('gradient', 'Gradient')
          .addOption('photo', 'Photo-based')
          .addOption('illustration', 'Illustration')
          .setValue(this.plugin.settings.defaultStyle)
          .onChange(async (value: string) => {
            this.plugin.settings.defaultStyle = value as ImageStyle;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName('Language')
      .setDesc('Language for generated text')
      .addDropdown((dropdown: DropdownComponent) =>
        dropdown
          .addOption('ja', '日本語')
          .addOption('en', 'English')
          .setValue(this.plugin.settings.language)
          .onChange(async (value: string) => {
            this.plugin.settings.language = value as 'ja' | 'en';
            await this.plugin.saveSettings();
          })
      );

    // 保存設定セクション
    containerEl.createEl('h3', { text: 'Save Settings' });

    new Setting(containerEl)
      .setName('デフォルトの場所')
      .setDesc('サムネイル画像の保存先を選択')
      .addDropdown((dropdown: DropdownComponent) =>
        dropdown
          .addOption('vault', '保管庫直下')
          .addOption('specified', '以下で指定されたフォルダ')
          .setValue(this.plugin.settings.saveLocation)
          .onChange(async (value: string) => {
            this.plugin.settings.saveLocation = value as 'vault' | 'specified';
            await this.plugin.saveSettings();
            this.display(); // 設定画面を再描画
          })
      );

    // 指定フォルダ設定（saveLocationがspecifiedの場合のみ表示）
    if (this.plugin.settings.saveLocation === 'specified') {
      const folderSetting = new Setting(containerEl)
        .setName('指定フォルダ')
        .setDesc('このフォルダにサムネイル画像を保存します（入力するとフォルダ候補が表示されます）');

      folderSetting.addText((text: TextComponent) => {
        text
          .setPlaceholder('attachments/thumbnails')
          .setValue(this.plugin.settings.attachmentFolder)
          .onChange(async (value: string) => {
            this.plugin.settings.attachmentFolder = value;
            await this.plugin.saveSettings();
          });
        
        // フォルダサジェストを追加
        new FolderSuggest(this.app, text.inputEl);
      });
    }

    new Setting(containerEl)
      .setName('File Name Format')
      .setDesc('Format for saved file names. Available: {title}, {platform}, {timestamp}, {date}')
      .addText((text: TextComponent) =>
        text
          .setPlaceholder('{title}-{platform}-{timestamp}')
          .setValue(this.plugin.settings.fileNameFormat)
          .onChange(async (value: string) => {
            this.plugin.settings.fileNameFormat = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName('ノートに自動挿入')
      .setDesc('生成後、画像リンクをノートのトップに自動挿入します（OFFの場合はクリップボードにコピー）')
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.insertToNote)
          .onChange(async (value: boolean) => {
            this.plugin.settings.insertToNote = value;
            await this.plugin.saveSettings();
          })
      );

    // プロンプト設定セクション
    containerEl.createEl('h3', { text: 'Prompt Settings' });
    
    // 説明文を追加
    const promptDesc = containerEl.createEl('p');
    promptDesc.style.color = 'var(--text-muted)';
    promptDesc.style.fontSize = '12px';
    promptDesc.style.marginBottom = '15px';
    promptDesc.textContent = '※ここで設定した内容は全ての生成に常に適用されます。一時的な指示はモーダルの「追加指示」を使用してください。';

    new Setting(containerEl)
      .setName('Custom Prompt Prefix（文頭に追加）')
      .setDesc('例: 「ペーパークラフト風のデザインで、」「ダークモード向けの配色で、」')
      .addTextArea((textarea: TextAreaComponent) => {
        textarea
          .setPlaceholder('例: ペーパークラフト風のデザインで、')
          .setValue(this.plugin.settings.customPromptPrefix)
          .onChange(async (value: string) => {
            this.plugin.settings.customPromptPrefix = value;
            await this.plugin.saveSettings();
          });
        textarea.inputEl.style.width = '100%';
        textarea.inputEl.style.height = '80px';
      });

    new Setting(containerEl)
      .setName('Custom Prompt Suffix（文末に追加）')
      .setDesc('例: 「テキストは白色で大きく中央に配置」「背景はぼかしてください」')
      .addTextArea((textarea: TextAreaComponent) => {
        textarea
          .setPlaceholder('例: テキストは白色で大きく中央に配置してください')
          .setValue(this.plugin.settings.customPromptSuffix)
          .onChange(async (value: string) => {
            this.plugin.settings.customPromptSuffix = value;
            await this.plugin.saveSettings();
          });
        textarea.inputEl.style.width = '100%';
        textarea.inputEl.style.height = '80px';
      });

    // noteプラットフォーム専用設定セクション
    containerEl.createEl('h3', { text: 'note Platform Settings' });
    
    const noteDesc = containerEl.createEl('p');
    noteDesc.style.color = 'var(--text-muted)';
    noteDesc.style.fontSize = '12px';
    noteDesc.style.marginBottom = '15px';
    noteDesc.textContent = '※noteはYouTubeやUdemyより上下約50pxが切り取られて表示されます。セーフマージンを有効にすると、重要な要素が切り取られないよう上下に余白を確保します。';

    new Setting(containerEl)
      .setName('noteセーフマージン')
      .setDesc('noteのサムネイル生成時、上下に余白を確保してテキストや重要な要素が切り取られないようにします')
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.noteSafeMargin)
          .onChange(async (value: boolean) => {
            this.plugin.settings.noteSafeMargin = value;
            await this.plugin.saveSettings();
            this.display(); // 設定画面を再描画
          })
      );

    // セーフマージンが有効な場合のみサイズ設定を表示
    if (this.plugin.settings.noteSafeMargin) {
      new Setting(containerEl)
        .setName('セーフマージンサイズ')
        .setDesc('上下に確保する余白のサイズ（px）。デフォルト: 20px')
        .addText((text: TextComponent) =>
          text
            .setPlaceholder('20')
            .setValue(String(this.plugin.settings.noteSafeMarginSize))
            .onChange(async (value: string) => {
              const num = parseInt(value, 10);
              if (!isNaN(num) && num >= 0 && num <= 100) {
                this.plugin.settings.noteSafeMarginSize = num;
                await this.plugin.saveSettings();
              }
            })
        );
    }

    // プラットフォーム情報
    containerEl.createEl('h3', { text: 'Platform Information' });
    
    const infoEl = containerEl.createDiv('platform-info');
    infoEl.style.padding = '10px';
    infoEl.style.backgroundColor = 'var(--background-secondary)';
    infoEl.style.borderRadius = '5px';
    
    Object.entries(PLATFORM_CONFIGS).forEach(([key, config]) => {
      const p = infoEl.createEl('p');
      p.innerHTML = `<strong>${config.name}</strong>: ${config.width}x${config.height} (${config.aspectRatio})`;
    });
  }
}
