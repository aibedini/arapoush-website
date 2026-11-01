#!/usr/bin/env bash
# usage: run.sh <path> <name> [desktop]
url="http://localhost:${PORT:-3211}$1"; out=".lighthouse/$2.json"
extra=""; [ "$3" = desktop ] && extra="--preset=desktop"
CHROME_PATH="/c/Program Files/Google/Chrome/Application/chrome.exe" npx -y lighthouse@13.6.0 "$url" --quiet --chrome-flags="--headless=new" $extra --output=json --output-path="$out" --only-categories=performance,seo,accessibility,best-practices >/dev/null 2>&1
node -e "
const r=require('./$out');console.log('$2', Object.entries(r.categories).map(([k,c])=>k+':'+Math.round(c.score*100)).join(' '));
console.log(['first-contentful-paint','largest-contentful-paint','total-blocking-time','cumulative-layout-shift','speed-index'].map(i=>i.split('-').map(w=>w[0]).join('')+'='+r.audits[i].displayValue).join(' '));
for(const a of Object.values(r.audits)) if(a.score!==null&&a.score<0.9&&!['informative','notApplicable','manual'].includes(a.scoreDisplayMode)) console.log(' -',a.id,a.score,a.displayValue||'')"
