import express from "express";
import cors from "cors";
import bodyParser from "body-parser";
import puppeteer from "puppeteer";
import { launch } from "chrome-launcher";
import lighthouse from "lighthouse";
import { createClient } from "@supabase/supabase-js";

const app = express();
const PORT = 3001;

app.use(cors());
app.use(bodyParser.json());

// 🔐 Supabase config
const supabaseUrl = "https://amvikoumsiymrvgxlsog.supabase.co";
const supabaseKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFtdmlrb3Vtc2l5bXJ2Z3hsc29nIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDk2MDE4NDYsImV4cCI6MjA2NTE3Nzg0Nn0.GsFEqjceDI36JOsHFr9-nQOSdQ-rlvM1VhoTC6DvLdE";
const supabase = createClient(supabaseUrl, supabaseKey);

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

    const LCP = result.lhr.audits["largest-contentful-paint"].numericValue;
    const CLS = result.lhr.audits["cumulative-layout-shift"].numericValue;
    const TTI = result.lhr.audits["interactive"].numericValue;

    await chrome.kill();

    // Insert into Supabase
    const { error } = await supabase.from("web_vitals").insert([
      {
        url,
        lcp: LCP,
        cls: CLS,
        tti: TTI,
      },
    ]);

    if (error) {
      console.error("Supabase insert error:", error);
      return res.status(500).json({ error: "Supabase insert failed" });
    }

    res.json({ message: "Metrics saved to Supabase", url, LCP, CLS, TTI });
  } catch (err) {
    console.error("Lighthouse error:", err);
    res.status(500).json({ error: "Lighthouse failed" });
  }
});

app.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
});
