/**
 * Codex CLI API Client
 *
 * OpenAI Codex CLI を子プロセスとして起動し、ChatGPTサブスク認証経由で画像生成する。
 * 認証は事前に `codex login` 済みであることが前提。
 *
 * 内部的には Codex CLI の built-in `image_gen` ツール (imagegen skill) が呼ばれる。
 * `OPENAI_API_KEY` は不要。
 *
 * 注意: Node.js API (child_process / fs / path / os) を使うため Desktop 専用。
 */

import { Platform } from 'obsidian';
import type { ApiClient } from './api-client';
import type { PluginSettings, ThumbnailRequest, ThumbnailResult } from '../types';
// 型のみ参照するインターフェースは type-only import で循環参照を避ける
import { PLATFORM_CONFIGS } from '../types';
import { buildPrompt } from './prompt-builder';

// Node.js builtin modules (esbuild は builtin-modules で external 指定済み)
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { spawn } from 'child_process';

const REFERENCE_FILENAMES = ['ref-1.png', 'ref-2.png'] as const;
const OUTPUT_FILENAME = 'output.png';

interface SpawnResult {
  exitCode: number | null;
  signal: NodeJS.Signals | null;
  stdout: string;
  stderr: string;
  timedOut: boolean;
}

/**
 * codex exec は stdout/stderr に skill 仕様や生成プロセスを大量 (数十〜数百KB) 吐く。
 * 全部累積すると renderer メモリを圧迫して Obsidian が真っ白になるため
 * 直近 N バイトだけ保持するリングバッファ。
 */
const MAX_BUFFER_BYTES = 64 * 1024;

function appendBounded(current: string, chunk: string): string {
  const next = current + chunk;
  if (next.length <= MAX_BUFFER_BYTES) return next;
  return next.slice(next.length - MAX_BUFFER_BYTES);
}

export class CodexCliApiClient implements ApiClient {
  constructor(private readonly settings: Readonly<PluginSettings>) {}

  async generateThumbnail(request: ThumbnailRequest): Promise<ThumbnailResult> {
    if (Platform.isMobile) {
      throw new Error('Codex CLI provider はデスクトップ版 Obsidian でのみ利用できます。');
    }

    const prompt = buildPrompt(request, this.settings);
    const workDir = await this.createWorkDir();

    try {
      const refPaths = await this.writeReferenceImages(workDir, request.referenceImages);
      const outputPath = path.join(workDir, OUTPUT_FILENAME);
      const codexPrompt = this.buildCodexPrompt(prompt, request, outputPath);
      const args = this.buildSpawnArgs(workDir, refPaths, codexPrompt);

      const binary = await this.resolveBinary();
      const result = await this.runCodex(binary, args, workDir);

      if (result.timedOut) {
        throw new Error(
          `Codex CLI がタイムアウトしました (${this.settings.codexTimeoutMs}ms)。`,
        );
      }
      if (result.exitCode !== 0) {
        const tail = result.stderr.split('\n').slice(-20).join('\n');
        throw new Error(
          `Codex CLI がエラー終了しました (exit ${result.exitCode}). stderr 末尾:\n${tail}`,
        );
      }

      if (!fs.existsSync(outputPath)) {
        const tail = result.stdout.split('\n').slice(-20).join('\n');
        throw new Error(
          `Codex は完了しましたが出力ファイル ${outputPath} が見つかりません。stdout 末尾:\n${tail}`,
        );
      }

      const buffer = await fs.promises.readFile(outputPath);
      const imageBase64 = buffer.toString('base64');

      return {
        imageUrl: '',
        imageBase64,
        prompt,
        platform: request.platform,
        timestamp: Date.now(),
      };
    } finally {
      await this.cleanup(workDir);
    }
  }

  private buildCodexPrompt(
    userPrompt: string,
    request: ThumbnailRequest,
    outputPath: string,
  ): string {
    const config = PLATFORM_CONFIGS[request.platform];
    const targetSize = `${config.width}x${config.height}`;

    return [
      'あなたは imagegen skill を使って画像を生成するアシスタントです。',
      '以下の手順を必ず実行してください:',
      `1. imagegen skill (built-in image_gen tool) を使って画像を生成する`,
      `2. 生成画像を最終的に正確に ${targetSize} ピクセルの PNG にリサイズし、絶対パス \`${outputPath}\` にコピー or 移動する`,
      '3. 出力ファイルが存在することを確認したら完了報告のみ行う',
      '',
      '生成プロンプト:',
      '----',
      userPrompt,
      '----',
      '',
      `出力先 (必ずこのパスに最終 PNG を配置): ${outputPath}`,
      `アスペクト比: ${config.aspectRatio}`,
      'リサイズ時はアスペクト比を保ったまま中央クロップ可。透明背景は不要。',
      'ファイル配置以外の追加作業 (リポジトリ編集, ドキュメント作成等) は行わないでください。',
    ].join('\n');
  }

