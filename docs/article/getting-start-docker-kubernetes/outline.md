# 執筆計画アウトライン

## 概要

「Docker/Kubernetes 実践コンテナ解説」シリーズの執筆計画。書籍『Docker/Kubernetes 実践コンテナ開発入門（第 2 版）』の章立て（`tmp/index.md`）を解説記事として再構成し、各章を実際に動作するサンプルコードに紐づけて解説する。

アルゴリズム入門シリーズ（`getting-started-algorithm`）の `outline.md` の方針を踏襲し、章とソースの対応を明確にしたうえで、読者が手を動かしながら理解できる構成にする。

## 執筆方針

### 実コード紐づけ方式

すべての解説は実在のサンプルコードに紐づける。コードを引用するときは出典（パス）を明示し、存在しないコマンドや設定を捏造しない。中心となるサンプルは本リポジトリの `apps/` 配下に実装を配置し、実機で動作検証している。書籍リポジトリの一部（pipecd-examples / cloudshell / gihyo-docker-kuberbetes）は `apps/` には収録せず、補助参照として扱う。

### apps/ 配下に配置するサンプル

- **echo**（`apps/echo/`）— 単一コンテナの最小サンプル（Go 製の Hello サーバ）。第 1〜2 章、第 5 章、第 8 章、第 10 章で利用
- **taskapp**（`apps/taskapp/`）— 複数コンテナ構成のタスク管理アプリ（api / web / mysql / migrator / nginx）。第 3〜4 章、第 6 章、第 9 章で利用
- **container-kit**（`apps/container-kit/`）— デバッグ・プロキシ・ジョブ用の補助コンテナ集。第 7 章、第 12 章、付録 C で利用
- **image-bootstrap**（`apps/image-bootstrap/`）— distroless + 非 root + Trivy によるセキュアイメージのサンプル。第 10 章、付録 C で利用
- **echo-bootstrap**（`apps/cd/echo-bootstrap/`）— echo を Kubernetes へデプロイする Kustomize マニフェスト。第 6 章、第 11 章で利用
- **argocd-example-apps**（`apps/cd/argocd-example-apps/`）— Argo CD 用のサンプルアプリ（guestbook、helm、kustomize、blue-green）。第 11 章で利用

### 補助参照（apps/ には収録しない書籍リポジトリ）

- **pipecd-examples** — PipeCD 用のデプロイ定義（canary、bluegreen、analysis など）。第 11 章で利用
- **cloudshell** — AWS（EKS / ECS）構築スクリプトと CDK。付録 B で利用
- **gihyo-docker-kuberbetes** — 書籍のサンプルコード（simple-pod/replicaset/deployment/service/ingress、Helm チャートなど）。第 5 章、第 7〜10 章の補助参照

### 文体・表記

- 言語: 日本語（技術用語は英語のまま）
- 文体: ですます調、句読点は「。」「、」
- 日本語と半角英数字の間には半角スペースを入れる
- コードブロックには言語識別子（`dockerfile` `yaml` `bash` `go` など）を付ける
- 各章は「はじめに → 概念解説 → ハンズオン → まとめ」の流れを基本とする

## 章とソースの対応

| 章 | ファイル | テーマ | 主な参考ソース |
|----|---------|--------|---------------|
| 第 1 章 | `01-container-and-docker-basics.md` | コンテナと Docker の基礎 | `apps/echo/Dockerfile`, `apps/container-kit/containers/` |
| 第 2 章 | `02-container-deployment.md` | コンテナのデプロイ | `apps/echo/` (main.go, Dockerfile, compose.yaml) |
| 第 3 章 | `03-practical-container-build-deploy.md` | 実用的なコンテナの構築とデプロイ | `apps/echo/Dockerfile.slim`, `apps/taskapp/containers/` |
| 第 4 章 | `04-multi-container-application.md` | 複数コンテナ構成でのアプリケーション構築 | `apps/taskapp/` (compose.yaml, containers, Tiltfile) |
| 第 5 章 | `05-kubernetes-introduction.md` | Kubernetes 入門 | `gihyo-docker-kuberbetes/ch05/simple-*.yaml`, `apps/echo/k8s` |
| 第 6 章 | `06-kubernetes-deploy-cluster.md` | Kubernetes のデプロイ・クラスタ構築 | `apps/taskapp/k8s/plain/local/`, `apps/cd/echo-bootstrap/` |
| 第 7 章 | `07-kubernetes-advanced.md` | Kubernetes の発展的な利用 | `apps/container-kit/containers/time-limit-job`, `gihyo*/ch09` |
| 第 8 章 | `08-kubernetes-packaging.md` | Kubernetes アプリケーションのパッケージング | `apps/taskapp/k8s/kustomize/`, `gihyo*/ch07`, `apps/cd/argocd-example-apps/helm-guestbook` |
| 第 9 章 | `09-container-operations.md` | コンテナの運用 | `apps/taskapp/containers/nginx-*`, `apps/taskapp/containers/mysql` |
| 第 10 章 | `10-optimal-container-image.md` | 最適なコンテナイメージ作成と運用 | `apps/echo/Dockerfile.slim`, `apps/image-bootstrap/` |
| 第 11 章 | `11-continuous-delivery.md` | コンテナにおける継続的デリバリー | `apps/cd/argocd-example-apps/`, `pipecd-examples/`, `apps/cd/echo-bootstrap/` |
| 第 12 章 | `12-container-use-cases.md` | コンテナのさまざまな活用方法 | `apps/container-kit/`, `gihyo*/chA` |
| 付録 A | `appendix-a-dev-tools-setup.md` | 開発ツールのセットアップ | `apps/taskapp/.tool-versions`, `apps/taskapp/hack/` |
| 付録 B | `appendix-b-orchestration-environments.md` | さまざまなコンテナオーケストレーション環境 | `cloudshell/aws/`, `apps/taskapp/k8s/plain/aks`, `pipecd-examples/ecs` |
| 付録 C | `appendix-c-tips.md` | コンテナ開発・運用の Tips | `apps/container-kit/`, `apps/image-bootstrap/trivy.yaml` |

