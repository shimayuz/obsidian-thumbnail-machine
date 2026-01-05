/**
 * Image Saver - 生成した画像をVaultに保存
 */

import { App, TFile, TFolder, normalizePath } from 'obsidian';
import type { PluginSettings, ThumbnailResult, Platform } from '../types';

export class ImageSaver {
  constructor(
    private app: App,
    private settings: PluginSettings
  ) {}

  /**
   * 画像をVaultに保存
   */
  async save(
    result: ThumbnailResult,
    noteTitle: string
  ): Promise<string> {
    // 保存先フォルダを決定
    const folderPath = this.getSaveFolder();
    
    // 保存先フォルダを確保
    await this.ensureFolder(folderPath);

    // ファイル名を生成
    const fileName = this.generateFileName(noteTitle, result.platform, result.timestamp);
    const filePath = normalizePath(`${folderPath}/${fileName}`);

    // Base64 から ArrayBuffer に変換
    if (!result.imageBase64) {
      throw new Error('No image data to save');
    }
    const binary = atob(result.imageBase64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }

    // ファイルを作成
    await this.app.vault.createBinary(filePath, bytes.buffer);

    return filePath;
  }

  /**
   * ファイル名を生成
   */
  private generateFileName(title: string, platform: Platform, timestamp: number): string {
    const sanitizedTitle = this.sanitizeFileName(title);
    const date = new Date(timestamp);
    const dateStr = date.toISOString().slice(0, 10).replace(/-/g, '');
    const timeStr = date.toISOString().slice(11, 19).replace(/:/g, '');

    let fileName = this.settings.fileNameFormat
      .replace('{title}', sanitizedTitle)
      .replace('{platform}', platform)
      .replace('{timestamp}', `${dateStr}-${timeStr}`)
      .replace('{date}', dateStr);

    return `${fileName}.png`;
  }

  /**
   * ファイル名をサニタイズ
   */
  private sanitizeFileName(name: string): string {
    return name
      .replace(/[\\/:*?"<>|]/g, '_')
      .replace(/\s+/g, '-')
      .slice(0, 50);
  }

  /**
   * 保存先フォルダを取得
   */
  private getSaveFolder(): string {
    if (this.settings.saveLocation === 'vault') {
      return ''; // Vault直下
    }
    return this.settings.attachmentFolder;
  }

  /**
   * フォルダが存在することを確認し、なければ作成
   */
  private async ensureFolder(folderPath: string): Promise<void> {
    if (!folderPath) return; // Vault直下の場合はスキップ
    
    const normalizedPath = normalizePath(folderPath);
    const folder = this.app.vault.getAbstractFileByPath(normalizedPath);
    
    if (!folder) {
      await this.app.vault.createFolder(normalizedPath);
    }
  }

  /**
   * 保存した画像のMarkdownリンクを生成
   */
  generateMarkdownLink(filePath: string, altText?: string): string {
    const alt = altText || 'Thumbnail';
    return `![${alt}](${filePath})`;
  }

  /**
   * 保存した画像のWikiリンクを生成
   */
  generateWikiLink(filePath: string): string {
    const fileName = filePath.split('/').pop() || filePath;
    return `![[${fileName}]]`;
  }
}
