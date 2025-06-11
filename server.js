import puppeteer from 'puppeteer';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  'https://amvikoumsiymrvgxlsog.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFtdmlrb3Vtc2l5bXJ2Z3hsc29nIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDk2MDE4NDYsImV4cCI6MjA2NTE3Nzg0Nn0.GsFEqjceDI36JOsHFr9-nQOSdQ-rlvM1VhoTC6DvLdE'
);

async function extractVitals(url) {
  const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage();

  // ✅ Emulate Android mobile device
  await page.emulate({
    viewport: {
      width: 375,
      height: 667,
      isMobile: true,
      hasTouch: true,
    },
    userAgent:
      'Mozilla/5.0 (Linux; Android 10; SM-G973F) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
  });

  console.log(`🌐 Visiting (mobile): ${url}`);
  await page.goto(url, { waitUntil: 'load', timeout: 60000 });

  // Inject observers for LCP + CLS
  await page.evaluate(() => {
    window.__cls = 0;
    window.__lcp = null;

    new PerformanceObserver((entryList) => {
      for (const entry of entryList.getEntries()) {
        if (!entry.hadRecentInput) {
          window.__cls += entry.value;
        }
      }
    }).observe({ type: 'layout-shift', buffered: true });

    new PerformanceObserver((entryList) => {
      const entries = entryList.getEntries();
      if (entries.length > 0) {
        window.__lcp = entries[entries.length - 1].startTime;
      }
    }).observe({ type: 'largest-contentful-paint', buffered: true });
  });

  // Simulate mobile interaction
  await page.touchscreen.tap(100, 100);
  await page.keyboard.press('Tab');
  await page.keyboard.type('Hello 👋');
  await new Promise(resolve => setTimeout(resolve, 3000));

  const metrics = await page.evaluate(() => {
    const result = {};

    try {
      result.lcp = window.__lcp || null;
      result.cls = window.__cls || 0;

      const inpEntry = performance.getEntriesByType('first-input')[0];
      result.inp = inpEntry ? inpEntry.processingStart - inpEntry.startTime : null;

      const fcpEntry = performance.getEntriesByName('first-contentful-paint')[0];
      result.fcp = fcpEntry ? fcpEntry.startTime : null;

      const nav = performance.getEntriesByType('navigation')[0];
      result.ttfb = nav ? nav.responseStart : null;

    } catch (e) {
      console.log("❌ Error extracting metrics:", e.message);
    }

    return result;
  });

  await browser.close();
  return metrics;
}

async function runQueue() {
  const { data: queue, error } = await supabase
    .from('web_vitals_queue')
    .update({ status: 'processing', started_at: new Date().toISOString() })
    .eq('status', 'pending')
    .order('id', { ascending: true })
    .select()
    .limit(1);

  if (error) {
    console.error('❌ Queue fetch error:', error.message);
    return;
  }

  if (!queue || queue.length === 0) {
    console.log('⏳ No pending URLs.');
    return;
  }

  for (const item of queue) {
    const { url, id } = item;

    try {
      console.log(`🚀 Processing: ${url}`);
      const vitals = await extractVitals(url);
      console.log(`📊 Extracted Mobile Metrics:`, vitals);

      await supabase.from('web_vitals_results').insert([{
        url,
        lcp: vitals.lcp,
        cls: vitals.cls,
        inp: vitals.inp,
        fcp: vitals.fcp,
        ttfb: vitals.ttfb,
        created_at: new Date().toISOString()
      }]);

      await supabase
        .from('web_vitals_queue')
        .update({ status: 'done', finished_at: new Date().toISOString() })
        .eq('id', id);

      console.log(`✅ Saved to Supabase`);
    } catch (err) {
      console.error(`❌ Failed: ${err.message}`);
      await supabase
        .from('web_vitals_queue')
        .update({ status: 'failed', finished_at: new Date().toISOString() })
        .eq('id', id);
    }
  }
}

async function loop() {
  await runQueue();
  setTimeout(loop, 10000); // every 10s
}

loop();
