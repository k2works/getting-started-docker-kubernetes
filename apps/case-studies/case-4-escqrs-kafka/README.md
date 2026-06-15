# ケーススタディ 4: ES/CQRS マイクロサービス（Kafka、Kustomize 対 Helm）

[第 16 章 ES/CQRS マイクロサービス（Kafka）のデプロイ](../../../docs/article/getting-start-docker-kubernetes/16-case-escqrs-kafka-kustomize-vs-helm.md) のサンプルです。

国際貨物輸送システム（Cargo Tracker）を **Kafka をイベントバックボーンとした ES/CQRS** で実装した版を、Kustomize と Helm の 2 つの手段でデプロイし比較します。case-3（Axon）が専用のイベントストア（Axon Server）を使うのに対し、本ケースは汎用の **Kafka + ZooKeeper** を使います。

## アーキテクチャ

- **gatewayms**（8080）: API ゲートウェイ
- **authms**(8081)・**bookingms**(8082)・**routingms**(8083)・**trackingms**(8084)・**handlingms**(8085)・**billingms**: ES/CQRS マイクロサービス
- **frontendms**: SPA（nginx）
- **Kafka**（9092/29092）+ **ZooKeeper**: イベントストリーミング基盤
- **PostgreSQL**: read モデル用 DB

## 構成

| パス | 内容 |
|------|------|
| `backend/` | バックエンドのソース（Gradle マルチプロジェクト、Java 21） |
| `frontend/` | フロントエンドのソース（React + nginx） |
| `k8s/base/` | Kustomize ベース（kafka / zookeeper / postgresql / 7 サービス / frontendms / ingress） |
| `k8s/overlays/local/` | ローカル用オーバーレイ（gatewayms を NodePort 30080 に） |
| `k8s/overlays/prod/` | 本番用オーバーレイ |
| `helm/cargo-tracker/` | Helm チャート（`_helpers.tpl`・`microservices` ループ・`config`・`infra`） |

> 本ケースの Kustomize・Helm 資産は元プロジェクト（case-4）に実装済みのものを取り込んでいます。`tmp` は Git 管理外のため、ビルドに必要なソースも同梱しています。

## イメージのビルド

```bash
cd apps/case-studies/case-4-escqrs-kafka
for s in gatewayms authms bookingms routingms trackingms handlingms billingms; do
  docker build -t "cargo-tracker/$s:latest" -f "backend/$s/Dockerfile" backend
done
docker build -t cargo-tracker/frontendms:latest frontend
```

## Kustomize でデプロイ（overlay を使う）

```bash
kubectl apply -k apps/case-studies/case-4-escqrs-kafka/k8s/overlays/local
kubectl -n cargo-tracker get pods
```

## Helm でデプロイ

```bash
helm install cargo apps/case-studies/case-4-escqrs-kafka/helm/cargo-tracker \
  --namespace cargo-tracker --create-namespace
helm uninstall cargo -n cargo-tracker
```

## 比較の観点

case-4 は Kustomize に **overlay（base/overlays）** を、Helm に **`_helpers.tpl` による命名・ラベルの共通化**を備えた、より実運用に近い構成です。詳細は第 16 章の記事を参照してください。
