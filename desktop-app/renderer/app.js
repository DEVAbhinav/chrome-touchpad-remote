let qrcodeInstance;

// Initialize app
async function init() {
    const serverInfo = await window.electron.getServerInfo();
    updateServerInfo(serverInfo);
    generateQRCode(serverInfo.url);
}

function updateServerInfo(info) {
    document.getElementById('local-url').textContent = `http://localhost:${info.port}`;
    document.getElementById('network-url').textContent = info.url;
}

function generateQRCode(url) {
    const qrcodeElement = document.getElementById('qrcode');
    qrcodeElement.innerHTML = ''; // Clear existing

    qrcodeInstance = new QRCode(qrcodeElement, {
        text: url,
        width: 200,
        height: 200,
        colorDark: '#667eea',
        colorLight: '#ffffff',
        correctLevel: QRCode.CorrectLevel.H
    });
}

async function openExtensionSetup() {
    const result = await window.electron.openExtensionSetup();

    // Show success message
    const btn = document.querySelector('.btn');
    const originalText = btn.textContent;
    btn.textContent = '✅ Opened! Follow the instructions in Chrome';
    btn.style.background = '#10b981';

    setTimeout(() => {
        btn.textContent = originalText;
        btn.style.background = '#667eea';
    }, 3000);
}

// Listen for server info updates
window.electron.onServerInfo((data) => {
    updateServerInfo(data);
    generateQRCode(data.url);
});

// Initialize on load
init();
