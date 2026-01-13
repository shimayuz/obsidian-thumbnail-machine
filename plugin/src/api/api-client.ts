/**
 * API Client - KIE API (kie.ai) を使用した画像生成
 * kie.aiは非同期生成のため、タスク作成→ポーリングの形式
 */

import { requestUrl } from 'obsidian';
import type { PluginSettings, ThumbnailRequest, ThumbnailResult, Platform } from '../types';
import { PLATFORM_CONFIGS as platformConfigs, APPEAL_AXIS_CONFIGS } from '../types';

export interface ApiClient {
  generateThumbnail(request: ThumbnailRequest): Promise<ThumbnailResult>;
}

/**
 * KIE API クライアント (kie.ai - nano-banana-pro モデル)
 */
export class KieApiClient implements ApiClient {
  constructor(private settings: PluginSettings) {}

  async generateThumbnail(request: ThumbnailRequest): Promise<ThumbnailResult> {
    const prompt = this.buildPrompt(request);
    const config = platformConfigs[request.platform];
    
    // アスペクト比をkie.ai形式に変換
    const aspectRatio = this.convertAspectRatio(config.aspectRatio);
    
    console.log('🎨 kie.ai: Creating image task...');
    
    // 参照画像をアップロードしてURLを取得
    const imageUrls: string[] = [];
    if (request.referenceImages && request.referenceImages.length > 0) {
      console.log(`🎨 kie.ai: Uploading ${request.referenceImages.length} reference image(s)...`);
      for (const img of request.referenceImages) {
        try {
          const uploadedUrl = await this.uploadImage(img.base64, img.mimeType, img.fileName);
          imageUrls.push(uploadedUrl);
          console.log(`🎨 kie.ai: Uploaded image: ${uploadedUrl}`);
        } catch (error) {
          console.error(`🎨 kie.ai: Failed to upload image ${img.fileName}:`, error);
          throw new Error(`Failed to upload reference image: ${img.fileName}`);
        }
      }
      console.log(`🎨 kie.ai: Using ${imageUrls.length} reference image(s)`);
    }
    
    // 1. タスク作成
    const requestBody: any = {
      model: 'nano-banana-pro',
      input: {
        prompt: prompt,
        aspect_ratio: aspectRatio,
        resolution: '1K',
        output_format: 'png'
      }
    };
    
    // 参照画像がある場合はimage_urlsを追加
    if (imageUrls.length > 0) {
      requestBody.input.image_urls = imageUrls;
    }
    
    const createResponse = await requestUrl({
      url: 'https://api.kie.ai/api/v1/jobs/createTask',
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.settings.kieApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody)
    });

    if (createResponse.status >= 400) {
      console.error('🎨 kie.ai: API error response:', createResponse.json);
      throw new Error(`kie.ai API error: ${createResponse.status} - ${JSON.stringify(createResponse.json)}`);
    }

    const taskData = createResponse.json as any;
    console.log('🎨 kie.ai: Task response:', JSON.stringify(taskData));
    
    const jobId = taskData.data?.taskId || taskData.taskId;

    if (!jobId) {
      console.error('🎨 kie.ai: No taskId in response:', taskData);
      throw new Error(`No taskId in response: ${JSON.stringify(taskData)}`);
    }

    console.log('🎨 kie.ai: Task created, polling for result...');

    // 2. ポーリング
    let attempts = 0;
    const maxAttempts = 60; // 最大5分

    // 最初のポーリングまで少し待機
    await new Promise(resolve => setTimeout(resolve, 2000));

