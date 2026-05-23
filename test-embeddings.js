const apiKey = process.argv[2];
const sampleText = process.argv[3] || 'The quick brown fox jumps over the lazy dog.';

if (!apiKey) {
  console.error('❌ ERROR: You must provide your API key');
  process.exit(1);
}

const fetch = globalThis.fetch || require('node-fetch');

async function testEmbeddingModel(version, modelId, text) {
  const base = `https://generativelanguage.googleapis.com/${version}`;
  const url = `${base}/models/${encodeURIComponent(modelId)}:embedContent?key=${encodeURIComponent(apiKey)}`;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        content: { parts: [{ text: text }] },
      }),
    });
    const responseText = await res.text();

    if (!res.ok) {
      return { ok: false, status: res.status, body: responseText.slice(0, 400) };
    }

    const data = JSON.parse(responseText);
    const embedding = data?.embedding?.values;
    return { ok: true, embedding, length: embedding?.length };
  } catch (err) {
    return { ok: false, status: 0, body: err.message };
  }
}

async function main() {
  console.log('🔎 Testing Embedding Models');
  console.log(`API Key: ...${apiKey.slice(-10)}`);
  console.log(`Sample Text: "${sampleText}"\n`);

  const modelsToTest = [
    { id: 'gemini-embedding-001', versions: ['v1beta', 'v1'] },
    { id: 'gemini-embedding-2', versions: ['v1beta', 'v1'] },
  ];

  const results = [];
  for (const model of modelsToTest) {
    console.log(`Testing model: ${model.id}`);
    for (const version of model.versions) {
      const result = await testEmbeddingModel(version, model.id, sampleText);
      console.log(`  ${version} -> ${result.ok ? 'OK' : 'FAIL'} ${result.ok ? `: length ${result.length}` : `(${result.status}) ${result.body.slice(0, 200)}`}`);
      results.push({ model: model.id, version, ...result });
    }
  }

  console.log('\n=== SUMMARY ===');
  results.forEach(r => {
    if (r.ok) {
      console.log(`✅ ${r.model} (${r.version}): Works! (Length: ${r.length})`);
    } else {
      console.log(`❌ ${r.model} (${r.version}): Failed - (${r.status}) ${r.body.slice(0, 100)}...`);
    }
  });
}

main();
