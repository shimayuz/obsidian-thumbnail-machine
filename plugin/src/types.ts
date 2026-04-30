/**
 * Thumbnail Machine - 型定義
 */

/** プラットフォーム種別 */
export type Platform = 'youtube' | 'note' | 'udemy';

/** アスペクト比 */
export type AspectRatio = '16:9' | '1.91:1' | '1:1';

/** 画像スタイル */
export type ImageStyle = 
  | 'modern'      // モダン・クリーン
  | 'bold'        // 大胆・インパクト
  | 'minimal'     // ミニマル
  | 'gradient'    // グラデーション背景
  | 'photo'       // 写真ベース
  | 'illustration'; // イラスト風

/** 言語 */
export type Language = 'ja' | 'en';

/** プラットフォーム設定 */
export interface PlatformConfig {
  name: string;
  aspectRatio: AspectRatio;
  width: number;
  height: number;
  description: string;
}

/** プラットフォーム設定マップ */
export const PLATFORM_CONFIGS: Record<Platform, PlatformConfig> = {
  youtube: {
    name: 'YouTube',
    aspectRatio: '16:9',
    width: 1280,
    height: 720,
    description: 'YouTube動画サムネイル (1280x720)',
  },
  note: {
    name: 'note',
    aspectRatio: '1.91:1',
    width: 1280,
    height: 670,
    description: 'note記事アイキャッチ (1280x670)',
  },
  udemy: {
    name: 'Udemy',
    aspectRatio: '16:9',
    width: 1280,
    height: 720,
    description: 'Udemyコースサムネイル (1280x720)',
  },
};

/** 保存先の種類 */
export type SaveLocation = 'vault' | 'specified';

/** 画像生成プロバイダー */
export type ImageProvider = 'kie' | 'codex';

/** プラグイン設定 */
export interface PluginSettings {
  // プロバイダー選択
  imageProvider: ImageProvider;

  // kie.ai 設定
  kieApiKey: string;

  // Codex CLI 設定
  codexBinaryPath: string;   // 空文字なら PATH 解決
  codexTimeoutMs: number;    // プロセスタイムアウト (ms)
  codexKeepLogs: boolean;    // 詳細ログを保持 (ON時は workDir を削除せず stdout/stderr をファイルに書く)

  // デフォルト生成設定
  defaultPlatform: Platform;
  defaultStyle: ImageStyle;
  language: Language;

  // 保存設定
  saveLocation: SaveLocation;
  attachmentFolder: string;
  fileNameFormat: string; // {title}-{platform}-{timestamp}
  insertToNote: boolean; // ノートのトップに挿入するか

  // プロンプト設定
  customPromptPrefix: string;
  customPromptSuffix: string;

  // noteプラットフォーム専用設定
  noteSafeMargin: boolean; // noteの上下セーフマージンを有効にするか
  noteSafeMarginSize: number; // セーフマージンのサイズ（px）
}

/** デフォルト設定 */
export const DEFAULT_SETTINGS: PluginSettings = {
  imageProvider: 'kie',

  kieApiKey: '',

  codexBinaryPath: '',
  codexTimeoutMs: 300000, // 5分
  codexKeepLogs: false,

  defaultPlatform: 'youtube',
  defaultStyle: 'modern',
  language: 'ja',

  saveLocation: 'specified',
  attachmentFolder: 'attachments/thumbnails',
  fileNameFormat: '{title}-{platform}-{timestamp}',
  insertToNote: true,

  customPromptPrefix: '',
  customPromptSuffix: '',

  noteSafeMargin: true,
  noteSafeMarginSize: 20,
};

/** 参照画像データ */
export interface ReferenceImage {
  base64: string;
  mimeType: 'image/png' | 'image/jpeg' | 'image/webp';
  fileName: string;
}

/** サムネイル生成リクエスト */
export interface ThumbnailRequest {
  title: string;
  subtitle?: string;
  keywords?: string[];
  platform: Platform;
  style: ImageStyle;
  language: Language;
  customPrompt?: string;
  appealAxis?: AppealAxis;
  referenceImages?: ReferenceImage[]; // 最大2枚の参照画像
}