## ファイル構成

```
docs/article/getting-start-docker-kubernetes/
├── index.md                                  # 記事トップページ（目次）
├── outline.md                                # 本ファイル（執筆計画）
├── 01-container-and-docker-basics.md         # 第 1 章
├── 02-container-deployment.md                # 第 2 章
├── 03-practical-container-build-deploy.md    # 第 3 章
├── 04-multi-container-application.md         # 第 4 章
├── 05-kubernetes-introduction.md            # 第 5 章
├── 06-kubernetes-deploy-cluster.md          # 第 6 章
├── 07-kubernetes-advanced.md                # 第 7 章
├── 08-kubernetes-packaging.md               # 第 8 章
├── 09-container-operations.md               # 第 9 章
├── 10-optimal-container-image.md            # 第 10 章
├── 11-continuous-delivery.md                # 第 11 章
├── 12-container-use-cases.md                # 第 12 章
├── appendix-a-dev-tools-setup.md            # 付録 A
├── appendix-b-orchestration-environments.md # 付録 B
└── appendix-c-tips.md                        # 付録 C
```

## 構成方針

書籍の 12 章 + 付録 3 章構成をそのまま維持する。各部のねらいは以下のとおり。

### 第 1 部: コンテナと Docker（第 1〜3 章）

コンテナの概念、Docker の基本操作、実用的なイメージ構築までを学ぶ。

| 章 | テーマ | 内容 |
|----|--------|------|
| 1 | コンテナと Docker の基礎 | コンテナとは、Docker とは、利用意義、ローカル実行環境の構築 |
| 2 | コンテナのデプロイ | アプリの実行、イメージ作成、イメージ・コンテナの操作、Docker Compose |
| 3 | 実用的なコンテナの構築とデプロイ | 粒度、ポータビリティ、コンテナフレンドリ、クレデンシャル、永続化 |

### 第 2 部: 複数コンテナと Kubernetes 入門（第 4〜6 章）

複数コンテナ構成のアプリ構築と Kubernetes の基礎・デプロイを学ぶ。

| 章 | テーマ | 内容 |
|----|--------|------|
| 4 | 複数コンテナ構成でのアプリケーション構築 | Web/API/MySQL/マイグレータ/リバースプロキシ、Tilt |
| 5 | Kubernetes 入門 | Kubernetes とは、ローカル実行、Pod/ReplicaSet/Deployment/Service/Ingress |
| 6 | Kubernetes のデプロイ・クラスタ構築 | タスクアプリのデプロイ、インターネット公開 |

### 第 3 部: Kubernetes の実践（第 7〜9 章）

発展的な利用、パッケージング、運用を学ぶ。

| 章 | テーマ | 内容 |
|----|--------|------|
| 7 | Kubernetes の発展的な利用 | デプロイ戦略、CronJob、RBAC |
| 8 | Kubernetes アプリケーションのパッケージング | Kustomize、Helm |
| 9 | コンテナの運用 | ロギング、可用性の高い運用 |

### 第 4 部: イメージ最適化と継続的デリバリー（第 10〜12 章）

イメージ最適化、CD パイプライン、応用的な活用方法を学ぶ。

| 章 | テーマ | 内容 |
|----|--------|------|
| 10 | 最適なコンテナイメージ作成と運用 | 軽量ベースイメージ、Multi-stage builds、BuildKit、セキュリティ |
| 11 | コンテナにおける継続的デリバリー | Flux、Argo CD、PipeCD |
| 12 | コンテナのさまざまな活用方法 | 開発環境統一、CLI、負荷テスト |

### 付録（App.A〜C）

| 付録 | テーマ | 内容 |
|------|--------|------|
| A | 開発ツールのセットアップ | WSL2、asdf、kind、Rancher Desktop |
| B | さまざまなコンテナオーケストレーション環境 | GKE、EKS、AKS、オンプレミス、ECS |
| C | コンテナ開発・運用の Tips | コンテナランタイム、Kubernetes Tips、生成 AI 活用、apk |

## 参考文献

- 『Docker/Kubernetes 実践コンテナ開発入門（第 2 版）』 — 山田明憲
- 各章のサンプルコード（`apps/` 配下に配置。一部は書籍リポジトリの補助参照）
