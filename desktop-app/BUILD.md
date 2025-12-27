# Building the Desktop App

## Prerequisites

```bash
# Install Node.js 18+ if not already installed
# macOS:
brew install node

# Verify installation
node --version
npm --version
```

## Build Steps

### 1. Install Dependencies

```bash
cd desktop-app
npm install
```

This installs:
- `electron` - Desktop app framework
- `electron-builder` - Packaging tool
- `ws` - WebSocket library

### 2. Test in Development

```bash
npm start
```

This will:
- Launch the Electron app
- Auto-start the WebSocket server
- Show the QR code
- Open in development mode

### 3. Build for Distribution

**macOS:**
```bash
npm run build:mac
```

Output: `dist/Chrome Touchpad Remote-1.0.0.dmg`

**Windows:**
```bash
npm run build:win
```

Output: `dist/Chrome Touchpad Remote Setup 1.0.0.exe`

**Both platforms:**
```bash
npm run build:all
```

### 4. Code Signing (Optional but Recommended)

**macOS:**
```bash
# Get a Developer ID certificate from Apple
# Export certificate from Keychain
export CSC_LINK=/path/to/certificate.p12
export CSC_KEY_PASSWORD=your_password

npm run build:mac
```

**Windows:**
```bash
# Get a code signing certificate
export WIN_CSC_LINK=/path/to/certificate.pfx
export WIN_CSC_KEY_PASSWORD=your_password

npm run build:win
```

## Build Output

Files will be in `dist/` folder:

**macOS:**
- `Chrome Touchpad Remote-1.0.0.dmg` - Installer
- `Chrome Touchpad Remote-1.0.0-mac.zip` - Portable

**Windows:**
- `Chrome Touchpad Remote Setup 1.0.0.exe` - Installer
- `Chrome Touchpad Remote 1.0.0.exe` - Portable

## File Sizes

- macOS DMG: ~150MB
- Windows Installer: ~120MB

## Distribution

Upload the installers to:
- GitHub Releases
- Your website
- File hosting service

## Troubleshooting

**"node-gyp rebuild" fails:**
```bash
npm install --global windows-build-tools  # Windows only
```

**Icon not showing:**
- Ensure `assets/icon.icns` (macOS) and `assets/icon.ico` (Windows) exist
- Use icon converter: https://cloudconvert.com/png-to-icns

**App won't start:**
- Check console for errors
- Try `npm start` first to test
- Ensure all files are included in package.json `files` array

## Next Steps

After building successfully:
1. Test the installer on a clean machine
2. Add to GitHub Releases
3. Create a landing page with download links
4. Submit to app stores (optional)
