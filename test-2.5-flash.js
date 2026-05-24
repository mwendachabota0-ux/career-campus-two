const apiKey = "AIzaSyCT6xXgHmv5_6BYYeVAtYbGELKYBwEEOyI";

async function testGemini() {
  const url = `https://generativelanguage.googleapis.com/v1/models/gemini-2.5-flash:generateContent?key=${encodeURIComponent(apiKey)}`;
  
  try {
    console.log("🚀 Testing Gemini 2.5 Flash...\n");
    
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          role: 'user',
          parts: [{ 
            text: 'You are a career counselor. Provide 3 quick tips for a software engineer looking to transition to product management.' 
          }],
        }],
      }),
    });

    const text = await response.text();
    
    if (!response.ok) {
      console.log(`❌ FAILED (${response.status}):\n`);
      console.log(text);
      return;
    }

    const data = JSON.parse(text);
    const reply = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    
    if (reply) {
      console.log(`✅ SUCCESS!\n`);
      console.log(reply);
    } else {
      console.log("❌ No response generated");
      console.log(data);
    }
  } catch (err) {
    console.log(`❌ ERROR: ${err.message}`);
  }
}

testGemini();
