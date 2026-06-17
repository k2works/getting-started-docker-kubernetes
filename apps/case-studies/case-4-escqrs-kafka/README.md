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

## Docker Compose で起動

Kubernetes を使わず単一ホストで全体を起動する場合は Docker Compose を使います。パスワード・JWT はファイルベースの `secrets` で注入します（第 4 章スタイル）。

```bash
cd apps/case-studies/case-4-escqrs-kafka/compose
cp secrets/db_password.example secrets/db_password   # 初回のみ
cp secrets/jwt_secret.example  secrets/jwt_secret     # 初回のみ
docker compose up -d
curl http://localhost:9082/actuator/health        # gateway => {"status":"UP"}
curl http://localhost:9082/api/v1/bookings        # read エンドポイント => 200
curl http://localhost:9092/                        # frontend
docker compose down -v
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

## シードデータの動作確認

デモ用シードは各 ms の `DevDataSeeder` が投入します。`dev-seed` プロファイルで発火し、荷主 3・予約 3 を Kafka/ES 経由で登録します（読み取りモデル `cargo_summary` への投影は非同期のため数秒待ちます）。固定 ID で既存チェックする冪等実装のため、Pod 再起動でも重複しません。

`dev-seed` は **`overlays/local`（および Helm の既定 `values.yaml`）でのみ**有効です。本番想定の `overlays/prod` は `local-docker` のみのためシードされません（Helm で本番投入する場合は `--set config.springProfilesActive=local-docker` で無効化）。

```bash
# 投入ログの確認（任意）
kubectl -n cargo-tracker logs deploy/bookingms | grep -i seed

# ① DB で確認（postgresql は StatefulSet → pod 名は postgresql-0、投影完了まで数秒待つ）
kubectl -n cargo-tracker exec postgresql-0 -- \
  psql -U cargo -d booking_read_db -c "SELECT count(*) FROM cargo_summary;"   # => 3

# ② REST API で確認（NodePort 30080 または port-forward、要ログイン: admin / password）
kubectl -n cargo-tracker port-forward svc/gatewayms 18080:8080
TOKEN=$(curl -s -X POST http://localhost:18080/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"username":"admin","password":"password"}' | jq -r '.token // .accessToken')
curl -s http://localhost:18080/api/v1/bookings -H "Authorization: Bearer $TOKEN"   # 3 件
```

## ロギング基盤（EFK + DaemonSet）

[第 9 章 コンテナの運用](../../../docs/article/getting-start-docker-kubernetes/09-container-operations.md) のパターンに沿って、ログ集約基盤 **EFK（Elasticsearch + Fluentd + Kibana）** を `base` に同梱しています（`k8s/base/logging/`、local/prod 両 overlay に適用）。各 Pod は標準出力にログを出し、**Fluentd を DaemonSet として各ノードに常駐**させてノード上の全コンテナのログを収集、Elasticsearch に蓄積し、Kibana で可視化します。

- **Elasticsearch**（単一ノード）: ログの蓄積・検索。PVC で永続化
- **Fluentd**（DaemonSet）: `/var/log/containers` を収集して ES へ転送。containerd の CRI ログ形式に対応
- **Kibana**（NodePort 30054）: ログの検索・可視化 UI
- **kibana-setup**（Job）: index pattern `logstash-*` を自動作成し、既定ビューを Discover に設定（手動設定不要）

```bash
# ロギング基盤はアプリと同時にデプロイされる（kubectl apply -k k8s/overlays/local）
kubectl -n cargo-tracker get pods -l app.kubernetes.io/component=logging
kubectl -n cargo-tracker exec deploy/elasticsearch -- curl -s 'http://localhost:9200/logstash-*/_count'
# Kibana を開く（kind 等では NodePort が localhost に出ないため port-forward が確実）
kubectl -n cargo-tracker port-forward svc/kibana 18081:5601   # → http://localhost:18081/（開くと Discover が表示される）
#   ※ NodePort が localhost に出る環境では http://localhost:30054/ でも可
```

> 学習・ローカル検証用の単一ノード構成です（ES のセキュリティは無効）。本番では認証・冗長化・リソース調整を行ってください。

## 比較の観点

case-4 は Kustomize に **overlay（base/overlays）** を、Helm に **`_helpers.tpl` による命名・ラベルの共通化**を備えた、より実運用に近い構成です。詳細は第 16 章の記事を参照してください。
