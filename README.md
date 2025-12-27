# Chrome Touchpad Remote

Control your Chrome browser from your phone like a wireless touchpad/mouse.

## Features

✨ **Smooth Cursor Control** - 30ms latency on local network  
🎬 **Video Player Support** - Works with YouTube, Netflix, and all video sites  
⛶ **Browser Fullscreen** - Quick fullscreen toggle  
🔄 **Page Controls** - Back, forward, refresh buttons  
⌨️ **Virtual Keyboard** - Type from your phone when needed  
📱 **Auto-reconnect** - Stable connection with fast reconnection  
🔐 **Secure Pairing** - 6-digit pairing code system

## Quick Start

### 1. Install Dependencies
```bash
cd server
npm install ws
```

### 2. Start Server
```bash
node index.js
```

### 3. Load Chrome Extension
1. Open `chrome://extensions/`
2. Enable "Developer mode"
3. Click "Load unpacked"
4. Select the `extension/` folder

### 4. Connect Mobile
1. Click extension icon to see pairing code
2. Scan QR code or visit the URL shown
3. Enter the pairing code
4. Start controlling!

## How It Works

- **Server**: WebSocket relay server (Node.js)
- **Extension**: Injects cursor and handles browser control
- **Mobile**: Touch interface sends events to server
- **Communication**: Real-time WebSocket with ~30ms latency

## Controls

### Mobile Touchpad
- **Single finger drag** → Move cursor
- **Single tap** → Click
- **Double tap** → Double click
- **Two finger scroll** → Scroll page
- **Long press** → Right click

### Mobile Toolbar
- ← → Back/Forward navigation
- 🔄 Refresh page
- ⛶ Browser fullscreen
- ⋯ More options (keyboard, tabs, etc.)

## Video Player Support

All video players work including:
- ✅ YouTube
- ✅ Netflix
- ✅ Disney+
- ✅ Prime Video
- ✅ Any HTML5 video

**Click on video** to play/pause  
**Fullscreen button** makes browser fullscreen

## Architecture

```
Mobile Device          →  WebSocket Server  →  Chrome Extension
(Touch Events)            (Relay)               (Cursor Control)
```

## Features Roadmap

See [monetization_plan.md](monetization_plan.md) for future plans including:
- Cloud relay for remote access
- Desktop Electron app
- Subscription tiers
- Enhanced gesture support

## Technical Details

- **Latency**: ~30ms on local network
- **Cursor smoothing**: CSS transitions with GPU acceleration
- **Sensitivity**: Configurable (default 3.0x)
- **Connection**: WebSocket on port 8765

## License

MIT

## Author

Built with ❤️ for seamless browser control from mobile devices
