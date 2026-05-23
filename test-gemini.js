const apiKey = process.argv[2];

if (!apiKey) {
  console.error('❌ ERROR: You must provide your API key');
  process.exit(1);
}

async function testModel(modelId) {
  console.log(`\nTesting: ${modelId}`);
  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelId}:generateContent?key=${encodeURIComponent(apiKey)}`;
    
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          role: 'user',
          parts: [{ text: 'Say hello' }],
        }],
      }),
    });

    const text = await res.text();
    
    if (!res.ok) {
      console.log(`  ❌ FAILED (${res.status}): ${text.slice(0, 200)}`);
      return false;
    }

    const data = JSON.parse(text);
    const reply = data?.candidates?.[0]?.content?.parts?.[0]?.text || 'No reply';
    console.log(`  ✅ WORKS! Response: "${reply}"`);
    return true;
  } catch (err) {
    console.log(`  ❌ ERROR: ${err.message}`);
    return false;
  }
}

async function main() {
  console.log('🚀 GEMINI API MODEL TESTER');
  console.log(`API Key: ...${apiKey.slice(-10)}`);
  const models = ['gemini-1.5-flash', 'gemini-1.5-pro', 'gemini-2.0-flash', 'gemini-pro'];
  
  let working = [];
  for (const model of models) {
    const ok = await testModel(model);
    if (ok) working.push(model);
  }

  console.log('\n' + '='.repeat(50));
  if (working.length > 0) {
    console.log('✅ WORKING MODELS:');
    working.forEach(m => console.log(`   • ${m}`));
    console.log(`\nUSE THIS IN YOUR EDGE FUNCTION: ${working[0]}`);
  } else {
    console.log('❌ NO MODELS WORK - Check API key and billing');
  }
}

main();
