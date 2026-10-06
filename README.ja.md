# Langbai NovelAI Studio

> v2.5.0：Windows x64 のインストーラーとポータブル版を公開します。Android/iOS 共通機能のソースは同期済みですが、今回のリリースにモバイルバイナリや実機・署名検証は含まれません。

[简体中文](./README.md) · [繁體中文](./README.zh-TW.md) · [English](./README.en.md) · [日本語](./README.ja.md) · [한국어](./README.ko.md)


**v2.4.3 対応環境：** 独立 Tavern Agent は Windows x64 と Android ARM64（Android 8 以降）に対応し、その他の環境は従来の酒場機能を維持します。ページを開くだけではダウンロードせず、インストール前にバージョンとサイズを表示して確認します。コンポーネントの削除後も会話とユーザーデータは保持され、再インストール時に利用できます。

### ひとつのアイデアから、一連の作品へ。

簡体字中国語・繁体字中国語・英語・日本語・韓国語に対応する NovelAI 画像制作ワークスペースです。

![宣伝用ファンイラスト。描かれた UI はイメージです](./docs/assets/readme/furina-workbench.png)

**[最新版をダウンロード](https://github.com/2786886095/novelai-image-desktop/releases/latest)** · [初回設定ガイド（中国語）](./docs/guide/GETTING_STARTED.md) · [機能ガイド（中国語）](./docs/guide/FEATURES.md)

> 自分の **NovelAI Persistent API Token** を設定してください。モデルの利用権限と生成料金は NovelAI アカウントに依存します。画像解析・プロンプト変換・酒場 AI などの追加サービスには別途設定が必要です。

## はじめ方

1. リリースページから OS に合うパッケージをダウンロードします。通常利用に Node.js やソースのビルドは不要です。
2. 「設定 → API 設定」でアプリ内の案内に従って Token を入力し、検証または残高更新を行います。
3. 「生成」で利用可能なモデルを選び、プロンプト・画像サイズ・枚数・見積料金を確認して生成します。デスクトップ版の結果は出力フォルダーと履歴に保存されます。

```text
1girl, solo, blue hair, blue eyes, white dress, garden, sunlight, smile
```

最初は既定のパラメーターで試し、生成に成功してから追加サービスを設定してください。表示言語は設定で変更できます。プロンプト、ファイル名、会話内容は翻訳しません。

## 目的別のツール

| 目的 | 機能 | ガイド（中国語） |
| --- | --- | --- |
| 画像の生成・編集 | テキストから生成、画像から生成、キャラクタープロンプトと位置 | [生成](./docs/guide/FEATURES.md#generation) |
| 会話でアイデアを練る | 酒場 AI、確認後の生成・自動生成 | [酒場](./docs/guide/FEATURES.md#tavern) |
| 連続した場面を作る | 漫画生成、絵コンテ、候補、採用画像の ZIP 出力 | [漫画](./docs/guide/FEATURES.md#comic) |
| キャラクターや雰囲気の参照 | 精密参照、雰囲気転送、オンラインカタログ、プリセット | [参照](./docs/guide/FEATURES.md#reference) |
| プロンプトと画風を探す | アイデア、画像解析、変換、画風ラボ、個人コーデックス | [プロンプト](./docs/guide/FEATURES.md#prompt) |
| 画像の設定を再利用する | メタデータ解析、ギャラリー、互換パラメーターの適用 | [再利用](./docs/guide/FEATURES.md#reuse) |
| 作品を整理する | 履歴グループ、シード固定の差分、名前変更、ZIP 出力 | [管理](./docs/guide/FEATURES.md#manage) |

酒場・漫画・参照プリセットはそれぞれ独立したワークフローです。漫画ではコマごとに候補を作り、選択した完成画像だけを出力できます。参照の効果はモデルと設定によって異なり、同一の結果は保証しません。

Windows のローカル Artist Detective は現在 **NAI 4.5 Full のみ**対応しています。フル版のローカル評価モデルは VRAM 8 GB 以上が必要です。軽量版は低 VRAM 環境向けですが、一律の最低容量は未検証です。画像生成は NovelAI のクラウド、画風評価はローカル CUDA で行います。類似度は**再現率ではありません**。モデルと実行環境はアプリとは別にダウンロードします。

酒場 Agent は確認後に検証済み互換コンポーネントを更新し、任意の公式最新版を直接導入しません。ユーザーが追加・変更したプラグインを保持しますが、すべての組み合わせの互換性は保証しません。[更新と復元について（中国語）](./docs/TAVERN_AGENT_UPDATES.md)。

## プレビュー

以下は **2026-08-30 / v2.0.1** の既存スクリーンショットです。レイアウトの参考用で、現在の全機能を示すものではありません。上部の宣伝イラストは実際の機能画面ではありません。

![ライトテーマの作業画面：プロンプト、キャンバス、履歴](./docs/assets/readme/workbench-light.png)

<details><summary>設定画面</summary>

![外観とレイアウトの設定](./docs/assets/readme/settings-light.png)

</details>

## インストールと更新

利用できるファイルと各版の注意事項は[最新リリース](https://github.com/2786886095/novelai-image-desktop/releases/latest)を確認してください。[変更履歴（中国語）](./docs/RELEASE_NOTES.md)。

| OS | パッケージ | 注意事項 |
| --- | --- | --- |
| Windows x64 | インストーラー EXE／ポータブル EXE | インストーラーはショートカットとアプリ内更新に対応。ポータブル版は新しいファイルに手動で置き換えます。 |
| macOS Intel／Apple silicon | Universal DMG／ZIP | 未署名です。システムの警告については導入ガイドを参照してください。 |
| Linux x64 | AppImage | 実行権限を付けて起動します。 |
| Android | APK | 手動インストール。 |
| iOS | 未署名 IPA | 自分で署名またはサイドロードが必要です。App Store 用ではありません。 |

Windows のインストーラー版とポータブル版は `%APPDATA%\novelai-image-desktop\` を共有します。ポータブル版でも**すべてのデータが実行ファイルの横に保存されるわけではありません**。交換前に設定と作品をバックアップしてください。デスクトップとモバイルの機能は同一ではなく、ローカル画風反復は Windows 専用です。[OS ごとの差異](./docs/guide/FEATURES.md#platforms)。

## よくある質問

- **オープンソースなら無料で生成できますか？** いいえ。NovelAI のアカウント、モデル権限、利用枠が必要です。Anlas の実料金はサービス側で決まり、表示額は見積もりです。
- **基本生成にも追加 AI API が必要ですか？** いいえ。まず NovelAI Token のみで利用できます。画像解析・変換・会話モデルの設定と料金は個別です。
- **SD／ComfyUI のメタデータを読めるなら、それらのモデルを実行できますか？** いいえ。互換のプロンプト・サイズ・シードを再利用できるだけで、モデル・VAE・LoRA・ワークフロー情報は閲覧用です。
- **モバイルは基本生成だけですか？** いいえ。酒場、漫画、参照、ギャラリー、画像解析、メタデータなどもあります。ただし OS により機能は異なります。

[接続と保存のトラブルシューティング（中国語）](./docs/guide/GETTING_STARTED.md#troubleshooting)。

## データと接続

- NovelAI とは API で通信し、ブラウザー自動操作や Cookie 抽出は使いません。デスクトップのリクエストは Electron メインプロセスで処理し、認証情報と設定はローカルに保存します。
- 生成時はプロンプトと必要な参照画像を NovelAI に送信します。追加 AI 機能の入力は設定したサービスに送られ、ギャラリー・参照・タグサービスは各データソースに接続します。
- メタデータ解析はローカル処理で Anlas を消費しません。保存済み参照や辞書のオフライン閲覧は**オフライン生成を意味しません**。
- Issue の投稿前に Token、API Key、個人の会話、機密画像を除去してください。上流ソフトの診断ログは原文で表示される場合があります。

## 開発・コミュニティ

デスクトップ：Electron + React + TypeScript。モバイル：Flutter。

[ビルド手順（中国語）](./docs/guide/DEVELOPMENT.md) · [貢献ガイド](./CONTRIBUTING.md) · [第三者に関する告知](./THIRD_PARTY_NOTICES.md) · [MIT コードライセンス](./LICENSE)

[不具合報告](https://github.com/2786886095/novelai-image-desktop/issues/new) · [既存の Issue](https://github.com/2786886095/novelai-image-desktop/issues) · QQ グループ：**921985070**

マスコットは『原神』のフリーナです。宣伝画像は非公式の AI 生成ファンアートであり、HoYoverse／NovelAI による提携・公認を示しません。コードの MIT ライセンスは第三者のキャラクター・商標・素材の権利を付与しません。[画像素材の記録](./docs/assets/readme/ASSETS.md)。
