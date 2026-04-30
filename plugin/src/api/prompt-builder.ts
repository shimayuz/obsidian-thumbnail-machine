/**
 * Prompt Builder - 画像生成プロンプトのビルド処理
 * Provider 非依存で、KieApiClient / CodexCliApiClient 双方から利用される。
 */

import type { PluginSettings, Platform, ThumbnailRequest } from '../types';
import { PLATFORM_CONFIGS, APPEAL_AXIS_CONFIGS } from '../types';

/**
 * 通常プロンプト生成 (style + 訴求軸なし)
 */
function buildStandardPrompt(
  request: ThumbnailRequest,
  settings: Readonly<PluginSettings>,
): string {
  const config = PLATFORM_CONFIGS[request.platform];

  const styleDescriptions: Record<string, string> = {
    modern: 'clean, modern design with professional typography',
    bold: 'bold, eye-catching design with strong contrast and impact',
    minimal: 'minimalist design with lots of white space',
    gradient: 'vibrant gradient background with modern aesthetics',
    photo: 'photo-realistic background with text overlay',
    illustration: 'illustrated style with creative graphics',
  };

  const platformPrompts: Record<Platform, string> = {
    youtube: 'YouTube video thumbnail that grabs attention and encourages clicks',
    note: 'note.com article eye-catch image that is elegant and readable',
    udemy: 'Udemy course thumbnail that looks professional and educational',
  };

  let prompt = `Create a ${platformPrompts[request.platform]}.\n`;
  prompt += `Style: ${styleDescriptions[request.style]}\n`;
  prompt += `Title text: "${request.title}"${request.language === 'ja' ? ' (in Japanese)' : ''}\n`;

  if (request.subtitle) {
    prompt += `Subtitle: "${request.subtitle}"\n`;
  }

  if (request.keywords && request.keywords.length > 0) {
    prompt += `Keywords/themes: ${request.keywords.join(', ')}\n`;
  }

  prompt += `Size: ${config.width}x${config.height} pixels (${config.aspectRatio} aspect ratio)\n`;
  prompt += `The text should be clearly readable and be the main focus.\n`;
  prompt += `Do not include any watermarks or logos.\n`;

  if (request.platform === 'note' && settings.noteSafeMargin) {
    const margin = settings.noteSafeMarginSize || 20;
    prompt += `IMPORTANT: Keep the top and bottom ${margin}px of the image empty (no text, no important elements). This is a safe margin area that may be cropped when displayed.\n`;
  }

  return applyCustomPrompts(prompt, settings, request);
}

/**
 * 訴求軸プロンプト生成
 */
function buildAppealAxisPrompt(
  request: ThumbnailRequest,
  settings: Readonly<PluginSettings>,
): string {
  const axisConfig = APPEAL_AXIS_CONFIGS.find((c) => c.id === request.appealAxis);
  if (!axisConfig) {
    throw new Error(`Unknown appeal axis: ${request.appealAxis}`);
  }

  const config = PLATFORM_CONFIGS[request.platform];

  let prompt = `YouTube thumbnail, professional design, `;
  prompt += `${axisConfig.promptElements}, `;
  prompt += `Japanese text "${request.title}", `;

  if (request.subtitle) {
    prompt += `subtitle "${request.subtitle}", `;
  }

  if (request.keywords && request.keywords.length > 0) {
    prompt += `themes: ${request.keywords.join(', ')}, `;
  }

  prompt += `--ar ${config.aspectRatio === '1.91:1' ? '16:9' : config.aspectRatio} --v 6`;

  if (request.platform === 'note' && settings.noteSafeMargin) {
    const margin = settings.noteSafeMarginSize || 20;
    prompt += `, keep top and bottom ${margin}px empty as safe margin`;
  }

  return applyCustomPrompts(prompt, settings, request);
}

/**
 * カスタムプロンプト (Prefix / Suffix / customPrompt) を適用
 */
function applyCustomPrompts(
  base: string,
  settings: Readonly<PluginSettings>,
  request: ThumbnailRequest,
): string {
  let prompt = base;
  if (settings.customPromptPrefix) {
    prompt = settings.customPromptPrefix + '\n' + prompt;
  }
  if (settings.customPromptSuffix) {
    prompt += '\n' + settings.customPromptSuffix;
  }
  if (request.customPrompt) {
    prompt += '\n' + request.customPrompt;
  }
  return prompt;
}

/**
 * リクエストから生成プロンプトを組み立てる (公開API)
 */
export function buildPrompt(
  request: ThumbnailRequest,
  settings: Readonly<PluginSettings>,
): string {
  if (request.appealAxis) {
    return buildAppealAxisPrompt(request, settings);
  }
  return buildStandardPrompt(request, settings);
}
