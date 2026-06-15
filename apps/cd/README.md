# cd — 継続的デリバリー（GitOps）サンプル

[第 11 章 コンテナにおける継続的デリバリー](../../docs/article/getting-start-docker-kubernetes/11-continuous-delivery.md) で解説する GitOps のサンプルを配置しています。

## 構成

| パス | 内容 |
|------|------|
| `application-guestbook.yaml` | Argo CD の `Application`（GitOps の同期定義）。公開リポジトリ `argocd-example-apps` の `guestbook` を同期対象にする |
| `echo-bootstrap/` | GitOps で配信する echo の Kustomize マニフェスト一式（namespace / deployment / service / ingress） |
| `argocd-example-apps/` | Argo CD 用サンプル（guestbook / kustomize-guestbook / helm-guestbook / sync-waves / pre-post-sync / blue-green） |

## Argo CD のセットアップ

```bash
# Argo CD をインストール
kubectl create namespace argocd
kubectl apply -n argocd -f https://raw.githubusercontent.com/argoproj/argo-cd/stable/manifests/install.yaml

# 初期 admin パスワードの取得
kubectl -n argocd get secret argocd-initial-admin-secret \
  -o jsonpath='{.data.password}' | base64 -d; echo

# Web UI へアクセス（別ターミナル）
kubectl -n argocd port-forward svc/argocd-server 8080:443
# https://localhost:8080 （ユーザー名: admin）
```

## GitOps 同期の実行

```bash
# Application を適用すると、Argo CD が Git から pull してクラスタへ反映する
kubectl apply -f application-guestbook.yaml

# 同期状態の確認
kubectl -n argocd get application guestbook
# SYNC STATUS = Synced / HEALTH = Healthy になれば成功

# デプロイされたリソース（Git から自動生成）
kubectl -n guestbook get deploy,svc,pods
```

## 動作検証結果

Docker Desktop（Kubernetes / Argo CD v3.4.3）で実施した検証結果です。

| 検証内容 | 結果 |
|---------|------|
| Argo CD のインストール（全コンポーネント起動） | OK |
| `Application` 適用による GitOps 同期（Git → クラスタ） | OK（sync=Synced / health=Healthy、`guestbook-ui` がデプロイ） |
| デプロイされたアプリの HTTP 応答 | OK（HTTP 200、`<title>Guestbook</title>`） |
| **self-heal（自己修復）**: Deployment を手動削除 → Git の状態へ自動復元 | OK（drift を OutOfSync として検知し再同期、`guestbook-ui` を再生成して Synced/Healthy に回復） |

### 検証メモ

- self-heal は Argo CD の再照合（reconciliation）周期で drift を検知して動作します。本検証環境（Docker Desktop）ではクラスタ DNS（CoreDNS）が断続的に解決失敗する事象があり、repo-server が GitHub へ到達できず再照合が一時停滞しました。CoreDNS と Argo CD コンポーネント（repo-server / application-controller）を再起動して DNS 接続を回復させることで、drift 検知 → 自動復元が正常に完了しました。これは環境固有のネットワーク事象であり、Argo CD のロジックの問題ではありません。
- `echo-bootstrap/` を自前リポジトリの GitOps 対象にする場合は、`application-guestbook.yaml` の `repoURL` を当該リポジトリの URL に、`path` を `apps/cd/echo-bootstrap` に変更してください（クラスタからその Git リポジトリへ到達できる必要があります）。
