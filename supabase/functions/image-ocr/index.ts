const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }

  try {
    const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
    if (!ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY is not set");

    const { image, mode } = await req.json();
    // image: base64エンコードされた画像データ（data:image/...;base64,... 形式）
    // mode: "line_friends" | "business_card"

    if (!image || !mode) {
      return new Response(
        JSON.stringify({ error: "image and mode are required" }),
        { status: 400, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
      );
    }

    // base64データからメディアタイプとデータを分離
    const match = image.match(/^data:(image\/[a-zA-Z+]+);base64,(.+)$/);
    if (!match) {
      return new Response(
        JSON.stringify({ error: "Invalid image format. Expected base64 data URL." }),
        { status: 400, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
      );
    }
    const mediaType = match[1];
    const base64Data = match[2];

    let systemPrompt = "";
    let userPrompt = "";

    if (mode === "line_friends") {
      systemPrompt = `あなたは画像からテキストを読み取るOCRアシスタントです。`;
      userPrompt = `この画像はLINEの友だちリストのスクリーンショットです。
画像に表示されている友だちの名前を全て読み取ってください。

必ず以下のJSON形式のみで回答してください。他のテキストは含めないでください。
{
  "friends": [
    {"name": "友だちの名前", "note": "表示名の補足があれば（なければ空文字）"}
  ]
}

注意:
- グループ名やプロフィール写真の説明は不要です
- 名前だけを正確に読み取ってください
- 読み取れない文字がある場合は「?」にしてください`;
    } else if (mode === "business_card") {
      systemPrompt = `あなたは名刺から情報を読み取るOCRアシスタントです。`;
      userPrompt = `この画像は名刺です。以下の情報を読み取ってください。

必ず以下のJSON形式のみで回答してください。他のテキストは含めないでください。
{
  "type": "corporate",
  "nickname": "会社の略称（なければ会社名）",
  "corpFullName": "正式な会社名",
  "fullName": "氏名",
  "position": "役職",
  "department": "部署",
  "phone": "電話番号",
  "mobile": "携帯電話番号",
  "email": "メールアドレス",
  "address": "住所",
  "url": "WebサイトURL",
  "industry": "業種（推測）"
}

注意:
- 読み取れない項目は空文字にしてください
- 複数の電話番号がある場合、固定電話をphone、携帯をmobileに入れてください
- 会社名がない個人の名刺の場合は type を "personal" にしてください`;
    } else {
      return new Response(
        JSON.stringify({ error: "Invalid mode. Use 'line_friends' or 'business_card'." }),
        { status: 400, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
      );
    }

    // Claude Vision API呼び出し
    const claudeRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 2048,
        system: systemPrompt,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "image",
                source: {
                  type: "base64",
                  media_type: mediaType,
                  data: base64Data,
                },
              },
              {
                type: "text",
                text: userPrompt,
              },
            ],
          },
        ],
      }),
    });

    if (!claudeRes.ok) {
      const err = await claudeRes.text();
      console.error("Claude Vision API error:", claudeRes.status, err);
      throw new Error(`Claude API returned ${claudeRes.status}`);
    }

    const claudeData = await claudeRes.json();
    const aiText = claudeData.content?.[0]?.text || "";

    // JSONを解析
    let result;
    try {
      const jsonMatch = aiText.match(/\{[\s\S]*\}/);
      result = jsonMatch ? JSON.parse(jsonMatch[0]) : null;
    } catch {
      result = null;
    }

    if (!result) {
      return new Response(
        JSON.stringify({ error: "文字を読み取れませんでした。名刺をできるだけ近くで、明るい場所で撮影してみてください。", raw: aiText }),
        { status: 200, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ result, mode }),
      { headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Edge Function error:", error);
    return new Response(
      JSON.stringify({ error: "画像解析に失敗しました。名刺を近くで撮り直すか、明るい場所でもう一度お試しください。" }),
      { status: 500, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
    );
  }
});
