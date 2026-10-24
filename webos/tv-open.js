// Usage: npm install, then node webos/tv-open.js [url] [tv-ip]. Pairs with the LG TV like a phone remote app (the TV asks to allow it once), then opens the game in its browser.
const path = require("path");
const url = process.argv[2] || "https://kaceymon.github.io/familiar-faces/";
const lgtv = require("lgtv2")({
  url: "wss://" + (process.argv[3] || "192.168.1.232") + ":3001",
  wsconfig: { keepalive: true, tlsOptions: { rejectUnauthorized: false } },   // the TV signs its own certificate
  timeout: 290000,
  reconnect: 0,
  keyFile: path.join(__dirname, "..", "dist", "lgtv-client-key"),     // the TV hands this out once, on Accept
});
const done = (code) => { try { lgtv.disconnect(); } catch (e) {} setTimeout(() => process.exit(code), 300); };
lgtv.on("prompt", () => console.log("TV is asking to allow the connection - accept it with the remote"));
lgtv.on("error", (e) => { console.log("error:", e && e.message || e); done(1); });
lgtv.on("connect", () => {
  console.log("paired");
  lgtv.request("ssap://system.launcher/open", { target: url }, (err, res) => {
    console.log(err ? "open failed: " + err.message : "opened: " + JSON.stringify(res));
    lgtv.request("ssap://system.notifications/createToast", { message: "Familiar Faces: point + press OK to play" }, () => done(err ? 1 : 0));
  });
});
setTimeout(() => { console.log("timed out waiting for the TV"); done(2); }, 300000);
