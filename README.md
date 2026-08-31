# LINE ストレッチタイプチェック

LINE公式アカウントから約60秒・5問で使える、ルールベースのストレッチタイプチェックです。結果に応じた3本の動画メニュー、実施記録、翌日・3日後・7日後のフォロー配信キュー、簡易管理画面を備えています。医療診断を行うシステムではありません。

## 使用技術と構成

- ユーザー画面・管理画面: React 19 + Vite
- API: Node.js + Express
- DB: Node.js標準SQLite (`node:sqlite`、Node 22.5以降)
- LINE: LIFF SDK + Messaging API
- 判定: [server/catalog.js](./server/catalog.js) の決定的なルール

主要テーブルは `users`、`assessments`、`assessment_answers`、`stretch_types`、`stretches`、`stretch_type_stretches`、`activity_logs` です。初回起動時にDBと20タイプ・30本のサンプルが自動作成されます。

## ローカル起動

```bash
cp .env.example .env
npm install
npm run dev
```

- ユーザー画面: http://localhost:5173
- 管理画面: http://localhost:5173/admin.html
- API: http://localhost:8787

管理画面では `.env` の `ADMIN_TOKEN` を入力します。LIFF未設定時はブラウザ固有のゲストIDを使うので、LINEなしでも全フローを確認できます。

## 環境変数

| 名前 | 用途 |
|---|---|
| `PORT` | APIポート（既定: 8787） |
| `APP_URL` | 公開URL |
| `LIFF_ID` | LINE Developersで作成するLIFF ID |
| `LINE_CHANNEL_ACCESS_TOKEN` | Messaging APIのチャネルアクセストークン |
| `LINE_CHANNEL_SECRET` | Webhook署名検証用 |
| `ADMIN_TOKEN` | 管理API用の十分長いランダム文字列 |
| `CRON_SECRET` | 定期実行API用の十分長いランダム文字列 |
| `DATABASE_PATH` | SQLiteファイル位置 |

## LINE側で行う設定

1. LINE DevelopersでProviderとMessaging APIチャネルを作成します。
2. LIFFアプリを作成し、Endpoint URLを公開したアプリURLにします。Scopeは最低限 `profile` を選びます。
3. 発行されたLIFF IDを `LIFF_ID` に設定します。
4. Messaging APIのチャネルアクセストークンとChannel secretを環境変数へ設定します。
5. Webhook URLを `https://公開ドメイン/api/line/webhook` に設定し、Webhookを有効化します。
6. リッチメニュー等の「60秒チェック」ボタンにLIFF URLを設定します。

氏名・住所・電話番号・詳細な病歴は保存しません。LIFFプロフィールからはLINE user IDだけを利用します。

利用者向けの保存目的と削除依頼方法は `/privacy.html` に表示します。削除依頼を受けた運営者は、本人確認後に対象ユーザーの回答、活動記録、配信キューをDBバックアップ方針に沿って削除してください。

## DB・ダミーデータ

`npm run seed` またはAPI初回起動で作成されます。DBを作り直す場合は、サーバーを停止し `data/stretch-check.db` をバックアップしてから削除し、再度 `npm run seed` を実行します。本番DBの削除は行わないでください。

## データの変更方法

- ストレッチ追加・公開停止: `/admin.html` の「ストレッチ管理」
- タイプと動画の紐付け: `stretch_type_stretches`。管理API `PUT /api/admin/types/:id/menu` に `{ "stretchIds": [1,2,3] }` を送信
- タイプ追加: `stretch_types` に追加し、[server/catalog.js](./server/catalog.js) の判定先slugを設定
- 判定ルール変更: [server/catalog.js](./server/catalog.js) の `classify`。安全条件は `unsafeAnswers` で通常判定より先に評価されます
- 質問変更: 同ファイルの `questions`。回答IDは保存データとの互換性があるため慎重に変更します

実動画へ差し替える際は、内容を有資格者等が確認し、URL・秒数・注意事項を管理画面またはDBで更新してください。サンプルURLは医学情報ではなくYouTube検索リンクです。

## フォロー配信

チェック完了時に翌日・3日後・7日後の送信予定が `followup_outbox` に入ります。ホスティング先のCronで次を定期実行します。

```bash
curl -X POST https://公開ドメイン/api/jobs/followups \
  -H "Authorization: Bearer $CRON_SECRET"
```

現在は短いテキストを送ります。本番ではLINEのpostbackボタンを追加し、7日後回答を `POST /api/assessments/:id/seven-day` へ連携してください。

## ビルド・デプロイ

```bash
npm test
npm run build
npm run preflight
npm start
```

Node.js 22.5以降、永続ディスク、HTTPS、環境変数を使えるサービスへ配置します。Viteの成果物をExpressが配信します。SQLiteを使うため、サーバーレスの一時ファイル領域だけでの運用は避けてください。複数台構成へ拡張する場合はPostgreSQL等へ移行します。

`render.yaml` と `Dockerfile` を同梱しています。Renderを使う場合はリポジトリを接続し、Blueprintからサービスを作成して、`sync: false` の環境変数を管理画面で入力します。永続ディスクは `/app/data` にマウントされます。公開後は `https://公開ドメイン/api/health` が `status: ok` を返すことを確認してください。

`npm run preflight` は、必須環境変数、HTTPS、管理トークンの長さ、各タイプの公開動画3本、動画URL、残っているサンプル動画を検査します。本番では次のように実行し、`ok: true` を確認してください。

```bash
NODE_ENV=production npm run preflight
```

Render等の定期実行機能、または外部Cronから `/api/jobs/followups` を15分ごとに呼び出します。API側でもJST 9:00〜21:00以外は送信しません。

## セキュリティ・運用上の注意

- 本番で `ADMIN_TOKEN` と `CRON_SECRET` を必ず長いランダム値へ変更し、URLやソースへ埋め込まないでください。
- 管理画面はトークン認証のMVPです。本番公開前にIP制限、SSO、レート制限、監査ログを追加してください。
- LINE webhookは署名を検証します。本番で `LINE_CHANNEL_SECRET` 未設定のまま運用しないでください。
- DBを定期バックアップし、保持期間と削除手順を定めてください。
- ストレッチ結果は病名や治療効果を示しません。強い痛み等の回答時は動画を表示しません。

## テスト

`npm test` で首・肩・腰・脚の通常判定、安全条件、悪化、決定性を確認します。手動では途中離脱後の再開、二重クリック、再チェック、動画なし、管理画面公開停止、LIFF未設定のゲスト動作を確認してください。

## MVP後の候補

- 管理画面でのタイプ文言・質問分岐・動画紐付け編集
- LINE postbackによる翌日・7日後回答の完全自動記録
- 再チェック・動画変更ルールと再チェック率の可視化
- 管理者SSO、レート制限、バックアップ自動化
- 実動画と専門家レビュー済み注意事項への差し替え
