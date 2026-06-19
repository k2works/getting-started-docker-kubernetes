# ケーススタディ4（ES/CQRS Kafka 版）負荷テスト（Locust）

第 12 章「12.3 負荷テスト」を参考に、Locust をコンテナで動かして gatewayms 経由で
CQRS の Query 側（Read Model）に負荷をかける構成です。

> 記事のサンプル（`senario.py`）は Locust 旧 API ですが、本シナリオは現行 API
> （`HttpUser` / `@task` / `between`）と公式イメージ `locustio/locust` で記述しています。

## 構成

| ファイル | 役割 |
| :--- | :--- |
| `locustfile.py` | 負荷シナリオ（匿名 GET の読み取り負荷、Compose 版・k8s 版で共有） |
| `compose.loadtest.yaml` | Docker Compose 版 Locust の起動定義（Web UI: 8089） |
| `kustomization.yaml` | Kubernetes 版 Locust の Kustomize 定義 |
| `k8s-locust.yaml` | Kubernetes 版 Locust の Deployment / Service |

## 認証

このケースは `local-docker` プロファイルで起動するため gatewayms / 各 ms の Spring
Security 認可が無効になり、gateway 経由の GET はすべて**匿名でアクセス可能**です。
そのためログイン処理なしで Read Model に直接負荷をかけられます。

## 対象エンドポイント（gateway 経由 / CQRS Query 側）

| メソッド | パス | 説明 |
| :--- | :--- | :--- |
| GET | `/actuator/health` | gateway ヘルスチェック |
| GET | `/api/v1/bookings?page=0&size=20` | 予約一覧（Read Model） |
| GET | `/api/v1/shippers?page=0&size=20` | 荷主一覧 |
| GET | `/api/v1/quotes?page=0&size=20` | 見積一覧 |
| GET | `/api/v1/voyages` | 航海一覧 |
| GET | `/api/v1/routes/design-requests` | 経路設計待ち一覧（CQRS Query） |
| GET | `/api/v1/tracking?page=0&size=20` | 追跡サマリ一覧（Read Model） |
| GET | `/api/v1/handling?page=0&size=20` | 荷役作業一覧 |
| GET | `/api/v1/billing/invoices?page=0&size=20` | 請求一覧（Read Model） |
| GET | `/api/v1/billing/invoices/overdue` | 督促（支払期限超過）一覧 |

## 実行手順

```bash
# 1. アプリ本体を起動（gateway をホスト 9082 に公開）
npx gulp dev:case4

# 2. Locust を起動（Web UI: http://localhost:8089）
npx gulp loadtest:case4

# 3. ブラウザで同時ユーザー数・増加レートを指定してテスト開始

# 4. 終了
npx gulp loadtest:case4:down
```

ヘッドレス（UI なしで一定時間実行して終了）:

```bash
# 既定: 50 ユーザー / 毎秒 5 ユーザー増 / 1 分間
npx gulp loadtest:case4:headless

USERS=100 SPAWN=10 DURATION=3m npx gulp loadtest:case4:headless
```

## Kubernetes 版

アプリと同じ名前空間（`cargo-tracker`）に Locust をデプロイし、クラスタ内のサービス
`gatewayms:8080` へ直接負荷をかけます。シナリオは `configMapGenerator` で ConfigMap
として配布します（`local` プロファイルでは認可が無効のため匿名で GET）。

```bash
# 1. アプリ本体を Kubernetes にデプロイ
npx gulp k8s:case4

# 2. Locust をデプロイ
npx gulp loadtest:case4:k8s

# 3. Web UI を port-forward して開く（http://localhost:8089、Ctrl+C で終了）
npx gulp loadtest:case4:k8s:open

# 4. 削除
npx gulp loadtest:case4:k8s:delete
```

## 補足

- ES/CQRS では Read Model への投影が非同期です。シード直後は一覧が空のことがあるため、
  `npx gulp dev:case4` 後しばらく待ってから実行してください。
