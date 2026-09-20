import puppeteer from "puppeteer-core";

const out = process.argv[2] || "/opt/cursor/artifacts/screenshots/quadra.png";
const url = process.argv[3] || "http://127.0.0.1:43127/";

const browser = await puppeteer.launch({
  executablePath: "/usr/local/bin/google-chrome",
  headless: true,
  args: ["--no-sandbox", "--disable-gpu", "--window-size=1440,900"],
  defaultViewport: { width: 1440, height: 900 },
});

const page = await browser.newPage();
await page.goto(url, { waitUntil: "networkidle0", timeout: 60000 });
await page.waitForSelector("text/Today", { timeout: 15000 }).catch(() => null);
await new Promise((r) => setTimeout(r, 800));
await page.screenshot({ path: out, fullPage: false });
console.log("saved", out);
await browser.close();
