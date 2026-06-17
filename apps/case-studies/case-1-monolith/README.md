# ケーススタディ 1: モノリス（Docker Compose 対 Kustomize）

[第 13 章 モノリスのデプロイ](../../../docs/article/getting-start-docker-kubernetes/13-case-monolith-compose-vs-kustomize.md) のサンプルです。

国際貨物輸送システム（Cargo Tracker）のモノリス実装（Spring Boot + PostgreSQL）を、Docker Compose と Kustomize の 2 つの手段でデプロイし比較します。

## 構成

| パス | 内容 |
|------|------|
| `cargo-tracker/` | アプリ本体のソース（Spring Boot 4 / Java 25、`tmp/case-1` 由来） |
| `compose/compose.yaml` | Docker Compose 構成（app + postgres） |
| `k8s/kustomize/` | Kustomize マニフェスト（namespace / secret / postgres / app / ingress） |

再現性のためアプリ本体のソースを同梱しています。デプロイ用イメージはこのソースからビルドします。

## アプリイメージのビルド

```bash
docker build -t cargo-tracker:0.0.1 apps/case-studies/case-1-monolith/cargo-tracker
```

Docker Compose を使う場合は `compose.yaml` の `build` 設定により初回 `up` 時に自動ビルドされます。

## Docker Compose で起動

パスワードは `environment` に直書きせず、ファイルベースの `secrets` で注入します（第 4 章のタスクアプリと同じ方式）。初回のみ機密ファイルを作成します（`secrets/db_password` は `.gitignore` 済み）。

```bash
cd apps/case-studies/case-1-monolith/compose
cp secrets/db_password.example secrets/db_password   # 初回のみ
docker compose up -d
# アプリ起動後（actuator が healthy になるまで待つ）
curl http://localhost:18080/actuator/health    # => {"status":"UP"}
docker compose down -v
```

## Kustomize で Kubernetes にデプロイ

```bash
kubectl apply -k apps/case-studies/case-1-monolith/k8s/kustomize
kubectl -n cargo-monolith get pods
kubectl -n cargo-monolith port-forward svc/cargo-tracker 18080:80
curl http://localhost:18080/actuator/health    # => {"status":"UP"}
```

## シードデータの動作確認

デモ用シードは Flyway マイグレーション `V16__seed_demo_data.sql` で投入されます。Flyway は profile=`product` の k8s でも自動適用されるため、デプロイ直後から荷主 3・貨物 8（経路区間付き）が存在します。

```bash
# ① DB で確認（最も確実）
kubectl -n cargo-monolith exec deploy/postgres -- \
  psql -U cargo_tracker -d cargo_tracker -c \
  "SELECT booking_status, count(*) FROM cargo GROUP BY booking_status ORDER BY 1;"
#   => CONFIRMED 3 / PRELIMINARY 3 / ROUTE_PROPOSED 2

# ② REST API で確認（port-forward 中）
curl http://localhost:18080/api/v1/bookings    # 8 件の貨物が返る
```

## 比較の観点

| 観点 | Docker Compose | Kustomize |
|------|----------------|-----------|
| 対象 | 単一ホストのコンテナ群 | Kubernetes クラスタ |
| 記述 | 1 ファイルにまとまる | リソース種別ごとに分割 |
| 環境差分 | `.env` / override ファイル | base + overlay |
| 永続化 | named volume | PVC |
| 公開 | ポート公開 | Service + Ingress |

詳細な比較考察は第 13 章の記事を参照してください。
