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

Kubernetes を使わず単一ホストで全体を起動する場合は Docker Compose を使います。パスワード・JWT はファイルベースの `secrets` で注入します（第 4 章スタイル）。

```bash
cd apps/case-studies/case-3-escqrs-axon/compose
cp secrets/db_password.example secrets/db_password   # 初回のみ
cp secrets/jwt_secret.example  secrets/jwt_secret     # 初回のみ
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

## シードデータの動作確認

デモ用シードは `DemoDataSeeder` が投入します。k8s の `local-docker` プロファイルで起動時に発火し、荷主 5・予約 5 を Axon コマンド経由で登録します（読み取りモデル `cargo_summary` への投影は非同期のため数秒待ちます）。`cargo_summary` に既存データがあれば予約投入をスキップするため、Pod 再起動でも重複しません。

```bash
# 投入ログの確認（任意）
kubectl -n cargo-axon logs deploy/bookingms | grep '\[seed\]'

# ① DB で確認（投影完了まで数秒待つ）
kubectl -n cargo-axon exec deploy/postgres -- \
  psql -U cargo -d booking_read_db -c "SELECT count(*) FROM cargo_summary;"   # => 5

# ② REST API で確認（要ログイン: admin / password）
kubectl -n cargo-axon port-forward svc/gatewayms 18090:8080
TOKEN=$(curl -s -X POST http://localhost:18090/api/v1/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"username":"admin","password":"password"}' | jq -r '.token // .accessToken')
curl -s http://localhost:18090/api/v1/bookings -H "Authorization: Bearer $TOKEN"   # 5 件
```

## ロギング基盤（EFK + DaemonSet）

[第 9 章 コンテナの運用](../../../docs/article/getting-start-docker-kubernetes/09-container-operations.md) のパターンに沿って、ログ集約基盤 **EFK（Elasticsearch + Fluentd + Kibana）** を同梱しています（`k8s/kustomize/base/logging/`）。各 Pod は標準出力にログを出し、**Fluentd を DaemonSet として各ノードに常駐**させてノード上の全コンテナのログを収集、Elasticsearch に蓄積し、Kibana で可視化します。

- **Elasticsearch**（単一ノード）: ログの蓄積・検索。PVC で永続化
- **Fluentd**（DaemonSet）: `/var/log/containers` を収集して ES へ転送。containerd の CRI ログ形式に対応
- **Kibana**（NodePort 30053）: ログの検索・可視化 UI
- **kibana-setup**（Job）: index pattern `logstash-*` を自動作成し、既定ビューを Discover に設定（手動設定不要）

```bash
# ロギング基盤はアプリと同時にデプロイされる（kubectl apply -k k8s/kustomize/base）
kubectl -n cargo-axon get pods -l app.kubernetes.io/component=logging
kubectl -n cargo-axon exec deploy/elasticsearch -- curl -s 'http://localhost:9200/logstash-*/_count'
# Kibana を開く（kind 等では NodePort が localhost に出ないため port-forward が確実）
kubectl -n cargo-axon port-forward svc/kibana 18081:5601   # → http://localhost:18081/（開くと Discover が表示される）
#   ※ NodePort が localhost に出る環境では http://localhost:30053/ でも可
```

> 学習・ローカル検証用の単一ノード構成です（ES のセキュリティは無効）。本番では認証・冗長化・リソース調整を行ってください。

## Axon Server ダッシュボード

イベントストア兼コマンド/イベントルーターである Axon Server には Web ダッシュボード（HTTP ポート 8024）が付属し、登録コマンド・イベントの流量、接続中のアプリケーション、保存イベント数などを確認できます。port-forward でアクセスします。

```bash
kubectl -n cargo-axon port-forward svc/axonserver 18082:8024
#   → http://localhost:18082/   （Overview / Commands / Queries / Events を確認可能）
```

> 本構成は `AXONIQ_AXONSERVER_DEVMODE_ENABLED=true` の開発モード（認証なし）です。`npx gulp k8s:case3:open` ではアプリ・Kibana とあわせて自動で開きます。

## DB 管理（Adminer）

PostgreSQL（CQRS の Read 側 DB）を Web UI で操作できる **Adminer** を同梱しています（`k8s/kustomize/base/adminer.yaml`）。`booking_read_db` などの Read Model や `auth_db` を閲覧できます（書き込み側のイベントは Axon Server ダッシュボードで確認）。

```bash
kubectl -n cargo-axon port-forward svc/adminer 18083:8080
#   → http://localhost:18083/
```

| 項目 | 値 |
| :--- | :--- |
| System | PostgreSQL |
| Server | postgres |
| Username / Password | cargo / cargo-dev-password |
| Database | booking_read_db 等（auth_db / *_read_db） |

> `npx gulp k8s:case3:open` ではアプリ・Kibana・Axon Server とあわせて自動で開きます。

## 比較の観点

case-2 と同じく Kustomize 対 Helm ですが、ステートフルなインフラ（Axon Server）が加わることで、両手段が「アプリ群の繰り返し」と「特別な単発インフラ」をどう書き分けるかが論点になります。詳細は第 15 章の記事を参照してください。
