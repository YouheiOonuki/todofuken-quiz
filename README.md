# こども都道府県クイズ

公開 URL: **https://yorozu-craft.com/todofuken-quiz/**

日本地図をタッチして都道府県をおぼえるクイズ。ひらがな・ふりがな・漢字の3段階、読み上げつき。県庁所在地や名物・名所のクイズも。登録不要・無料。
yorozu-craft のツールの1つです（共通ルールは [youheioonuki.github.io の README](https://github.com/YouheiOonuki/youheioonuki.github.io) を参照）。

## 機能

- 5 つのモード：さがしてタッチ（地図をタッチ）／なまえあて（光っている県の名前）／かたちあて（形だけ）／県庁所在地／名物・名所（名物・名所・歴史から都道府県を当てる）
- 文字の段階：ひらがな／ふりがな（`<ruby>`）／漢字。データは `{漢字|よみ}` の形で 1 つだけ持ち、`calc.js` の `ruby()` で変換する
- 地方で絞る（地図がその地方に合わせて大きくなる）。1 回 10 問。選択肢はなるべく同じ地方から出す（まぎらわしく）
- 答えるたびに、県庁所在地と名物・名所を表示。読み上げ（Web Speech API）と効果音（Web Audio API で自作。音の素材ファイルなし）
- 都道府県ごとの正解回数を記録し、3 回正解で「おぼえた ちず」に色がつく。記録の消去は 1 秒の長押し（子どもの誤操作対策）
- オフライン対応（Service Worker、キャッシュ名 `todofuken-quiz-`）。保存キーは `todofuken-quiz_settings`・`todofuken-quiz_stats`

## 広告の扱い（決定 D18）

- 遊ぶ画面（`index.html`）は AdSense の `<meta>` だけで、広告スクリプトを入れない（hoshizora-sanpo の本体と同じ）。youheioonuki.github.io の `tools/check-site.mjs` の `META_ONLY_PAGES` に `/todofuken-quiz/` を入れる
- 広告は保護者向けの `guide.html` だけ（通常の自動広告。子ども向けのタグは付けない。保護者向けの内容なので）

## 地図（決定 D19）

- Natural Earth の `ne_10m_admin_1_states_provinces`（パブリックドメイン）から `tools/make-map.py` で `map.svg` を作る
  - 簡略化（Douglas-Peucker）、小さな島を省く、東京都の伊豆・小笠原を省く
  - 北方領土（歯舞群島・色丹島・国後島・択捉島）は同じデータのロシア側の地物から取り出して北海道に含める
  - 沖縄県と奄美（鹿児島県の北緯 29 度より南）は左上の枠に 1.4 倍で表示
- 作り直し: `curl -O https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_10m_admin_1_states_provinces.geojson && python3 tools/make-map.py ne_10m_admin_1_states_provinces.geojson map.svg`
- 当初の候補 geolonia/japanese-prefectures は README で「ライセンスは GFDL」と確認したため使わない

## データ（`data.js`）

- 47 都道府県の名前・よみ・地方・県庁所在地・名物や名所や歴史（各 2 つ）
- 名物・名所は、年によって変わらない、よく知られたものだけを自分の言葉で書く。「生産量日本一」のように統計で変わることは書かない（オーナーの指示: オールタイムなもの）
- テストで、よみの形・重複（名物の答えが 1 つに決まる）・県庁所在地を確認する

## 保守

- 原則不要（データは変わらない）。市町村合併などで県庁所在地の名前が変わったときだけ `data.js` を直し、`guide.html` の更新履歴に 1 行足す

## ファイル

| ファイル | 役割 |
|---------|------|
| `index.html` | 遊ぶ画面（メニュー・出題・結果・おぼえた地図） |
| `guide.html` | おうちのかたへ（遊びかた・年齢に合わせた遊ばせ方・覚え方のコツ・読み上げ・地図とデータ・よくある質問・注意・更新履歴） |
| `calc.js` | 出題ロジック（純粋関数）：ふりがなの変換・問題づくり・記録 |
| `data.js` | 47 都道府県のデータ |
| `map.svg` / `tools/make-map.py` | 地図と、その作り方 |
| `main.js` | 画面の制御・地図・読み上げ・効果音・保存 |
| `style.css` | 見た目（和紙風の配色、ダークモード対応） |
| `sw.js` / `manifest.webmanifest` | オフライン対応 |
| `404.html` | ツール配下の存在しない URL で出るページ（サイト共通のもの） |
| `favicon.svg` / `apple-touch-icon.png` / `og-image.png` | アイコン / ホーム画面用アイコン / SNS 共有用画像（1200×630） |
| `sitemap.xml` | サイトマップ（robots.txt はドメイン直下で管理） |
| `tests/calc.test.js` | テスト（`node --test tests/*.test.js`。`.github/workflows/test.yml` で push・PR のたびに自動実行） |

## ライセンス

MIT License（`LICENSE`）。地図は Natural Earth（パブリックドメイン）をもとにしています。
