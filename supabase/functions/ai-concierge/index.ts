const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  // CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }

  try {
    const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
    if (!ANTHROPIC_API_KEY) {
      throw new Error("ANTHROPIC_API_KEY is not set");
    }

    const { message, context } = await req.json();

    if (!message || typeof message !== "string") {
      return new Response(
        JSON.stringify({ error: "message is required" }),
        { status: 400, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
      );
    }

    // コンテキスト情報を整理（友だち・ギフト履歴など）
    const systemPrompt = `あなたはAWAI（アワイ）のAIコンシェルジュです。
ギフト選び・人間関係の記憶・おもてなしのプロフェッショナルとして、
温かく丁寧にアドバイスしてください。

## あなたの役割
- ギフトの提案（相手の好み・関係性・予算・シーンに合わせて）
- 記念日や誕生日のリマインド提案
- 贈り物の被り回避（過去の履歴を参考に）
- おすすめのお店・商品の紹介

## 回答スタイル
- 日本語で回答
- 簡潔で温かい言葉遣い
- 具体的な商品名・価格帯を含める
- 3つ程度の選択肢を提示
- 相手が喜ぶ理由も添える

${context ? `## ユーザーの登録情報\n${context}` : ""}`;

    // Claude API呼び出し
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 1024,
        system: systemPrompt,
        messages: [{ role: "user", content: message }],
      }),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      console.error("Anthropic API error:", response.status, errorBody);
      throw new Error(`Anthropic API returned ${response.status}`);
    }

    const result = await response.json();
    const aiMessage = result.content?.[0]?.text || "申し訳ございません。回答を生成できませんでした。";

    return new Response(
      JSON.stringify({ reply: aiMessage }),
      { headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Edge Function error:", error);
    return new Response(
      JSON.stringify({ error: "AIコンシェルジュに接続できませんでした。しばらくしてからお試しください。" }),
      { status: 500, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
    );
  }
});