  private buildSpawnArgs(workDir: string, refPaths: string[], prompt: string): string[] {
    const args = [
      'exec',
      '--full-auto',
      '--skip-git-repo-check',
      '--cd',
      workDir,
      '--add-dir',
      workDir,
    ];

    for (const refPath of refPaths) {
      args.push('-i', refPath);
    }

    args.push(prompt);
    return args;
  }

  private async resolveBinary(): Promise<string> {
    return resolveBinaryFromSettings(this.settings);
  }

  private async createWorkDir(): Promise<string> {
    const base = path.join(os.tmpdir(), `thumbnail-machine-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`);
    await fs.promises.mkdir(base, { recursive: true });
    return base;
  }

  private async writeReferenceImages(
    workDir: string,
    refs: ThumbnailRequest['referenceImages'],
  ): Promise<string[]> {
    if (!refs || refs.length === 0) {
      return [];
    }
    const out: string[] = [];
    for (let i = 0; i < refs.length && i < REFERENCE_FILENAMES.length; i++) {
      const ref = refs[i];
      const filePath = path.join(workDir, REFERENCE_FILENAMES[i]);
      const buffer = Buffer.from(ref.base64, 'base64');
      await fs.promises.writeFile(filePath, buffer);
      out.push(filePath);
    }
    return out;
  }

  private async cleanup(workDir: string): Promise<void> {
    try {
      await fs.promises.rm(workDir, { recursive: true, force: true });
    } catch (error) {
      console.debug('🎨 codex: failed to cleanup work dir', workDir, error);
    }
  }

  /**
   * 画像生成時の codex 実行。
   *
   * - stdio を完全 'ignore' にして renderer のイベントループを子プロセスから切り離す
   *   (codex exec は数百KB〜数MB のログを吐くため、'pipe' でも 'fd リダイレクト' でも
   *   renderer に何らかのオーバーヘッドが残る可能性があるため最も極端な策を取る)
   * - detached: true + unref() で renderer のサブプロセスツリーから完全に独立させる
   * - 終了は 'close' イベントで検知 (unref しても 'close' は発火する)
   * - 結果として exit code とタイムアウトの有無のみが取得できる。診断ログは諦める。
   */
  private async runCodex(
    binary: string,
    args: string[],
    cwd: string,
  ): Promise<SpawnResult> {
    return new Promise<SpawnResult>((resolve) => {
      let child: ReturnType<typeof spawn> | null = null;
      try {
        const { cmd, finalArgs } = adjustLaunch(binary, args);
        child = spawn(cmd, finalArgs, {
          cwd,
          env: buildLaunchEnv(),
          stdio: ['ignore', 'ignore', 'ignore'],
          detached: true,
        });
        child.unref();
      } catch (err) {
        resolve({
          exitCode: null,
          signal: null,
          stdout: '',
          stderr: `[spawn error] ${err instanceof Error ? err.message : String(err)}`,
          timedOut: false,
        });
        return;
      }

      let timedOut = false;
      const timer = setTimeout(() => {
        timedOut = true;
        child!.kill('SIGTERM');
        setTimeout(() => {
          if (child && !child.killed) child.kill('SIGKILL');
        }, 5000);
      }, this.settings.codexTimeoutMs);

      child.on('error', (err) => {
        clearTimeout(timer);
        resolve({
          exitCode: null,
          signal: null,
          stdout: '',
          stderr: `[spawn error] ${err.message}`,
          timedOut,
        });
      });

      child.on('close', (code, signal) => {
        clearTimeout(timer);
        resolve({ exitCode: code, signal, stdout: '', stderr: '', timedOut });
      });
    });
  }
}

/**
 * 子プロセスとして codex を起動して結果を待つ共通実装
 */
