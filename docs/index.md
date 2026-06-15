# プロジェクトドキュメント

プロジェクトで管理しているドキュメントの入口です。

## まずこれを読もうリスト

mkdocs のナビゲーションと同じ構成です。

- [戦略](./strategy/index.md) - ビジネス構造やプロジェクトの方向性を整理します。
- [要件](./requirements/index.md) - RDRA 2.0 ベースで要件を定義します。
- [設計](./design/index.md) - アーキテクチャ、モデル、品質方針を整理します。
- [開発](./development/index.md) - リリース計画とイテレーション管理の入口です。
- [運用](./operation/index.md) - 環境構築、デプロイ、運用コマンドの入口です。
- [レビュー](./review/index.md) - 分析・開発レビュー結果の記録です。
- [ADR](./adr/index.md) - アーキテクチャ上の意思決定記録です。
- [記事](./article/index.md) - 学習用の記事シリーズの入口です。
- [リファレンス](./reference/index.md) - 開発ガイドラインやベストプラクティスです。
- [テンプレート](./template/index.md) - 各種ドキュメントの作成テンプレートです。

## ドキュメント構成

| カテゴリ | 概要                                  | 状況 |
| :--- |:------------------------------------| :--- |
| [戦略](./strategy/index.md) | 企業分析、経営戦略、ビジネスアーキテクチャ、インセプションデッキの整理 | `index.md` を整備済み |
| [要件](./requirements/index.md) | RDRA 2.0 とユースケース整理の入口               | `index.md` を整備済み |
| [設計](./design/index.md) | アーキテクチャ、モデル、テスト、非機能の整理              | `index.md` を整備済み |
| [開発](./development/index.md) | リリース計画、イテレーション計画、進捗管理               | `index.md` を整備済み |
| [運用](./operation/index.md) | 環境構築、デプロイ、運用コマンド（`dev:*` / `k8s:*`）の整理 | `index.md`・運用コマンドリファレンスを整備済み |
| [レビュー](./review/index.md) | 分析・開発レビュー結果の記録                      | `index.md` を整備済み |
| [ADR](./adr/index.md) | Architecture Decision Records の管理   | `index.md` を整備済み |
| [記事](./article/index.md) | 学習用の記事シリーズ一覧                        | Docker/Kubernetes 実践コンテナ解説を整備済み |
| [リファレンス](./reference/index.md) | 開発ガイドラインやベストプラクティス                  | 30 件のドキュメントを配置 |
| [テンプレート](./template/index.md) | 各種ドキュメントの作成テンプレート                   | 18 件のテンプレートを配置 |

## 主なサブページ

mkdocs ナビゲーションに登録している主要なドキュメントです。

- 運用
    - [運用コマンドリファレンス](./operation/運用コマンドリファレンス.md) - `dev:*`（アプリ起動）・`k8s:*`（Kubernetes デプロイ）の Gulp タスク一覧
- 記事
    - [Docker/Kubernetes 実践コンテナ解説](./article/getting-start-docker-kubernetes/index.md) - 基礎 12 章 + ケーススタディ 5 章 + 付録 3 章（[執筆計画](./article/getting-start-docker-kubernetes/outline.md)）
- リファレンス / テンプレート
    - 各ガイド・テンプレートは概要ページから個別ドキュメントへ辿れます。

## 補足

- `strategy/`、`requirements/`、`design/`、`development/`、`operation/` は現時点ではカテゴリ索引が中心です。
- `journal/` は作業ログ用の予約ディレクトリです。
- `assets/` は MkDocs 用のスタイル・スクリプトを格納しています。
