# ケーススタディ2（イベント駆動マイクロサービス版）負荷テスト（Locust）

第 12 章「12.3 負荷テスト」を参考に、Locust をコンテナで動かして gatewayms 経由で
マイクロサービス群に負荷をかける構成です。

> 記事のサンプル（`senario.py`）は Locust 旧 API ですが、本シナリオは現行 API
> （`HttpUser` / `@task` / `between`）と公式イメージ `locustio/locust` で記述しています。

## 構成

| ファイル | 役割 |
| :--- | :--- |
| `locustfile.py` | 負荷シナリオ（ログイン → JWT 取得 → 読み取り系 GET、Compose 版・k8s 版で共有） |
| `compose.loadtest.yaml` | Docker Compose 版 Locust の起動定義（Web UI: 8089） |
| `kustomization.yaml` | Kubernetes 版 Locust の Kustomize 定義 |
| `k8s-locust.yaml` | Kubernetes 版 Locust の Deployment / Service |

## 認証

gatewayms が JWT 認証を強制するため、`on_start` でログインしてトークンを取得し、
以降の GET に `Authorization: Bearer <token>` を付与します。既定ユーザーはシード済みの
`admin` / `password`（authms の `V3__seed_users.sql`）です。

## 対象エンドポイント（gateway 経由 / Read 系）

| メソッド | パス | 説明 |
| :--- | :--- | :--- |
| POST | `/api/v1/auth/login` | ログイン（トークン取得・`on_start`） |
| GET | `/actuator/health` | gateway ヘルスチェック（認証不要） |
| GET | `/api/booking/v1/cargos` | 貨物予約一覧 |
| GET | `/api/booking/v1/shippers` | 荷主一覧 |
| GET | `/api/routing/v1/voyages` | 航海一覧 |
| GET | `/api/booking/v1/cargos/routing-assignments` | 経路設計対象一覧 |

## 実行手順

```bash
# 1. アプリ本体を起動（gateway をホスト 9080 に公開）
npx gulp dev:case2

# 2. Locust を起動（Web UI: http://localhost:8089）
npx gulp loadtest:case2

# 3. ブラウザで同時ユーザー数・増加レートを指定してテスト開始

# 4. 終了
npx gulp loadtest:case2:down
```

ヘッドレス（UI なしで一定時間実行して終了）:

```bash
# 既定: 50 ユーザー / 毎秒 5 ユーザー増 / 1 分間
npx gulp loadtest:case2:headless

USERS=100 SPAWN=10 DURATION=3m npx gulp loadtest:case2:headless
```

## Kubernetes 版

アプリと同じ名前空間（`cargo-event`）に Locust をデプロイし、クラスタ内のサービス
`gatewayms:8080` へ直接負荷をかけます。シナリオは `configMapGenerator` で ConfigMap
として配布します（JWT ログインは locustfile 内で実施、既定 `admin` / `password`）。

```bash
# 1. アプリ本体を Kubernetes にデプロイ
npx gulp k8s:case2

# 2. Locust をデプロイ
npx gulp loadtest:case2:k8s

# 3. Web UI を port-forward して開く（http://localhost:8089、Ctrl+C で終了）
npx gulp loadtest:case2:k8s:open

# 4. 削除
npx gulp loadtest:case2:k8s:delete
```

## 補足

- ログインユーザーを変える場合は環境変数で上書きします。

  ```bash
  LOGIN_USERNAME=sales LOGIN_PASSWORD=password npx gulp loadtest:case2
  ```
