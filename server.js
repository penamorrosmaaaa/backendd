import express from "express";
import cors from "cors";
import bodyParser from "body-parser";
import puppeteer from "puppeteer";
import { launch } from "chrome-launcher";
import lighthouse from "lighthouse";

const app = express();
const PORT = 3001;

app.use(cors());
app.use(bodyParser.json());

app.post("/measure-web-vitals", async (req, res) => {
  const { url } = req.body;
  if (!url) return res.status(400).json({ error: "URL is required" });

  try {
    const chrome = await launch({ chromeFlags: ["--headless"] });
    const result = await lighthouse(url, {
      port: chrome.port,
      output: "json",
      onlyCategories: ["performance"],
    });

    const metrics = {
      LCP: result.lhr.audits["largest-contentful-paint"].numericValue,
      CLS: result.lhr.audits["cumulative-layout-shift"].numericValue,
      TTI: result.lhr.audits["interactive"].numericValue,
    };

    await chrome.kill();
    res.json({ metrics });
  } catch (err) {
    console.error("Lighthouse error:", err);
    res.status(500).json({ error: "Failed to run Lighthouse" });
  }
});

app.listen(PORT, () => {
  console.log(`✅ Server running on http://localhost:${PORT}`);
});
