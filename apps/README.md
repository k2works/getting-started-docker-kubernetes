# apps — 章別サンプルアプリケーション

[Docker/Kubernetes 実践コンテナ解説](../docs/article/getting-start-docker-kubernetes/index.md) の各章で解説するサンプルコードを配置しています。書籍と同様に、少数のアプリケーションを複数の章にまたがって育てていく構成です。

## サンプル一覧と対応する章

| ディレクトリ | 内容 | 対応する章 |
|-------------|------|-----------|
| [`echo/`](echo/) | 単一コンテナの最小サンプル（Go 製の Hello サーバ）。素朴な Dockerfile・multi-stage + distroless 版・Compose・Kubernetes マニフェストを含む | 第 1・2・5・8・10 章 |
| [`taskapp/`](taskapp/) | 複数コンテナ構成のタスク管理アプリ（web / api / mysql / migrator / nginx）。Compose と Kubernetes マニフェストを含む | 第 3・4・6・9 章 |
| [`container-kit/`](container-kit/) | 補助コンテナ集（debug / simple-nginx-proxy / time-limit-job） | 第 7・12 章、付録 C |
| [`image-bootstrap/`](image-bootstrap/) | distroless + 非 root + Trivy を用いたセキュアイメージのサンプル | 第 10 章、付録 C |
| [`cd/`](cd/) | 継続的デリバリー（GitOps）のサンプル。Argo CD の `Application`、echo-bootstrap、argocd-example-apps | 第 11 章 |

## 前提ツール

- Docker（Docker Desktop など）
- Kubernetes クラスタ（Docker Desktop 内蔵 / kind / minikube など）
- kubectl、helm

## 各サンプルの起動方法

### echo（第 1・2・5・10 章）

```bash
cd apps/echo

# 素朴な Dockerfile でビルド・実行（go run 版）
docker build -t echo:local .
docker run --rm -p 8080:8080 echo:local
curl http://localhost:8080/        # => Hello Container!!

# multi-stage + distroless 版（第 10 章）
docker build -f Dockerfile.slim -t echo:slim .

# Docker Compose（echo + nginx リバースプロキシ、第 2 章）
docker compose up -d
curl -H 'Host: echo.gihyo.local' http://localhost:9000/   # => Hello Container!!
docker compose down
```

### echo を Kubernetes へ（第 5・8 章）

```bash
cd apps/echo/k8s/kustomize
kubectl apply -k .
kubectl port-forward svc/echo 8080:80
curl http://localhost:8080/        # => Hello Container!!

# Ingress 経由（ingress-nginx を helm で導入する例、第 8 章）
helm upgrade --install ingress-nginx ingress-nginx/ingress-nginx \
  --namespace ingress-nginx --create-namespace
curl -H 'Host: echo.gihyo.local' http://localhost/   # => Hello Container!!
```

### taskapp（第 3・4・6・9 章）

機密ファイル（`secrets/`、`api-config.yaml`）は `.gitignore` で除外されています。初回はセットアップスクリプトで生成します。

```bash
cd apps/taskapp
bash hack/setup-local.sh

# Docker Compose（第 4 章）
docker compose up -d
curl http://localhost:9280/                 # Web UI（タスク一覧）
curl -H 'Host: api' http://localhost:9180/healthz
docker compose down -v

# Kubernetes（第 6 章）— setup-local.sh の出力に従って Secret を作成してから適用
```

### container-kit（第 7・12 章、付録 C）

```bash
cd apps/container-kit
docker build -t debug:local containers/debug
docker build -t simple-nginx-proxy:local containers/simple-nginx-proxy
docker build -t time-limit-job:local containers/time-limit-job
docker run --rm -e EXECUTION_SECONDS=3 time-limit-job:local
```

### image-bootstrap（第 10 章、付録 C）

```bash
cd apps/image-bootstrap
docker build -t image-bootstrap:local .
docker run --rm -p 8080:8080 image-bootstrap:local
curl http://localhost:8080/        # => I'm image bootstrap
```

### cd — GitOps（第 11 章）

```bash
# Argo CD を導入
kubectl create namespace argocd
kubectl apply -n argocd -f https://raw.githubusercontent.com/argoproj/argo-cd/stable/manifests/install.yaml

# Application を適用すると Git から pull してデプロイされる
kubectl apply -f apps/cd/application-guestbook.yaml
kubectl -n argocd get application guestbook   # Synced / Healthy になる
kubectl -n guestbook get deploy,pods
```

詳細は [`cd/README.md`](cd/README.md) を参照してください。

## 動作検証結果

以下は Docker Desktop（Docker 29.5.3 / 内蔵 Kubernetes）で実施した検証結果です。

| サンプル | 検証内容 | 結果 |
|---------|---------|------|
| echo | `docker build` + `docker run` → HTTP 応答 | OK（`Hello Container!!`） |
| echo | multi-stage distroless 版のサイズ比較 | OK（**1.2GB → 46.8MB**） |
| echo | `docker compose up`（echo + nginx） | OK（`Host: echo.gihyo.local` で応答） |
| echo | Kubernetes（Deployment + Service） | OK（Pod 2/2 Running、port-forward で応答） |
| echo | Ingress（ingress-nginx を helm 導入） | OK（Host ヘッダでルーティング、未知 Host は 404） |
| taskapp | `docker compose build`（全 6 イメージ） | OK |
| taskapp | `docker compose up`（healthcheck で段階起動） | OK（全サービス healthy） |
| taskapp | DB マイグレーション（migrator） | OK（init / index_status / test_data 適用、7 件） |
| taskapp | Web→API→MySQL フルスタック疎通 | OK（Web UI にタスク一覧表示） |
| taskapp | Kubernetes（StatefulSet / Deployment / Job / Ingress） | OK（migrator Job Completed、Ingress で HTTP 200） |
| container-kit | debug / simple-nginx-proxy / time-limit-job ビルド | OK |
| container-kit | time-limit-job 実行 | OK（`EXECUTION_SECONDS=3` で 3 回ループ後終了） |
| image-bootstrap | distroless 非 root イメージのビルド・実行 | OK（`I'm image bootstrap`、46.9MB） |
| cd | Argo CD 導入 → `Application` で GitOps 同期 | OK（Synced/Healthy、guestbook デプロイ、HTTP 200） |
| cd | self-heal（Deployment 手動削除 → Git から自動復元） | OK（OutOfSync 検知後に再同期し復元） |

### 検証時に修正した点（オリジナルからの変更）

- **`echo/compose.yaml`**: `echo` サービスをリモートイメージ参照からローカルビルド（`Dockerfile.slim`）に変更し、自己完結させた。廃止された `version` 属性を削除。
- **`taskapp/compose.yaml`**: 廃止された `version` 属性を削除。
- **`container-kit/containers/debug/Dockerfile`**: ベースイメージを EOL の `ubuntu:23.10` から `ubuntu:24.04`（現行 LTS）に更新（旧版は apt リポジトリが利用不可）。
- **`container-kit/containers/time-limit-job/task.sh`**: CRLF 改行を LF に修正（Linux コンテナ内で `bash\r` エラーになるため）。`.gitattributes` でシェルスクリプトを LF 固定。
- **`image-bootstrap/Dockerfile`**: `go build` に `CGO_ENABLED=0` を追加（動的リンクだと `distroless/base-debian11` で GLIBC 不一致により起動失敗するため、静的リンクに変更）。
