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
    } else if (mode === "item_ocr") {
      systemPrompt = "あなたは画像から商品・アイテム情報を読み取るOCRアシスタントです。";
      userPrompt = `この画像に写っている商品・アイテムの情報を読み取ってください。

必ず以下のJSON形式のみで回答してください。他のテキストは含めないでください。
{
  "title": "商品名・アイテム名（正式な製品名をできるだけ正確に）",
  "brand": "ブランド名・メーカー名（読み取れれば）",
  "category": "以下のカテゴリから最も適切な1つを選択: ファッション, グルメ, お菓子, 美容・健康, インテリア, 家電・ガジェット, 趣味・体験, ギフト券, その他",
  "genres": ["以下のジャンルから該当するものを配列で（複数可）: 服,靴,バッグ,アクセサリー,時計,帽子,財布,ストール,ネクタイ,サングラス,お酒,コーヒー,紅茶,調味料,お取り寄せ,フルーツ,ワイン,日本酒,焼酎,チョコレート,焼き菓子,和菓子,ケーキ,クッキー,ゼリー,アイス,おせんべい,ナッツ,ギフトボックス,コスメ,オイル,スキンケア,香水,ヘアケア,入浴剤,サプリ,マッサージ,アロマ,雑貨,キッチン用品,食器,花,観葉植物,キャンドル,タオル,寝具,文房具,イヤホン,スピーカー,充電器,スマホケース,カメラ,家電,ゲーム,本,音楽,映画,チケット,体験ギフト,習い事,旅行券,スポーツ用品,Amazonギフト,商品券,カタログギフト,QUOカード,食事券"],
  "price": "価格が読み取れれば数値（円）、なければnull",
  "memo": "その他読み取れた情報（型番、サイズ、色、説明文など）"
}

注意:
- 商品名は画像から読み取れる正式な名称を使ってください（型番やシリーズ名も含む）
- ブランド名はロゴや文字から読み取れるものを記載してください
- カテゴリは必ず指定リストから1つ選んでください
- ジャンルは指定リストから該当するものを選んでください（なければ空配列）
- 価格が見える場合は数値のみ（カンマや円マークは除く）
- 読み取れない項目はnullにしてください
- Amazonや楽天などのスクリーンショットの場合、商品名・ブランド名・価格を正確に読み取ってください`;
    } else if (mode === "place_ocr") {
      systemPrompt = "あなたは画像から場所・店舗情報を読み取るOCRアシスタントです。";
      userPrompt = `この画像に写っている場所・お店の情報を読み取ってください。

必ず以下のJSON形式のみで回答してください。他のテキストは含めないでください。
{
  "title": "場所名・店名",
  "category": "以下のカテゴリから最も適切な1つを選択: 食事, 遊び, 観光, 買い物, 宿泊, リラックス, その他",
  "genres": ["以下のジャンルから該当するものを配列で（複数可）: 和食,洋食,イタリアン,フレンチ,中華,焼肉,寿司,ラーメン,カレー,居酒屋,バー,カフェ,パン屋,スイーツ,ビュッフェ,鉄板焼き,海鮮,うどん・そば,カラオケ,ボウリング,テーマパーク,ゲームセンター,映画館,ライブ,スポーツ観戦,釣り,キャンプ,BBQ,ドライブ,プール,スキー,ゴルフ,神社,お寺,温泉,絶景,公園,美術館,博物館,水族館,動物園,城,庭園,展望台,街歩き,離島,世界遺産,ショッピングモール,アウトレット,商店街,百貨店,セレクトショップ,お土産,市場,蚤の市,ホテル,旅館,民宿,グランピング,コテージ,ゲストハウス,スパ,マッサージ,エステ,サウナ,岩盤浴,ヨガ,リトリート"],
  "address": "住所が読み取れれば",
  "memo": "その他読み取れた情報（営業時間、特徴など）"
}

注意:
- 場所名は画像から読み取れる正式な名称を使ってください
- カテゴリは必ず指定リストから1つ選んでください
- ジャンルは指定リストから該当するものを選んでください（なければ空配列）
- 読み取れない項目はnullにしてください`;
    } else {
      return new Response(
        JSON.stringify({ error: "Invalid mode." }),
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