/** サムネイル生成結果 */
export interface ThumbnailResult {
  imageUrl: string;
  imageBase64?: string;
  prompt: string;
  platform: Platform;
  timestamp: number;
}

/** 生成進捗状態 */
export interface GenerationProgress {
  phase: 'preparing' | 'generating' | 'saving' | 'done' | 'error';
  message: string;
  progress?: number; // 0-100
}

/** ノートから抽出した情報 */
export interface ExtractedNoteInfo {
  title: string;
  subtitle?: string;
  keywords: string[];
  summary?: string;
}

/** 訴求軸の種類 */
export type AppealAxis = 
  | 'authority'      // 1. 権威性
  | 'emotion'        // 2. 感情
  | 'numbers'        // 3. 数字
  | 'problem'        // 4. 問題提起
  | 'beforeAfter'    // 5. ビフォーアフター
  | 'urgency'        // 6. 緊急性
  | 'limited'        // 7. 限定
  | 'empathy'        // 8. 共感
  | 'curiosity'      // 9. 好奇心
  | 'proof'          // 10. 証拠
  | 'story'          // 11. ストーリー
  | 'contrast'       // 12. 対比
  | 'simple'         // 13. シンプル
  | 'pop'            // 14. ポップ
  | 'mystery'        // 15. ミステリー
  | 'professional'   // 16. プロ
  | 'friendly'       // 17. 親近感
  | 'trend'          // 18. トレンド
  | 'contrarian'     // 19. 逆張り
  | 'achievement'    // 20. 実績
  | 'warning'        // 21. 警告
  | 'hope'           // 22. 希望
  | 'nostalgia'      // 23. ノスタルジー
  | 'future'         // 24. 未来
  | 'insight';       // 25. インサイト

/** 訴求軸の設定 */
export interface AppealAxisConfig {
  id: AppealAxis;
  name: string;
  nameEn: string;
  description: string;
  promptElements: string;
}