    while (attempts < maxAttempts) {
      await new Promise(resolve => setTimeout(resolve, 5000)); // 5秒待機

      const statusUrl = `https://api.kie.ai/api/v1/jobs/recordInfo?taskId=${jobId}`;
      
      const statusResponse = await requestUrl({
        url: statusUrl,
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${this.settings.kieApiKey}`,
        }
      });
      
      if (statusResponse.status >= 400) {
        throw new Error(`Failed to check status: ${statusResponse.status}`);
      }
      
      const statusData = statusResponse.json as any;
      
      // state: waiting, queuing, generating, success, fail
      if (statusData.code === 200 && statusData.data?.state === 'success') {
        let resultUrls: string[] = [];
        if (statusData.data?.resultJson) {
          try {
            const resultData = JSON.parse(statusData.data.resultJson);
            resultUrls = resultData.resultUrls || [];
          } catch (e) {
            console.error('Failed to parse resultJson:', e);
          }
        }
        
        if (resultUrls.length > 0) {
          // 画像ダウンロード
          const imageResponse = await requestUrl({
            url: resultUrls[0],
            method: 'GET',
          });

          if (imageResponse.status >= 400) {
            throw new Error(`Failed to download image: ${imageResponse.status}`);
          }

          console.log('✅ kie.ai: Image generated successfully');
          
          // ArrayBufferをBase64に変換
          const base64 = this.arrayBufferToBase64(imageResponse.arrayBuffer);
          
          return {
            imageBase64: base64,
            imageUrl: resultUrls[0],
            prompt: prompt,
            platform: request.platform,
            timestamp: Date.now(),
          };
        }
      }

      if (statusData.data?.state === 'fail') {
        console.error('❌ kie.ai: Image generation failed');
        throw new Error(`Image generation failed: ${statusData.data?.failMsg || 'Unknown error'}`);
      }

      attempts++;
      console.log(`🎨 kie.ai: Generating... (${attempts}/${maxAttempts})`);
    }

    throw new Error('Image generation timed out');
  }

  /**
   * 画像をkie.aiにアップロードしてURLを取得
   */
  private async uploadImage(base64: string, mimeType: string, fileName: string): Promise<string> {
    const dataUri = `data:${mimeType};base64,${base64}`;
    
    const response = await requestUrl({
      url: 'https://kieai.redpandaai.co/api/file-base64-upload',
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.settings.kieApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        base64Data: dataUri,
        uploadPath: 'thumbnail-machine',
        fileName: fileName,
      })
    });

    if (response.status >= 400) {
      console.error('🎨 kie.ai: Upload error response:', response.json);
      throw new Error(`Failed to upload image: ${response.status}`);
    }

    const data = response.json as any;
    console.log('🎨 kie.ai: Upload response:', JSON.stringify(data));
    
    // レスポンスからdownloadUrlを取得
    const fileUrl = data.data?.downloadUrl || data.data?.url || data.downloadUrl;
    if (!fileUrl) {
      throw new Error(`No URL in upload response: ${JSON.stringify(data)}`);
    }

    return fileUrl;
  }

  /**
   * アスペクト比をkie.ai形式に変換
   */
  private convertAspectRatio(aspectRatio: string): string {
    switch (aspectRatio) {
      case '16:9':
        return '16:9';
      case '1.91:1':
        return '16:9'; // 近似値
      case '1:1':
        return '1:1';
      default:
        return '16:9';
    }
  }

  /**
   * ArrayBufferをBase64文字列に変換
   */
  private arrayBufferToBase64(buffer: ArrayBuffer): string {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }

  private buildPrompt(request: ThumbnailRequest): string {
    const config = platformConfigs[request.platform];
    
    // 訴求軸が指定されている場合は専用プロンプトを生成
    if (request.appealAxis) {
      return this.buildAppealAxisPrompt(request);
    }

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
    
    // noteプラットフォーム用のセーフマージン指示
    if (request.platform === 'note' && this.settings.noteSafeMargin) {
      const margin = this.settings.noteSafeMarginSize || 20;
      prompt += `IMPORTANT: Keep the top and bottom ${margin}px of the image empty (no text, no important elements). This is a safe margin area that may be cropped when displayed.\n`;
    }

    if (this.settings.customPromptPrefix) {
      prompt = this.settings.customPromptPrefix + '\n' + prompt;
    }
    if (this.settings.customPromptSuffix) {
      prompt += '\n' + this.settings.customPromptSuffix;
    }
    if (request.customPrompt) {
      prompt += '\n' + request.customPrompt;
    }

    return prompt;
  }

  /**
   * 訴求軸に基づいたプロンプトを生成
   */
  private buildAppealAxisPrompt(request: ThumbnailRequest): string {
    const axisConfig = APPEAL_AXIS_CONFIGS.find(c => c.id === request.appealAxis);
    if (!axisConfig) {
      throw new Error(`Unknown appeal axis: ${request.appealAxis}`);
    }

    const config = platformConfigs[request.platform];
    
    // YouTubeサムネ風note表紙用のプロンプトフォーマット
    let prompt = `YouTube thumbnail, professional design, `;
    prompt += `${axisConfig.promptElements}, `;
    prompt += `Japanese text "${request.title}", `;
    
    if (request.subtitle) {
      prompt += `subtitle "${request.subtitle}", `;
    }
    
    if (request.keywords && request.keywords.length > 0) {
      prompt += `themes: ${request.keywords.join(', ')}, `;
    }

    // アスペクト比を追加
    prompt += `--ar ${config.aspectRatio === '1.91:1' ? '16:9' : config.aspectRatio} --v 6`;
    
    // noteプラットフォーム用のセーフマージン指示
    if (request.platform === 'note' && this.settings.noteSafeMargin) {
      const margin = this.settings.noteSafeMarginSize || 20;
      prompt += `, keep top and bottom ${margin}px empty as safe margin`;
    }

    if (this.settings.customPromptPrefix) {
      prompt = this.settings.customPromptPrefix + '\n' + prompt;
    }
    if (this.settings.customPromptSuffix) {
      prompt += '\n' + this.settings.customPromptSuffix;
    }
    if (request.customPrompt) {
      prompt += '\n' + request.customPrompt;
    }

    return prompt;
  }
}

/**
 * API クライアントファクトリ
 */
export function createApiClient(settings: PluginSettings): ApiClient {
  if (settings.kieApiKey) {
    return new KieApiClient(settings);
  }
  throw new Error('KIE API key not configured. Please set KIE API key in settings.');
}
