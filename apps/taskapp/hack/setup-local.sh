#!/usr/bin/env bash
#
# Docker Compose / Kubernetes での taskapp 起動に必要なローカル機密ファイルを生成します。
# これらのファイルは .gitignore で除外されており、リポジトリにはコミットされません。
#
# 使い方:
#   bash hack/setup-local.sh
#
set -o errexit
set -o nounset
set -o pipefail

cd "$(dirname "$0")/.."

# パスワード（必要に応じて変更してください）
MYSQL_ROOT_PASSWORD="${MYSQL_ROOT_PASSWORD:-rootpass}"
MYSQL_USER_PASSWORD="${MYSQL_USER_PASSWORD:-taskapp_pass}"

# 1) Docker Compose 用の secrets ファイル
mkdir -p secrets
printf '%s' "$MYSQL_ROOT_PASSWORD" > secrets/mysql_root_password
printf '%s' "$MYSQL_USER_PASSWORD" > secrets/mysql_user_password
echo "created: secrets/mysql_root_password, secrets/mysql_user_password"

# 2) Docker Compose 用の api-config.yaml（テンプレートのパスワードを置換）
sed "s/^  password: .*/  password: ${MYSQL_USER_PASSWORD}/" api-config.yaml.example > api-config.yaml
echo "created: api-config.yaml"

cat <<EOF

セットアップ完了。次のコマンドで起動できます。

  # Docker Compose
  docker compose up -d

  # Kubernetes（Secret を作成してからマニフェストを適用）
  kubectl create namespace taskapp
  kubectl -n taskapp create secret generic mysql \\
    --from-literal=root_password=${MYSQL_ROOT_PASSWORD} \\
    --from-literal=user_password=${MYSQL_USER_PASSWORD}
  kubectl -n taskapp create secret generic api-config \\
    --from-file=api-config.yaml=api-config.yaml
  kubectl -n taskapp apply -f k8s/plain/local/mysql.yaml
  kubectl -n taskapp apply -f k8s/plain/local/api.yaml -f k8s/plain/local/web.yaml
  kubectl -n taskapp apply -f k8s/plain/local/migrator.yaml
EOF
