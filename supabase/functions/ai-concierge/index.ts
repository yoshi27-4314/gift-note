const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

async function searchRakuten(keyword: string, appId: string, affiliateId: string) {
  try {
    const params = new URLSearchParams({
      applicationId: appId,
      keyword: keyword,
      hits: "1",
      format: "json",
      sort: "standard",
    });
    if (affiliateId) params.set("affiliateId", affiliateId);

    const res = await fetch(
      `https://app.rakuten.co.jp/services/api/IchibaItem/Search/20220601?${params}`
    );
    if (!res.ok) return null;
    const json = await res.json();

    if (json.Items && json.Items.length > 0) {
      const item = json.Items[0].Item;
      return {
        name: item.itemName,
        price: item.itemPrice,
        url: item.affiliateUrl || item.itemUrl,
        image: item.mediumImageUrls?.[0]?.imageUrl || "",
        shop: item.shopName,
        review: item.reviewAverage || 0,
      };
    }
    return null;
  } catch (e) {
    console.error("Rakuten search error:", e);
    return null;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }

  try {
    const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
    if (!ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY is not set");

    const RAKUTEN_APP_ID = Deno.env.get("RAKUTEN_APP_ID") || "";
    const RAKUTEN_AFFILIATE_ID = Deno.env.get("RAKUTEN_AFFILIATE_ID") || "";

    const { message, context, structured } = await req.json();

    if (!message || typeof message !== "string") {
      return new Response(
        JSON.stringify({ error: "message is required" }),
        { status: 400, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
      );
    }

    // structured=true: JSON形式でギフト提案＋楽天/Amazon リンク付き
    // structured=false: 従来のテキスト応答
    const systemPrompt = structured
      ? `あなたはAWAI（アワイ）のAIギフトコンシェルジュです。

## 回答形式
必ず以下のJSON配列形式のみで回答してください。JSON以外のテキストは一切含めないでください。
[
  {
    "name": "商品名またはギフト名",
    "shop": "店名・ブランド名",
    "reason": "なぜこの人に合うか（1-2文）",
    "budget": 5000,
    "keyword": "楽天やAmazonで検索する最適なキーワード",
    "isPlace": false
  }
]

## 提案ルール
- Amazonや楽天の大量生産品ではなく、知る人ぞ知る名店やブランド、体験型ギフトなどセンスの良い提案を
- 苦手なものは絶対に避ける
- 過去にあげたものと被らない
- 3つ提案する
- budgetは数字のみ（円単位）
- keywordはブランド名＋商品名で検索に最適化
- レストランや体験スポットの場合は isPlace: true
- 毎回異なる提案をする

${context ? "## ユーザーの登録情報\n" + context : ""}`
      : `あなたはAWAI（アワイ）のAIコンシェルジュです。
ギフト選び・人間関係の記憶・おもてなしのプロフェッショナルとして、
温かく丁寧にアドバイスしてください。

## 回答スタイル
- 日本語で回答
- 簡潔で温かい言葉遣い
- 具体的な商品名・価格帯を含める
- 3つ程度の選択肢を提示
- 相手が喜ぶ理由も添える

${context ? "## ユーザーの登録情報\n" + context : ""}`;

    // Claude API呼び出し
    const claudeRes = await fetch("https://api.anthropic.com/v1/messages", {
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

    if (!claudeRes.ok) {
      const err = await claudeRes.text();
      console.error("Claude API error:", claudeRes.status, err);
      throw new Error(`Claude API returned ${claudeRes.status}`);
    }

    const claudeData = await claudeRes.json();
    const aiText = claudeData.content?.[0]?.text || "";

    // テキストモード（従来互換）
    if (!structured) {
      return new Response(
        JSON.stringify({ reply: aiText }),
        { headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
      );
    }

    // 構造化モード: JSON解析 → 楽天/Amazonリンク付与
    let suggestions;
    try {
      const jsonMatch = aiText.match(/\[[\s\S]*\]/);
      suggestions = jsonMatch ? JSON.parse(jsonMatch[0]) : [];
    } catch {
      // JSON解析失敗 → テキストとして返す
      return new Response(
        JSON.stringify({ reply: aiText }),
        { headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
      );
    }

    // 楽天API + Amazon検索URLで情報を付与
    for (let i = 0; i < suggestions.length; i++) {
      const s = suggestions[i];
      s.amazonUrl = `https://www.amazon.co.jp/s?k=${encodeURIComponent(s.keyword || s.name)}`;

      if (RAKUTEN_APP_ID) {
        if (i > 0) await new Promise((r) => setTimeout(r, 350));
        s.rakuten = await searchRakuten(
          s.keyword || s.name,
          RAKUTEN_APP_ID,
          RAKUTEN_AFFILIATE_ID
        );
      }
    }

    return new Response(
      JSON.stringify({ suggestions }),
      { headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Edge Function error:", error);
    return new Response(
      JSON.stringify({
        error: "AIコンシェルジュに接続できませんでした。しばらくしてからお試しください。",
      }),
      { status: 500, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
    );
  }
});
