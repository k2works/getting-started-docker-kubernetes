# ケーススタディ 3: ES/CQRS マイクロサービス（Axon、Kustomize 対 Helm）

[第 15 章 ES/CQRS マイクロサービス（Axon）のデプロイ](../../../docs/article/getting-start-docker-kubernetes/15-case-escqrs-axon-kustomize-vs-helm.md) のサンプルです。

国際貨物輸送システム（Cargo Tracker）を **Axon Framework によるイベントソーシング / CQRS** で実装した版を、Kustomize と Helm の 2 つの手段でデプロイし比較します。

## アーキテクチャ

case-2（イベント駆動）との最大の違いは、サービス間連携の基盤が **RabbitMQ ではなく Axon Server**（イベントストア兼メッセージルーター）である点です。

- **gatewayms**（8080）: API ゲートウェイ
- **authms**（8081）: 認証（JWT 発行）。DB のみ
- **bookingms**（8082）/ **routingms**（8083）/ **handlingms**（8085）/ **trackingms**（8086）/ **billingms**（8087）: ES/CQRS マイクロサービス（Axon Server を利用）
- **Axon Server**（8124 gRPC / 8024 HTTP）: イベントストア・コマンド/イベントのルーティング（standalone + DCB）
- **PostgreSQL**: 1 インスタンスに 6 read DB（CQRS の Read 側）
- **frontend**: SPA（nginx）

## 構成

| パス | 内容 |
|------|------|
| `backend/` | バックエンドのソース（Gradle Kotlin DSL マルチプロジェクト: shared + 7 サービス） |
| `frontend/` | フロントエンドのソース（Vite + nginx、k8s 用 `Dockerfile`・`nginx.k8s.conf` を追加） |
| `ops/postgres/init-databases.sh` | `POSTGRES_MULTIPLE_DATABASES` による複数 DB 初期化 |
| `k8s/kustomize/base/` | Kustomize マニフェスト |
| `helm/cargo-axon/` | Helm チャート |

`tmp` は Git 管理外のため、ビルドに必要なソースを同梱しています。

## イメージのビルド

バックエンドの各サービス Dockerfile はマルチステージ（コンテナ内で Gradle ビルド）です。

```bash
cd apps/case-studies/case-3-escqrs-axon/backend
for s in gatewayms authms bookingms routingms trackingms handlingms billingms; do
  docker build -t "cargo3-$s:0.0.1" -f "$s/Dockerfile" .
done
cd ../frontend && docker build -t cargo3-frontend:0.0.1 .
```

## Docker Compose で起動

Kubernetes を使わず単一ホストで全体を起動する場合は Docker Compose を使います。機密は `.env` で注入します。

```bash
cd apps/case-studies/case-3-escqrs-axon/compose
cp .env.example .env        # 初回のみ
docker compose up -d
curl http://localhost:8024/actuator/health   # Axon Server
curl http://localhost:9081/actuator/health   # gateway => {"status":"UP"}
curl http://localhost:9091/                   # frontend
docker compose down -v
```

## Kustomize でデプロイ

```bash
kubectl apply -k apps/case-studies/case-3-escqrs-axon/k8s/kustomize/base
kubectl -n cargo-axon get pods
kubectl -n cargo-axon port-forward svc/gatewayms 18090:8080
curl http://localhost:18090/actuator/health   # => {"status":"UP"}
```

## Helm でデプロイ

```bash
helm install cargo-axon apps/case-studies/case-3-escqrs-axon/helm/cargo-axon \
  --namespace cargo-axon --create-namespace
helm uninstall cargo-axon -n cargo-axon
```

## 比較の観点

case-2 と同じく Kustomize 対 Helm ですが、ステートフルなインフラ（Axon Server）が加わることで、両手段が「アプリ群の繰り返し」と「特別な単発インフラ」をどう書き分けるかが論点になります。詳細は第 15 章の記事を参照してください。