function runCodexProcess(
  binary: string,
  args: string[],
  cwd: string,
  timeoutMs: number,
): Promise<SpawnResult> {
  return new Promise((resolve) => {
    const { cmd, finalArgs } = adjustLaunch(binary, args);
    const child = spawn(cmd, finalArgs, {
      cwd,
      env: buildLaunchEnv(),
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';
    let timedOut = false;

    child.stdout?.on('data', (chunk: Buffer) => {
      stdout = appendBounded(stdout, chunk.toString('utf8'));
    });
    child.stderr?.on('data', (chunk: Buffer) => {
      stderr = appendBounded(stderr, chunk.toString('utf8'));
    });

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGTERM');
      setTimeout(() => {
        if (!child.killed) {
          child.kill('SIGKILL');
        }
      }, 5000);
    }, timeoutMs);

    child.on('error', (err) => {
      clearTimeout(timer);
      stderr = appendBounded(stderr, `\n[spawn error] ${err.message}`);
      resolve({ exitCode: null, signal: null, stdout, stderr, timedOut });
    });

    child.on('close', (code, signal) => {
      clearTimeout(timer);
      resolve({ exitCode: code, signal, stdout, stderr, timedOut });
    });
  });
}

/**
 * GUI 起動された Obsidian の PATH には `/usr/local/bin` 等が含まれず、
 * codex の shebang `#!/usr/bin/env node` が node を見つけられないことがある
 * (`env: node: No such file or directory` / exit 127)。
 * Node が置かれている代表的なパスを補強した env を返す。
 */
function buildLaunchEnv(): NodeJS.ProcessEnv {
  const extras = [
    path.join(os.homedir(), '.npm-global', 'bin'),
    '/opt/homebrew/bin',
    '/usr/local/bin',
    '/usr/bin',
    '/bin',
    '/usr/sbin',
    '/sbin',
  ];
  const current = (process.env.PATH || '').split(':').filter(Boolean);
  const seen = new Set<string>();
  const merged: string[] = [];
  for (const p of [...extras, ...current]) {
    if (!seen.has(p)) {
      seen.add(p);
      merged.push(p);
    }
  }
  return { ...process.env, PATH: merged.join(':') };
}

function resolveBinaryFromSettings(settings: Readonly<PluginSettings>): string {
  if (settings.codexBinaryPath) {
    if (!fs.existsSync(settings.codexBinaryPath)) {
      throw new Error(
        `設定された codex バイナリパスが見つかりません: ${settings.codexBinaryPath}`,
      );
    }
    return settings.codexBinaryPath;
  }
  const candidates = [
    path.join(os.homedir(), '.npm-global', 'bin', 'codex'),
    '/opt/homebrew/bin/codex',
    '/usr/local/bin/codex',
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }
  return 'codex';
}

/**
 * Apple Silicon Mac判定。
 * Obsidian Electron が x64 として起動している場合 (Rosetta or Universal binary の x64 slice)
 * spawn された Node が `process.arch === 'x64'` となり、codex は darwin-x64 binary を要求するが、
 * 通常 arm64 binary しかインストールされていないため `Missing optional dependency` で fail する。
 * 物理的に Apple Silicon なら `/usr/bin/arch -arm64` で起動して arm64 slice を強制する。
 */
function isAppleSiliconMac(): boolean {
  if (process.platform !== 'darwin') return false;
  const cpus = os.cpus();
  return cpus.length > 0 && /Apple/.test(cpus[0].model);
}

/**
 * 必要なら `/usr/bin/arch -arm64` で wrap してアーキを強制する。
 *
 * - Apple Silicon Mac でかつ現在の Node が arm64 でない (=x64 slice or Rosetta) → arch -arm64 経由
 * - それ以外 (Intel Mac, Linux, Windows, ネイティブ arm64 Node) → そのまま
 */
function adjustLaunch(binary: string, args: string[]): { cmd: string; finalArgs: string[] } {
  if (isAppleSiliconMac() && process.arch !== 'arm64' && fs.existsSync('/usr/bin/arch')) {
    return { cmd: '/usr/bin/arch', finalArgs: ['-arm64', binary, ...args] };
  }
  return { cmd: binary, finalArgs: args };
}

/**
 * 設定タブから呼ぶ簡易接続テスト
 */
export async function testCodexConnection(
  settings: Readonly<PluginSettings>,
): Promise<{ ok: boolean; message: string }> {
  if (Platform.isMobile) {
    return { ok: false, message: 'モバイル版 Obsidian では Codex CLI は使用できません。' };
  }

  let binary: string;
  try {
    binary = resolveBinaryFromSettings(settings);
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : String(error) };
  }

  const cwd = os.tmpdir();
  const versionResult = await runCodexProcess(binary, ['--version'], cwd, 10000);
  if (versionResult.exitCode !== 0) {
    return {
      ok: false,
      message: `codex --version が失敗しました (exit ${versionResult.exitCode}): ${versionResult.stderr.slice(0, 200)}`,
    };
  }
  const versionLine = versionResult.stdout.trim().split('\n')[0] || '(unknown)';

  const loginResult = await runCodexProcess(binary, ['login', 'status'], cwd, 10000);
  const loginText = (loginResult.stdout + loginResult.stderr).trim();
  const loggedIn = /Logged in/i.test(loginText);

  if (!loggedIn) {
    return {
      ok: false,
      message: `${versionLine} は動作していますが未ログインです。「Codex CLI Login」ボタンから認証してください。\n${loginText.slice(0, 200)}`,
    };
  }

  return {
    ok: true,
    message: `OK: ${versionLine} / ${loginText.slice(0, 100)}`,
  };
}

