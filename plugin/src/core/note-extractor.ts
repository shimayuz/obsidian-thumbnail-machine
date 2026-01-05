/**
 * Note Extractor - ノートからサムネイル用情報を抽出
 */

import type { ExtractedNoteInfo } from '../types';

export class NoteExtractor {
  /**
   * ノートの内容からサムネイル生成に必要な情報を抽出
   */
  extract(content: string, fileName: string): ExtractedNoteInfo {
    const lines = content.split('\n');
    
    // タイトルを抽出（H1 または ファイル名）
    const title = this.extractTitle(lines, fileName);
    
    // サブタイトルを抽出（H2 または 最初の段落）
    const subtitle = this.extractSubtitle(lines);
    
    // キーワードを抽出（タグ、frontmatter、頻出単語）
    const keywords = this.extractKeywords(content);
    
    // サマリーを抽出（最初の段落）
    const summary = this.extractSummary(lines);

    return {
      title,
      subtitle,
      keywords,
      summary,
    };
  }

  private extractTitle(lines: string[], fileName: string): string {
    // frontmatter の title を探す
    const frontmatterTitle = this.extractFrontmatterValue(lines, 'title');
    if (frontmatterTitle && frontmatterTitle.trim()) {
      return frontmatterTitle.trim();
    }

    // H1 を探す
    for (const line of lines) {
      const h1Match = line.match(/^#\s+(.+)$/);
      if (h1Match && h1Match[1].trim()) {
        return h1Match[1].trim();
      }
    }

    // ファイル名をフォールバック（常に有効な値を返す）
    const cleanFileName = fileName.replace(/\.md$/, '').trim();
    return cleanFileName || 'Untitled';
  }

  private extractSubtitle(lines: string[]): string | undefined {
    // frontmatter の subtitle/description を探す
    const frontmatterSubtitle = this.extractFrontmatterValue(lines, 'subtitle') 
      || this.extractFrontmatterValue(lines, 'description');
    if (frontmatterSubtitle) {
      return frontmatterSubtitle;
    }

    // H2 を探す
    let foundH1 = false;
    for (const line of lines) {
      if (line.match(/^#\s+/)) {
        foundH1 = true;
        continue;
      }
      if (foundH1) {
        const h2Match = line.match(/^##\s+(.+)$/);
        if (h2Match) {
          return h2Match[1].trim();
        }
      }
    }

    return undefined;
  }

  private extractKeywords(content: string): string[] {
    const keywords: string[] = [];
    const lines = content.split('\n');

    // frontmatter の tags を探す
    const tagsValue = this.extractFrontmatterValue(lines, 'tags');
    if (tagsValue) {
      // YAML配列形式またはカンマ区切り
      const tags = tagsValue
        .replace(/[\[\]]/g, '')
        .split(/[,\s]+/)
        .map(t => t.trim())
        .filter(t => t.length > 0);
      keywords.push(...tags);
    }

    // インラインタグ (#tag) を探す
    const tagMatches = content.match(/#([a-zA-Z\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FFF]+)/g);
    if (tagMatches) {
      const inlineTags = tagMatches
        .map(t => t.slice(1))
        .filter(t => !['', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6'].includes(t.toLowerCase()));
      keywords.push(...inlineTags);
    }

    // 重複を除去して最大10個まで
    return [...new Set(keywords)].slice(0, 10);
  }

  private extractSummary(lines: string[]): string | undefined {
    let inFrontmatter = false;
    let frontmatterEnded = false;
    let foundH1 = false;

    for (const line of lines) {
      // frontmatter のスキップ
      if (line.trim() === '---') {
        if (!inFrontmatter) {
          inFrontmatter = true;
        } else {
          frontmatterEnded = true;
          inFrontmatter = false;
        }
        continue;
      }
      if (inFrontmatter) continue;

      // H1 をスキップ
      if (line.match(/^#\s+/)) {
        foundH1 = true;
        continue;
      }

      // 空行やヘッダーをスキップ
      if (line.trim() === '' || line.match(/^#+\s+/)) {
        continue;
      }

      // 最初の実質的な段落を返す
      const cleanLine = line
        .replace(/\*\*([^*]+)\*\*/g, '$1')  // bold
        .replace(/\*([^*]+)\*/g, '$1')       // italic
        .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')  // links
        .replace(/`([^`]+)`/g, '$1')         // inline code
        .trim();

      if (cleanLine.length > 10) {
        return cleanLine.slice(0, 200);
      }
    }

    return undefined;
  }

  private extractFrontmatterValue(lines: string[], key: string): string | null {
    let inFrontmatter = false;

    for (const line of lines) {
      if (line.trim() === '---') {
        if (!inFrontmatter) {
          inFrontmatter = true;
        } else {
          break;
        }
        continue;
      }

      if (inFrontmatter) {
        const match = line.match(new RegExp(`^${key}:\\s*(.+)$`, 'i'));
        if (match) {
          return match[1].trim().replace(/^["']|["']$/g, '');
        }
      }
    }

    return null;
  }
}
