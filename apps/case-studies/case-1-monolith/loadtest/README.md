# ケーススタディ1（モノリス版）負荷テスト（Locust）

第 12 章「12.3 負荷テスト」を参考に、Locust をコンテナで動かしてモノリス版
Cargo Tracker に負荷をかける構成です。負荷生成ツール（Locust）・シナリオ
（`locustfile.py`）・実行環境（`compose.loadtest.yaml`）をコードとして固め、
いつでも同じ条件で繰り返しテストできます。

> 記事のサンプル（`senario.py`）は Locust 旧 API（`HttpLocust` / `TaskSet`）ですが、
> 現行 Locust では廃止されているため、本シナリオは現行 API（`HttpUser` / `@task` /
> `between`）と公式イメージ `locustio/locust` で記述しています。

## 構成

| ファイル | 役割 |
| :--- | :--- |
| `locustfile.py` | 負荷シナリオ（仮想ユーザーの振る舞い、Compose 版・k8s 版で共有） |
| `compose.loadtest.yaml` | Docker Compose 版 Locust の起動定義（Web UI: 8089） |
| `kustomization.yaml` | Kubernetes 版 Locust の Kustomize 定義 |
| `k8s-locust.yaml` | Kubernetes 版 Locust の Deployment / Service |

## 対象エンドポイント

モノリス版は Spring Security のフォームログイン（セッション + CSRF）で保護されて
いるため、**認証不要（permitAll）の GET** のみを対象にしています。

| メソッド | パス | 説明 |
| :--- | :--- | :--- |
| GET | `/actuator/health` | ヘルスチェック |
| GET | `/login` | ログイン画面（HTML） |
| GET | `/public/tracking` | 公開追跡の検索画面 |
| GET | `/public/tracking/{trackingNumber}` | 公開追跡の詳細（`TRACKING_NUMBER` 指定時のみ） |

## 実行手順

```bash
# 1. アプリ本体を起動（gateway/app をホスト 18080 に公開）
npx gulp dev:case1

# 2. Locust を起動（Web UI: http://localhost:8089）
npx gulp loadtest:case1

# 3. ブラウザで同時ユーザー数・増加レートを指定してテスト開始
#    （対象ホストは自動で http://host.docker.internal:18080 に設定済み）

# 4. 終了
npx gulp loadtest:case1:down
```

ヘッドレス（CI 向け・UI なしで一定時間実行して終了）:

```bash
# 既定: 50 ユーザー / 毎秒 5 ユーザー増 / 1 分間
npx gulp loadtest:case1:headless

# パラメータを変える場合（環境変数で上書き）
USERS=100 SPAWN=10 DURATION=3m npx gulp loadtest:case1:headless
```

## Kubernetes 版

アプリと同じ名前空間（`cargo-monolith`）に Locust をデプロイし、クラスタ内のサービス
`cargo-tracker:80` へ直接負荷をかけます（負荷生成側とテスト対象を同一オーケストレータに
載せる構成）。シナリオは `configMapGenerator` で ConfigMap として配布します。

```bash
# 1. アプリ本体を Kubernetes にデプロイ
npx gulp k8s:case1

# 2. Locust をデプロイ
npx gulp loadtest:case1:k8s

# 3. Web UI を port-forward して開く（http://localhost:8089、Ctrl+C で終了）
npx gulp loadtest:case1:k8s:open

# 4. 削除
npx gulp loadtest:case1:k8s:delete
```

## 補足

- 公開追跡の詳細（`/public/tracking/{trackingNumber}`）に負荷をかける場合は、
  有効な追跡番号を環境変数で渡します（未指定だと当該タスクはスキップ）。

  ```bash
  TRACKING_NUMBER=TRK-XXXXXXXXXX npx gulp loadtest:case1
  ```

- ログイン後の画面（`/`、`/bookings` 等）に負荷をかけたい場合は、`locustfile.py` の
  `on_start` で `/login` の CSRF トークンを取得して `POST /login` する拡張が必要です。
