import http from "node:http";
import os from "node:os";

const PORT = process.env.PORT || 10955;

const html = `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Server Test</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: 'Segoe UI', Arial, sans-serif;
      background: linear-gradient(135deg, #0f0c29, #302b63, #24243e);
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      color: white;
    }
    .card {
      background: rgba(255,255,255,0.08);
      backdrop-filter: blur(20px);
      border: 1px solid rgba(255,255,255,0.15);
      border-radius: 24px;
      padding: 48px 56px;
      text-align: center;
      max-width: 520px;
      width: 90%;
      box-shadow: 0 32px 64px rgba(0,0,0,0.4);
    }
    .status-dot {
      width: 18px; height: 18px;
      background: #22c55e;
      border-radius: 50%;
      display: inline-block;
      margin-left: 10px;
      box-shadow: 0 0 12px #22c55e;
      animation: pulse 1.5s infinite;
    }
    @keyframes pulse {
      0%, 100% { box-shadow: 0 0 12px #22c55e; }
      50%       { box-shadow: 0 0 28px #22c55e; }
    }
    h1 { font-size: 1.9rem; margin-bottom: 8px; display: flex; align-items: center; justify-content: center; gap: 8px; }
    .subtitle { color: rgba(255,255,255,0.5); font-size: 0.95rem; margin-bottom: 36px; }
    .grid { display: grid; gap: 14px; }
    .row {
      background: rgba(255,255,255,0.06);
      border-radius: 12px;
      padding: 14px 18px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 0.9rem;
    }
    .label { color: rgba(255,255,255,0.5); }
    .value { font-weight: 600; color: #a78bfa; word-break: break-all; text-align: left; }
    .ok { color: #22c55e !important; }
    .footer { margin-top: 32px; font-size: 0.8rem; color: rgba(255,255,255,0.3); }
  </style>
</head>
<body>
  <div class="card">
    <h1><span class="status-dot"></span> السيرفر شغال</h1>
    <p class="subtitle">Server is running correctly</p>
    <div class="grid">
      <div class="row">
        <span class="label">الحالة</span>
        <span class="value ok">✓ Online</span>
      </div>
      <div class="row">
        <span class="label">البورت</span>
        <span class="value">${PORT}</span>
      </div>
      <div class="row">
        <span class="label">الوقت</span>
        <span class="value" id="time">__TIME__</span>
      </div>
      <div class="row">
        <span class="label">الرابط المباشر</span>
        <span class="value">http://212.132.99.151:${PORT}/</span>
      </div>
      <div class="row">
        <span class="label">الدومين</span>
        <span class="value">https://mdstore.website/</span>
      </div>
      <div class="row">
        <span class="label">Node.js</span>
        <span class="value">${process.version}</span>
      </div>
    </div>
    <p class="footer">MD Store Test Server — ${new Date().toISOString()}</p>
  </div>
  <script>
    const t = document.getElementById("time");
    const update = () => t.textContent = new Date().toLocaleTimeString("ar-EG");
    update(); setInterval(update, 1000);
  </script>
</body>
</html>`.replace("__TIME__", new Date().toLocaleTimeString());

const server = http.createServer((req, res) => {
  if (req.url === "/ping") {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ ok: true, port: PORT, time: new Date().toISOString() }));
    return;
  }
  res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
  res.end(html);
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`\n✓ Test server running`);
  console.log(`  Local:   http://localhost:${PORT}/`);
  console.log(`  Direct:  http://212.132.99.151:${PORT}/`);
  console.log(`  Domain:  https://mdstore.website/\n`);
});
