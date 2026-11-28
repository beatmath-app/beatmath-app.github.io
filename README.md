# 殴り算™（BeatMath™）

![殴り算 BeatMath](assets/logo.svg)

マジック：ザ・ギャザリングのコンバット（攻撃宣言）を鍛えるクイズアプリです。ランダムな盤面に対して攻撃する生物を選び、全パターン探索で求めた正解と根拠（お互い最善を尽くした展開）で答え合わせします。

- **基本**：盤面だけの殴り合い
- **インスタント**：『ファウンデーションズ』収録のインスタント15種が公開手札にある盤面
- **読み**：相手の手札1枚が候補のどれか（均等確率）で、勝率で評価
- 「むずかしい」の最高連続正解数でランキング（Firebase）
- 「むずかしい」の連続正解数に応じて山辺カフカの称号バナー（全8種）を獲得

## ファイル

| ファイル | 内容 |
|---|---|
| `index.html` | アプリ本体（探索エンジン・問題集を含む1ファイル） |
| `config.js` | Firebase の設定値（公開して問題ない値） |
| `firestore.rules` | Firestore のセキュリティルール（Firebaseコンソールの「ルール」に貼る） |
| `src/` | 探索エンジン・画面・テストのソース。`python3 src/build.py` で `src/hosted/index.html` を作り、直下の `index.html` にコピーして公開 |
| `docs/forge-port.md` | Forge への移植の引き継ぎメモ |
| `assets/` | ロゴ・ファビコン・共有用カード画像（`src/logo/build_logo.py` で生成） |
| `assets/cards/` | 称号バナー画像（`<id>.webp`。一覧は同フォルダの README） |

## ランキングの管理

- ランキングの閲覧はログイン不要。登録するときだけGoogleでログインします（Googleの名前やメールアドレスは公開されず、表示されるのはプレイヤー名のみ）。
- 記録は Firestore の `ranking` コレクションに、プレイヤーごと（GoogleログインのID）に1件ずつ保存されます。
- 各プレイヤーは自分の記録しか書き換えられず、記録を下げることもできません（`firestore.rules`）。
- 記録の急な書き換えを防ぐため、初回登録は各モード30問まで、以降は1回に10問まで・伸ばした1問につき5秒あけないと登録できません（`firestore.rules` とアプリの `RK_LIMIT`）。届かない分はアプリが時間をおいて自動で送り直します。
- 不適切な名前や記録は、Firebaseコンソール →「Firestore Database」→ `ranking` から該当ドキュメントを削除してください。

---
殴り算™ (BeatMath™) is unofficial Fan Content permitted under the [Fan Content Policy](https://company.wizards.com/en/legal/fancontentpolicy). Not approved/endorsed by Wizards. Portions of the materials used are property of Wizards of the Coast. ©Wizards of the Coast LLC.