/** 25種類の訴求軸設定 */
export const APPEAL_AXIS_CONFIGS: AppealAxisConfig[] = [
  {
    id: 'authority',
    name: '権威性',
    nameEn: 'Authority',
    description: '専門家や実績をアピール',
    promptElements: 'professional design, gold accents, trust badges, dark blue gradient, certificate elements',
  },
  {
    id: 'emotion',
    name: '感情',
    nameEn: 'Emotion',
    description: '心に訴えかけるデザイン',
    promptElements: 'emotional impact, warm colors, soft lighting, heart elements, touching atmosphere',
  },
  {
    id: 'numbers',
    name: '数字',
    nameEn: 'Numbers',
    description: '具体的な数字で説得力',
    promptElements: 'bold numbers, statistics highlight, infographic style, data visualization, percentage elements',
  },
  {
    id: 'problem',
    name: '問題提起',
    nameEn: 'Problem',
    description: '課題を明確に提示',
    promptElements: 'question mark elements, thought-provoking, problem-solution layout, attention-grabbing',
  },
  {
    id: 'beforeAfter',
    name: 'ビフォーアフター',
    nameEn: 'Before/After',
    description: '変化を視覚的に表現',
    promptElements: 'split design, transformation visual, comparison layout, arrow elements, progress indicator',
  },
  {
    id: 'urgency',
    name: '緊急性',
    nameEn: 'Urgency',
    description: '今すぐ行動を促す',
    promptElements: 'red accents, timer elements, exclamation marks, bold urgent text, action-oriented',
  },
  {
    id: 'limited',
    name: '限定',
    nameEn: 'Limited',
    description: '希少性を強調',
    promptElements: 'exclusive badge, limited edition style, premium feel, scarcity elements, special offer design',
  },
  {
    id: 'empathy',
    name: '共感',
    nameEn: 'Empathy',
    description: '読者の気持ちに寄り添う',
    promptElements: 'relatable imagery, friendly atmosphere, understanding tone, connection elements, supportive feel',
  },
  {
    id: 'curiosity',
    name: '好奇心',
    nameEn: 'Curiosity',
    description: '「気になる」を刺激',
    promptElements: 'mysterious elements, question hooks, intriguing visuals, discovery theme, hidden reveal style',
  },
  {
    id: 'proof',
    name: '証拠',
    nameEn: 'Proof',
    description: '実証・データで信頼性',
    promptElements: 'testimonial style, verified badge, data charts, evidence-based design, credibility elements',
  },
  {
    id: 'story',
    name: 'ストーリー',
    nameEn: 'Story',
    description: '物語性で引き込む',
    promptElements: 'narrative visual, journey theme, chapter style, storytelling elements, cinematic feel',
  },
  {
    id: 'contrast',
    name: '対比',
    nameEn: 'Contrast',
    description: '違いを明確に表現',
    promptElements: 'high contrast design, vs layout, comparison elements, dual color scheme, opposing visuals',
  },
  {
    id: 'simple',
    name: 'シンプル',
    nameEn: 'Simple',
    description: 'シンプルで明快',
    promptElements: 'minimalist design, clean layout, white space, simple typography, uncluttered',
  },
  {
    id: 'pop',
    name: 'ポップ',
    nameEn: 'Pop',
    description: 'カラフルで目を引く',
    promptElements: 'vibrant colors, playful design, fun elements, energetic style, bold graphics',
  },
  {
    id: 'mystery',
    name: 'ミステリー',
    nameEn: 'Mystery',
    description: '謎めいた雰囲気',
    promptElements: 'dark mysterious atmosphere, shadow elements, enigmatic design, suspense feel, hidden secrets',
  },
  {
    id: 'professional',
    name: 'プロ',
    nameEn: 'Professional',
    description: 'プロフェッショナル感',
    promptElements: 'corporate style, business professional, sleek design, sophisticated layout, executive feel',
  },
  {
    id: 'friendly',
    name: '親近感',
    nameEn: 'Friendly',
    description: '親しみやすい印象',
    promptElements: 'approachable design, warm friendly colors, casual style, welcoming atmosphere, smile elements',
  },
  {
    id: 'trend',
    name: 'トレンド',
    nameEn: 'Trend',
    description: '最新トレンド感',
    promptElements: 'trendy modern design, current style, viral aesthetic, social media style, contemporary look',
  },
  {
    id: 'contrarian',
    name: '逆張り',
    nameEn: 'Contrarian',
    description: '常識を覆すインパクト',
    promptElements: 'disruptive design, unconventional layout, bold statement, rule-breaking style, provocative',
  },
  {
    id: 'achievement',
    name: '実績',
    nameEn: 'Achievement',
    description: '実績・成果をアピール',
    promptElements: 'trophy elements, success indicators, achievement badges, results showcase, winner style',
  },
  {
    id: 'warning',
    name: '警告',
    nameEn: 'Warning',
    description: '注意を喚起',
    promptElements: 'warning signs, caution elements, alert style, danger indicators, attention-grabbing red',
  },
  {
    id: 'hope',
    name: '希望',
    nameEn: 'Hope',
    description: '希望・明るい未来',
    promptElements: 'bright hopeful colors, sunrise elements, optimistic design, light rays, positive atmosphere',
  },
  {
    id: 'nostalgia',
    name: 'ノスタルジー',
    nameEn: 'Nostalgia',
    description: '懐かしさを喚起',
    promptElements: 'retro style, vintage elements, nostalgic colors, classic design, memory-evoking',
  },
  {
    id: 'future',
    name: '未来',
    nameEn: 'Future',
    description: '未来志向・先進性',
    promptElements: 'futuristic design, tech elements, innovative style, forward-looking, sci-fi aesthetic',
  },
  {
    id: 'insight',
    name: 'インサイト',
    nameEn: 'Insight',
    description: '深い洞察を提供',
    promptElements: 'lightbulb elements, wisdom theme, deep thinking visual, enlightenment style, knowledge symbols',
  },
];
