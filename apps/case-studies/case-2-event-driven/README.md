# ケーススタディ 2: イベント駆動マイクロサービス（Kustomize 対 Helm）

[第 14 章 イベント駆動マイクロサービスのデプロイ](../../../docs/article/getting-start-docker-kubernetes/14-case-event-driven-kustomize-vs-helm.md) のサンプルです。

国際貨物輸送システム（Cargo Tracker）のイベント駆動マイクロサービス実装を、Kustomize と Helm の 2 つの手段でデプロイし比較します。

## アーキテクチャ

- **gatewayms**（8080）: Spring Cloud Gateway。`/api/...` を各サービスへルーティング
- **authms**（8081）/ **bookingms**（8082）/ **routingms**（8083）/ **trackingms**（8084）/ **handlingms**（8085）/ **billingms**（8086）: 業務マイクロサービス
- **frontend**: SPA（nginx）。`/api/` を gateway へプロキシ
- **PostgreSQL**: 1 インスタンスに 6 データベース（サービスごと）
- **RabbitMQ**: イベント連携（bookingms・trackingms）

## 構成

| パス | 内容 |
|------|------|
| `backend/` | バックエンドのソース（Gradle マルチプロジェクト: shared + 7 サービス） |
| `frontend/` | フロントエンドのソース（Vite + nginx） |
| `ops/postgres/init-databases.sql` | 6 データベースの初期化 SQL |
| `k8s/kustomize/base/` | Kustomize マニフェスト |
| `helm/cargo-event/` | Helm チャート |

`tmp` は Git 管理外のため、ビルドに必要なソースを同梱しています。

## イメージのビルド

```bash
# バックエンド（Gradle マルチプロジェクトを一括ビルド → 各サービスをイメージ化）
cd apps/case-studies/case-2-event-driven/backend
./gradlew bootJar -x test
for s in gatewayms authms bookingms routingms trackingms handlingms billingms; do
  docker build -t "cargo2-$s:0.0.1" "$s"
done
# フロントエンド
cd ../frontend && docker build -t cargo2-frontend:0.0.1 .
```

## Docker Compose で起動

Kubernetes を使わず単一ホストで全体を起動する場合は Docker Compose を使います。パスワードはファイルベースの `secrets` で注入します（第 4 章スタイル）。

```bash
cd apps/case-studies/case-2-event-driven/compose
cp secrets/db_password.example secrets/db_password   # 初回のみ
docker compose up -d
curl http://localhost:9080/actuator/health   # gateway => {"status":"UP"}
curl http://localhost:9090/                   # frontend
docker compose down -v
```

## Kustomize でデプロイ

```bash
kubectl apply -k apps/case-studies/case-2-event-driven/k8s/kustomize/base
kubectl -n cargo-event get pods
kubectl -n cargo-event port-forward svc/gatewayms 18090:8080
curl http://localhost:18090/actuator/health   # => {"status":"UP"}
```

## Helm でデプロイ

```bash
helm install cargo-event apps/case-studies/case-2-event-driven/helm/cargo-event \
  --namespace cargo-event --create-namespace
kubectl -n cargo-event get pods
# アンインストール
helm uninstall cargo-event -n cargo-event
```

## 比較の観点

| 観点 | Kustomize | Helm |
|------|-----------|------|
| 重複排除 | パッチで共通化（サービスごとにファイルが必要） | テンプレートのループで 1 定義に集約 |
| パラメータ化 | overlay でフィールド上書き | `values.yaml` + `--set` |
| 配布 | Git リポジトリ | チャートのパッケージ配布（リポジトリ） |
| リリース管理 | なし（kubectl apply） | リビジョン管理・ロールバック |

詳細は第 14 章の記事を参照してください。
