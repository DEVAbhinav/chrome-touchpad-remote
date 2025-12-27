# Chrome Touchpad Remote - Desktop App

This is the packaged desktop application that bundles the server and provides easy installation.

## For Users

### Installation

1. **Download** the installer for your platform:
   - **macOS**: `Chrome-Touchpad-Remote-1.0.0.dmg`
   - **Windows**: `Chrome-Touchpad-Remote-Setup-1.0.0.exe`

2. **Install** the app
   - macOS: Drag to Applications folder
   - Windows: Run the installer

3. **Launch** the app
   - The server starts automatically
   - A window appears with a QR code

4. **Install Chrome Extension**
   - In the app, click "Open Extension Folder"
   - Follow the instructions to load the extension in Chrome

5. **Connect your phone**
   - Scan the QR code shown in the app
   - Enter the pairing code from the extension
   - Done!

## For Developers

### Building from Source

```bash
# Install dependencies
npm install

# Run in development
npm start

# Build for macOS
npm run build:mac

# Build for Windows
npm run build:win

# Build for both
npm run build:all
```

### Output

Built apps will be in the `dist/` folder.

## What's Included

- ✅ Node.js server (embedded)
- ✅ Chrome extension files
- ✅ System tray icon
- ✅ Auto-start server
- ✅ QR code display
- ✅ Beautiful UI

## Requirements

- macOS 10.15+ or Windows 10+
- Chrome browser
- Same WiFi network (for local mode)
