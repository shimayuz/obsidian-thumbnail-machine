# Thumbnail Machine - Obsidian Plugin

AI-powered thumbnail generator for YouTube, note.com, and Udemy within Obsidian.

## Features

- **Multi-platform Support**: YouTube (1280x720), note (1280x670), Udemy (1280x720)
- **25 Appeal Axes**: Generate up to 3 thumbnails at once with different marketing approaches
- **Reference Images**: Upload up to 2 images for composite generation (PNG, JPEG, WebP)
- **Auto-insert to Note**: Generated images are automatically inserted at the top of your note
- **Auto-extraction**: Automatically extracts title, subtitle, and keywords from your notes
- **Multiple Styles**: Modern, Bold, Minimal, Gradient, Photo-based, Illustration
- **Custom Prompts**: Customize designs with additional instructions
- **Folder Suggestions**: Auto-complete folder paths when configuring save location

### 🎯 25 Appeal Axes

Select up to 3 appeal axes to generate YouTube-style thumbnails:

| # | Axis | Description |
|---|------|-------------|
| 1 | Authority | Expert credentials and achievements |
| 2 | Emotion | Heart-touching design |
| 3 | Numbers | Persuasive statistics |
| 4 | Problem | Clear problem statement |
| 5 | Before/After | Visual transformation |
| 6 | Urgency | Call to immediate action |
| 7 | Limited | Scarcity emphasis |
| 8 | Empathy | Reader connection |
| 9 | Curiosity | Intriguing hooks |
| 10 | Proof | Evidence-based credibility |
| 11 | Story | Narrative engagement |
| 12 | Contrast | Clear differentiation |
| 13 | Simple | Clean and clear |
| 14 | Pop | Colorful eye-catcher |
| 15 | Mystery | Enigmatic atmosphere |
| 16 | Professional | Business-like feel |
| 17 | Friendly | Approachable impression |
| 18 | Trend | Current style |
| 19 | Contrarian | Convention-breaking |
| 20 | Achievement | Results showcase |
| 21 | Warning | Attention alert |
| 22 | Hope | Bright future |
| 23 | Nostalgia | Memory-evoking |
| 24 | Future | Forward-looking |
| 25 | Insight | Deep wisdom |

## Installation

### Manual Installation

1. Clone this repository
2. Navigate to `plugin` directory
3. Run `npm install`
4. Run `npm run build`
5. Copy `main.js`, `manifest.json`, `styles.css` to Obsidian's plugins folder

```bash
cd plugin
npm install
npm run build
```

## Settings

### API Key (Required)

- **KIE API Key**: High-quality image generation with custom sizes

### Default Settings

- **Default Platform**: Initial platform selection
- **Default Style**: Design style
- **Language**: Language for generated text

### Save Settings

- **Save Location**: Vault root or specified folder
- **Specified Folder**: Where to save thumbnails (with folder suggestions)
- **File Name Format**: Available: `{title}`, `{platform}`, `{timestamp}`, `{date}`
- **Auto-insert to Note**: Insert image links at the top of the note (ON/OFF)

## Usage

### Basic Usage (Appeal Axis Selection)

1. Open a Markdown note
2. Click the 🖼️ icon in the sidebar, or use `Cmd/Ctrl + P` → `Thumbnail Machine: Generate Thumbnail`
3. Review and edit title, platform, and style in the modal
4. Click **"Select Appeal Axes..."** button
5. Select **up to 3** appeal axes from 25 options and click "Confirm"
6. (Optional) Click **"Add Images..."** to upload reference images (up to 2)
7. Click "Generate"
8. Thumbnails are generated for each selected appeal axis
9. Image links are automatically inserted at the top of your note

> **💡 Tip**: You can generate thumbnails even without frontmatter - just enter a title in the modal.

### Quick Generation

Generate for specific platforms without appeal axis selection:

- `Generate YouTube Thumbnail` - For YouTube
- `Generate note Thumbnail` - For note.com
- `Generate Udemy Thumbnail` - For Udemy

## Platform Specifications

| Platform | Size | Aspect Ratio |
|----------|------|--------------|
| YouTube | 1280x720 | 16:9 |
| note | 1280x670 | 1.91:1 |
| Udemy | 1280x720 | 16:9 |

## Development

```bash
# Development mode (watch)
npm run dev

# Production build
npm run build
```

## Troubleshooting

### "KIE API key not configured" error
→ Set your KIE API key in the settings

### Images not generating
→ Verify your API key is valid
→ Check your network connection

### "Please select at least one appeal axis" error
→ Click "Select Appeal Axes..." and choose at least one axis

### Reference image upload fails
→ Ensure image size is under 10MB
→ Check that the format is PNG, JPEG, or WebP

### Images not inserted into note
→ Check that "Auto-insert to Note" is enabled in settings

## License

MIT
