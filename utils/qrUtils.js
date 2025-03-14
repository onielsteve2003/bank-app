// Mock QR code generation (replace with real library like 'qrcode' in production)
const generateQRCode = async (data) => {
    return `https://mock-qr-code.com/${encodeURIComponent(data)}`; // Mock QR code URL
};
  
  module.exports = { generateQRCode };