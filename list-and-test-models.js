const apiKey = process.argv[2];

if (!apiKey) {
  console.error('❌ ERROR: You must provide your API key');
  process.exit(1);
}

const fetch = globalThis.fetch || require('node-fetch');

async function listModels(version) {
  const base = `https://generativelanguage.googleapis.com/${version}`;
  const url = `${base}/models?key=${encodeURIComponent(apiKey)}`;
  try {
    const res = await fetch(url);
    const text = await res.text();
    if (!res.ok) {
      console.log(`${version} ListModels failed (${res.status}): ${text.slice(0,300)}`);
      return [];
    }
    const data = JSON.parse(text);
    const models = (data.models || []).map(m => {
      // m.name might be 'models/xyz' or just 'xyz'
      const name = m.name || m.model || m;
      const id = String(name).split('/').pop();
      return { raw: name, id };
    });
    console.log(`\n${version} found ${models.length} models (showing up to 20):`);
    models.slice(0,20).forEach(m => console.log(`  • ${m.raw}`));
    return models;
  } catch (err) {
    console.log(`${version} ListModels error: ${err.message}`);
    return [];
  }
}

async function testModel(version, modelId) {
  const base = `https://generativelanguage.googleapis.com/${version}`;
  const url = `${base}/models/${encodeURIComponent(modelId)}:generateContent?key=${encodeURIComponent(apiKey)}`;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: 'Say hello' }] }],
      }),
    });
    const text = await res.text();
    if (!res.ok) {
      return { ok: false, status: res.status, body: text.slice(0,400) };
    }
    const data = JSON.parse(text);
    const reply = data?.candidates?.[0]?.content?.parts?.[0]?.text || JSON.stringify(data).slice(0,300);
    return { ok: true, reply };
  } catch (err) {
    return { ok: false, status: 0, body: err.message };
  }
}

async function main() {
  console.log('🔎 Listing models for v1beta and v1');
  const v1beta = await listModels('v1beta');
  // update todo
  console.log('\n🔎 Listing models for v1');
  const v1 = await listModels('v1');

  const combined = [];
  const addUnique = (arr) => arr.forEach(m => { if (!combined.find(c => c.id === m.id)) combined.push(m); });
  addUnique(v1beta); addUnique(v1);

  if (combined.length === 0) {
    console.log('\nNo models available to test.');
    return;
  }

  console.log(`\n🧪 Testing generateContent on up to 10 models (may hit quota)`);
  const toTest = combined.slice(0, 10);
  const results = [];
  for (const m of toTest) {
    console.log(`\nTesting model: ${m.id}`);
    const outBeta = await testModel('v1beta', m.id);
    console.log(` v1beta -> ${outBeta.ok ? 'OK' : 'FAIL'} ${outBeta.ok ? `: ${String(outBeta.reply).slice(0,200)}` : `(${outBeta.status}) ${outBeta.body.slice(0,200)}`}`);
    const outV1 = await testModel('v1', m.id);
    console.log(` v1     -> ${outV1.ok ? 'OK' : 'FAIL'} ${outV1.ok ? `: ${String(outV1.reply).slice(0,200)}` : `(${outV1.status}) ${outV1.body.slice(0,200)}`}`);
    results.push({ id: m.id, v1beta: outBeta, v1: outV1 });
  }

  console.log('\n=== SUMMARY ===');
  results.forEach(r => {
    const okVersions = [];
    if (r.v1beta.ok) okVersions.push('v1beta');
    if (r.v1.ok) okVersions.push('v1');
    console.log(` - ${r.id}: ${okVersions.length ? okVersions.join(', ') : 'none'}`);
  });
}

main();
