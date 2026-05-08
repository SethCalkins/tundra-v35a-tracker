// Carvana search-results scraper — runs as a bookmarklet in any browser tab on
// https://www.carvana.com/cars/toyota-tundra?year[min]=2022 (or similar search).
//
// Strategy:
//   1) Prefer __NEXT_DATA__ if Carvana's SSR JSON is present — every listing's
//      structured fields are there, no DOM scraping needed.
//   2) Fall back to a regex-based DOM scrape: find VINs, walk up to a card
//      element, extract nearby year/mileage/price/trim from rendered text.
//
// Output: triggers a download of carvana-tundras-<UTC-timestamp>.json which
// `tundra ingest-listings <file>` consumes on the Python side.
//
// Dev: edit this file freely. To install as a bookmarklet, run
// `python tools/build-bookmarklet.py` (or just paste the whole IIFE body wrapped
// in `javascript:(()=>{ ... })()` into a bookmark URL).

(function () {
  "use strict";

  const VIN_REGEX = /\b[A-HJ-NPR-Z0-9]{17}\b/g;

  // Extract listings from Next.js / Apollo SSR JSON if present
  function extractFromSSRJson() {
    const out = [];
    const candidates = [];
    const next = document.querySelector('script#__NEXT_DATA__');
    const apollo = document.querySelector('script#__APOLLO_STATE__');
    if (next) {
      try { candidates.push(JSON.parse(next.textContent)); } catch (e) {}
    }
    if (apollo) {
      try { candidates.push(JSON.parse(apollo.textContent)); } catch (e) {}
    }

    function walk(obj, depth) {
      if (!obj || depth > 10) return;
      if (Array.isArray(obj)) {
        for (const v of obj) walk(v, depth + 1);
        return;
      }
      if (typeof obj === 'object') {
        const keys = Object.keys(obj);
        const lower = keys.map(k => k.toLowerCase());
        const vinKey = keys[lower.findIndex(k => k === 'vin')];
        if (vinKey && typeof obj[vinKey] === 'string' && /^[A-HJ-NPR-Z0-9]{17}$/.test(obj[vinKey])) {
          out.push(obj);
        }
        for (const k of keys) walk(obj[k], depth + 1);
      }
    }

    for (const c of candidates) walk(c, 0);
    return out;
  }

  function normaliseSSR(rec) {
    const get = (...names) => {
      for (const n of names) {
        const v = rec[n];
        if (v !== undefined && v !== null && v !== '') return v;
      }
      return null;
    };
    const numeric = (v) => {
      if (typeof v === 'number') return v;
      if (typeof v === 'string') {
        const n = Number(v.replace(/[^0-9.\-]/g, ''));
        return Number.isFinite(n) ? n : null;
      }
      return null;
    };
    const inventoryId = get('inventoryId', 'id', 'vehicleId', 'inventoryID');
    return {
      vin: rec.vin || rec.VIN,
      model_year: numeric(get('year', 'modelYear', 'modelYearValue')),
      make: get('make', 'makeName'),
      model: get('model', 'modelName'),
      trim: get('trim', 'trimName', 'styleName'),
      mileage: numeric(get('mileage', 'miles', 'odometer')),
      asking_price_usd: numeric(get('price', 'priceTotal', 'priceListing', 'salePrice')),
      drivetrain: get('drivetrain', 'driveTrain', 'driveType'),
      exterior_color: get('exteriorColor', 'exterior_color', 'color', 'colorExterior'),
      body_style: get('bodyStyle', 'body', 'bodyType'),
      listing_id: inventoryId ? String(inventoryId) : null,
      listing_url: inventoryId ? `https://www.carvana.com/vehicle/${inventoryId}` : null,
      raw: rec,
    };
  }

  // DOM fallback — for each VIN found in HTML, walk up to a card-shaped ancestor
  function extractFromDom() {
    const html = document.body.innerHTML;
    const vins = [...new Set(html.match(VIN_REGEX) || [])];
    const out = [];

    for (const vin of vins) {
      // Find the smallest element that contains the VIN
      const xpath = `//*[contains(., '${vin}')][not(.//*[contains(., '${vin}')])]`;
      let node;
      try {
        const r = document.evaluate(xpath, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null);
        node = r.singleNodeValue;
      } catch (e) { continue; }
      if (!node) continue;

      // Walk up to find the card container (an ancestor that also contains a price + a /vehicle/ link)
      let card = node;
      for (let i = 0; i < 12 && card; i++) {
        const text = card.innerText || '';
        const hasPrice = /\$\s?\d{2,3}(?:,\d{3})+/.test(text);
        const hasVehicleLink = card.querySelector?.('a[href*="/vehicle/"]');
        if (hasPrice && hasVehicleLink) break;
        card = card.parentElement;
      }
      if (!card) continue;

      const text = card.innerText || '';
      const yearMatch = text.match(/\b(20\d{2})\b/);
      const priceMatch = text.match(/\$\s?(\d{2,3}(?:,\d{3})+)/);
      const mileageMatch = text.match(/([\d,]+)\s*(?:mi|miles)\b/i);
      const link = card.querySelector('a[href*="/vehicle/"]')?.getAttribute('href');
      const inventoryId = link?.match(/\/vehicle\/(\d+)/)?.[1] ?? null;

      // Trim heuristic: line containing the VIN's model
      const modelLine = text.split('\n').find(l => /Tundra|Sequoia|Tacoma|4Runner|RAV4|Corolla|Camry/i.test(l)) ?? '';
      const trimGuess = modelLine
        .replace(/\b(Toyota|Tundra|Sequoia|Tacoma|4Runner|RAV4|Corolla|Camry|Hybrid|HV)\b/gi, '')
        .replace(/^\s*20\d{2}\s*/, '')
        .trim() || null;

      out.push({
        vin,
        model_year: yearMatch ? Number(yearMatch[1]) : null,
        make: 'Toyota',
        model: /Tundra/i.test(text) ? 'Tundra' : null,
        trim: trimGuess,
        mileage: mileageMatch ? Number(mileageMatch[1].replace(/,/g, '')) : null,
        asking_price_usd: priceMatch ? Number(priceMatch[1].replace(/,/g, '')) : null,
        drivetrain: null,
        exterior_color: null,
        body_style: null,
        listing_id: inventoryId,
        listing_url: link ? new URL(link, location.origin).toString() : null,
        raw: { source: 'dom', text: text.slice(0, 500) },
      });
    }
    return out;
  }

  function dedupe(rows) {
    const byVin = new Map();
    for (const r of rows) {
      if (!r.vin) continue;
      const existing = byVin.get(r.vin);
      if (!existing) { byVin.set(r.vin, r); continue; }
      // Prefer the row with more populated fields
      const score = (x) => Object.values(x).filter(v => v !== null && v !== undefined).length;
      if (score(r) > score(existing)) byVin.set(r.vin, r);
    }
    return [...byVin.values()];
  }

  function download(filename, text) {
    const blob = new Blob([text], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  }

  const ssrRows = extractFromSSRJson().map(normaliseSSR);
  const domRows = extractFromDom();
  const all = dedupe([...ssrRows, ...domRows]);

  const payload = {
    schema_version: 1,
    scraped_at: new Date().toISOString(),
    source_url: location.href,
    page_title: document.title,
    listings: all,
  };

  const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  download(`carvana-tundras-${ts}.json`, JSON.stringify(payload, null, 2));

  // Surface inline summary so the user knows it worked
  const stats = {
    'SSR rows': ssrRows.length,
    'DOM rows': domRows.length,
    'unique VINs': all.length,
    'sample': all.slice(0, 3).map(r => `${r.vin} · ${r.model_year} · ${r.trim ?? '?'} · ${r.mileage ?? '?'}mi · $${r.asking_price_usd ?? '?'}`),
  };
  console.log('[carvana-scrape]', stats);
  alert(
    `Carvana scrape complete\n\n` +
    `SSR rows: ${ssrRows.length}\n` +
    `DOM rows: ${domRows.length}\n` +
    `unique VINs: ${all.length}\n\n` +
    `Saved to carvana-tundras-${ts}.json (check Downloads)`
  );
})();