/**
 * Codex CLI ログイン起動 (ブラウザOAuthフロー)
 *
 * `codex login` を子プロセスで起動。codex は自動でブラウザを開いて
 * ChatGPT OAuth を実行し、完了すると `~/.codex/auth.json` を書き出して終了する。
 *
 * onProgress callback で stdout/stderr の進捗（特にOAuth URL）を呼び出し側に通知する。
 *
 * @param settings  Plugin settings (バイナリパス解決に使用)
 * @param onProgress  進捗テキストを受け取るコールバック (Notice 表示用)
 * @param timeoutMs  ログイン全体のタイムアウト (既定5分)
 */
export async function startCodexLogin(
  settings: Readonly<PluginSettings>,
  onProgress: (line: string) => void,
  timeoutMs: number = 5 * 60 * 1000,
): Promise<{ ok: boolean; message: string }> {
  if (Platform.isMobile) {
    return { ok: false, message: 'モバイル版 Obsidian では Codex CLI は使用できません。' };
  }

  let binary: string;
  try {
    binary = resolveBinaryFromSettings(settings);
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : String(error) };
  }

  const cwd = os.tmpdir();
  const result = await runCodexLoginProcess(binary, cwd, timeoutMs, onProgress);

  if (result.timedOut) {
    return {
      ok: false,
      message: `Codex login がタイムアウトしました (${Math.round(timeoutMs / 1000)}s)。ブラウザを閉じた場合は再試行してください。`,
    };
  }
  if (result.exitCode !== 0) {
    const tail = (result.stderr || result.stdout).split('\n').slice(-10).join('\n');
    return {
      ok: false,
      message: `Codex login が失敗しました (exit ${result.exitCode}):\n${tail.slice(0, 400)}`,
    };
  }

  const verify = await runCodexProcess(binary, ['login', 'status'], cwd, 10000);
  const verifyText = (verify.stdout + verify.stderr).trim();
  if (!/Logged in/i.test(verifyText)) {
    return {
      ok: false,
      message: `ログインプロセスは完了しましたが状態確認に失敗しました:\n${verifyText.slice(0, 200)}`,
    };
  }

  return {
    ok: true,
    message: `ログイン成功: ${verifyText.slice(0, 120)}`,
  };
}

/**
 * codex login 専用の子プロセス起動 (進捗通知付き)
 */
function runCodexLoginProcess(
  binary: string,
  cwd: string,
  timeoutMs: number,
  onProgress: (line: string) => void,
): Promise<SpawnResult> {
  return new Promise((resolve) => {
    const { cmd, finalArgs } = adjustLaunch(binary, ['login']);
    const child = spawn(cmd, finalArgs, {
      cwd,
      env: buildLaunchEnv(),
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';
    let timedOut = false;

    const handleChunk = (chunk: Buffer) => {
      const text = chunk.toString('utf8');
      // OAuth URL や "Successfully logged in" 等の重要行を進捗通知
      for (const line of text.split('\n')) {
        const trimmed = line.trim();
        if (trimmed && (/https?:\/\//.test(trimmed) || /logged in/i.test(trimmed) || /authoriz/i.test(trimmed))) {
          onProgress(trimmed);
        }
      }
    };

    child.stdout?.on('data', (chunk: Buffer) => {
      stdout = appendBounded(stdout, chunk.toString('utf8'));
      handleChunk(chunk);
    });
    child.stderr?.on('data', (chunk: Buffer) => {
      stderr = appendBounded(stderr, chunk.toString('utf8'));
      handleChunk(chunk);
    });

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGTERM');
      setTimeout(() => {
        if (!child.killed) {
          child.kill('SIGKILL');
        }
      }, 5000);
    }, timeoutMs);

    child.on('error', (err) => {
      clearTimeout(timer);
      stderr = appendBounded(stderr, `\n[spawn error] ${err.message}`);
      resolve({ exitCode: null, signal: null, stdout, stderr, timedOut });
    });

    child.on('close', (code, signal) => {
      clearTimeout(timer);
      resolve({ exitCode: code, signal, stdout, stderr, timedOut });
    });
  });
}
