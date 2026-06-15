'use strict';

/**
 * Kubernetes デプロイタスク（ローカルクラスタ向け）
 *
 * apps/ 配下の各アプリケーションを Kustomize / Helm でローカル Kubernetes
 * （Docker Desktop / kind 等）へデプロイ・削除・状態確認する。
 * kubectl / helm のコンテキストは利用者の現在の設定に従う。
 */

import path from 'path';
import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { execSync, spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { openUrl, cleanDockerEnv } from './shared.js';

// ============================================
// 設定
// ============================================

/** リポジトリルート（ops/scripts/ から 2 階層上） */
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

/**
 * アプリケーション定義。
 * kustomize     … `kubectl apply -k` 対象ディレクトリ（ROOT からの相対）
 * namespace     … 状態確認・削除に使う namespace
 * createNs      … kustomize に Namespace が含まれない場合 true（apply 前に作成）
 * helm          … { chart, release } Helm デプロイ情報（任意）
 * k8sSecrets    … apply 前に生成する機密ファイル（{ path, content }、ROOT からの相対）
 * endpoints     … 動作確認用の案内
 */
const APPS = [
  {
    name: 'echo',
    label: 'echo（単一コンテナ）',
    kustomize: 'apps/echo/k8s/kustomize',
    namespace: 'echo',
    createNs: true,
    endpoints: ['kubectl -n echo port-forward svc/echo 18080:80 → http://localhost:18080/'],
    open: { svc: 'echo', port: 80, path: '/' },
  },
  {
    name: 'taskapp',
    label: 'taskapp（複数コンテナ）',
    kustomize: 'apps/taskapp/k8s/kustomize/base',
    namespace: 'taskapp',
    // kustomize は namespace: taskapp を指定するが Namespace リソースを含まないため、apply 前に作成する
    createNs: true,
    k8sSecrets: [
      { path: 'apps/taskapp/k8s/kustomize/base/mysql/secrets/mysql_root_password', content: 'rootpass' },
      { path: 'apps/taskapp/k8s/kustomize/base/mysql/secrets/mysql_user_password', content: 'taskapp_pass' },
      { path: 'apps/taskapp/k8s/kustomize/base/migrator/secrets/mysql_root_password', content: 'rootpass' },
      { path: 'apps/taskapp/k8s/kustomize/base/migrator/secrets/mysql_user_password', content: 'taskapp_pass' },
      {
        path: 'apps/taskapp/k8s/kustomize/base/api/api-config.yaml',
        content: 'database:\n  host: mysql\n  username: taskapp_user\n  password: taskapp_pass\n  dbname: taskapp\n  maxIdleConns: 5\n  maxOpenConns: 10\n  connMaxLifetime: 1h\n',
      },
    ],
    endpoints: ['kubectl -n taskapp port-forward svc/web 18080:80 → http://localhost:18080/'],
    open: { svc: 'web', port: 80, path: '/' },
  },
  {
    name: 'case1',
    label: 'ケーススタディ1 モノリス',
    kustomize: 'apps/case-studies/case-1-monolith/k8s/kustomize',
    namespace: 'cargo-monolith',
    endpoints: ['kubectl -n cargo-monolith port-forward svc/cargo-tracker 18080:80 → /actuator/health'],
    open: { svc: 'cargo-tracker', port: 80, path: '/' },
  },
  {
    name: 'case2',
    label: 'ケーススタディ2 イベント駆動マイクロサービス',
    kustomize: 'apps/case-studies/case-2-event-driven/k8s/kustomize/base',
    namespace: 'cargo-event',
    helm: { chart: 'apps/case-studies/case-2-event-driven/helm/cargo-event', release: 'cargo-event' },
    endpoints: ['kubectl -n cargo-event port-forward svc/gatewayms 18080:8080 → /actuator/health'],
    open: { svc: 'frontend', port: 80, path: '/' },
    frontend: { dep: 'frontend', container: 'frontend', repo: 'cargo2-frontend', context: 'apps/case-studies/case-2-event-driven/frontend' },
  },
  {
    name: 'case3',
    label: 'ケーススタディ3 ES/CQRS（Axon）',
    kustomize: 'apps/case-studies/case-3-escqrs-axon/k8s/kustomize/base',
    namespace: 'cargo-axon',
    helm: { chart: 'apps/case-studies/case-3-escqrs-axon/helm/cargo-axon', release: 'cargo-axon' },
    endpoints: ['kubectl -n cargo-axon port-forward svc/gatewayms 18080:8080 → /actuator/health'],
    open: { svc: 'frontend', port: 80, path: '/' },
    frontend: { dep: 'frontend', container: 'frontend', repo: 'cargo3-frontend', context: 'apps/case-studies/case-3-escqrs-axon/frontend' },
  },
  {
    name: 'case4',
    label: 'ケーススタディ4 ES/CQRS（Kafka）',
    kustomize: 'apps/case-studies/case-4-escqrs-kafka/k8s/overlays/local',
    namespace: 'cargo-tracker',
    helm: { chart: 'apps/case-studies/case-4-escqrs-kafka/helm/cargo-tracker', release: 'cargo' },
    endpoints: ['kubectl -n cargo-tracker port-forward svc/gatewayms 18080:8080 → /actuator/health'],
    open: { svc: 'frontendms', port: 80, path: '/' },
    frontend: { dep: 'frontendms', container: 'frontendms', repo: 'cargo-tracker/frontendms', context: 'apps/case-studies/case-4-escqrs-kafka/frontend' },
  },
];

// ============================================
// ヘルパー関数
// ============================================

/**
 * シェルコマンドを実行する
 * @param {string} command 実行するコマンド
 * @param {object} [options] オプション
 * @param {boolean} [options.ignoreError] エラーを無視するか
 */
function run(command, options = {}) {
  try {
    execSync(command, { stdio: 'inherit' });
  } catch (err) {
    if (options.ignoreError) return;
    console.error(`エラー: コマンドの実行に失敗しました: ${command}\n${err.message}`);
    process.exit(1);
  }
}

/**
 * kubectl が利用可能でクラスタに接続できるか確認する
 */
function requireCluster() {
  try {
    execSync('kubectl cluster-info', { stdio: 'ignore' });
  } catch {
    console.error('エラー: Kubernetes クラスタに接続できません。kubectl のコンテキストを確認してください。');
    process.exit(1);
  }
}

/**
 * apply 前に必要な機密ファイル（kustomize secretGenerator 用）を生成する
 * @param {object} app APPS の要素
 */
function ensureK8sSecrets(app) {
  (app.k8sSecrets || []).forEach((s) => {
    const dst = path.join(ROOT, s.path);
    if (existsSync(dst)) return;
    mkdirSync(path.dirname(dst), { recursive: true });
    writeFileSync(dst, s.content);
    console.log(`[${app.name}] 機密ファイルを生成しました: ${s.path}`);
  });
}

/**
 * frontend をユニークタグで再ビルドし、deployment のイメージを差し替える。
 * Docker Desktop の Kubernetes は同タグの再ビルドをキャッシュし取り込まないため、
 * 毎回ユニークなタグ（reload-<timestamp>）を付けて確実に最新コードを反映する。
 * @param {object} app APPS の要素（app.frontend が必要）
 */
function reloadFrontend(app) {
  const fe = app.frontend;
  const tag = `reload-${Date.now()}`;
  const image = `${fe.repo}:${tag}`;
  console.log(`[${app.name}] frontend を再ビルド: ${image}`);
  try {
    execSync(`docker build -t ${image} ${path.join(ROOT, fe.context)}`, {
      stdio: 'inherit',
      env: cleanDockerEnv(),
    });
  } catch (err) {
    console.error(`エラー: frontend のビルドに失敗しました\n${err.message}`);
    process.exit(1);
  }
  run(`kubectl -n ${app.namespace} set image deployment/${fe.dep} ${fe.container}=${image}`);
  run(`kubectl -n ${app.namespace} rollout status deployment/${fe.dep} --timeout=120s`, { ignoreError: true });
  console.log(`[${app.name}] frontend を ${image} に更新しました`);
}

/**
 * 起動後の案内を表示する
 * @param {object} app APPS の要素
 */
function printEndpoints(app) {
  console.log(`\n[${app.name}] 状態確認: kubectl -n ${app.namespace} get pods`);
  (app.endpoints || []).forEach((e) => console.log(`  - ${e}`));
}

// ============================================
// Gulp タスク
// ============================================

export default function (gulp) {
  APPS.forEach((app) => {
    // Kustomize 適用
    gulp.task(`k8s:${app.name}:apply`, (done) => {
      requireCluster();
      ensureK8sSecrets(app);
      if (app.createNs) {
        run(`kubectl create namespace ${app.namespace} --dry-run=client -o yaml | kubectl apply -f -`);
        run(`kubectl apply -k ${app.kustomize} -n ${app.namespace}`);
      } else {
        run(`kubectl apply -k ${app.kustomize}`);
      }
      // frontend は同タグだと旧イメージがキャッシュされるため、適用後に最新ビルドを反映する
      if (app.frontend) {
        reloadFrontend(app);
      }
      printEndpoints(app);
      done();
    });
    gulp.task(`k8s:${app.name}`, gulp.series(`k8s:${app.name}:apply`));

    // Kustomize 削除
    gulp.task(`k8s:${app.name}:delete`, (done) => {
      requireCluster();
      if (app.createNs) {
        run(`kubectl delete -k ${app.kustomize} -n ${app.namespace} --ignore-not-found`, { ignoreError: true });
        run(`kubectl delete namespace ${app.namespace} --ignore-not-found`, { ignoreError: true });
      } else {
        run(`kubectl delete -k ${app.kustomize} --ignore-not-found`, { ignoreError: true });
      }
      done();
    });

    // 状態確認
    gulp.task(`k8s:${app.name}:status`, (done) => {
      run(`kubectl -n ${app.namespace} get pods,svc,ingress`, { ignoreError: true });
      done();
    });

    // frontend をユニークタグで再ビルドして反映する
    // （Docker Desktop の Kubernetes は同タグの再ビルドをキャッシュし取り込まないため、
    //  毎回ユニークなタグを付けて kubectl set image で確実に差し替える）
    if (app.frontend) {
      gulp.task(`k8s:${app.name}:reload-frontend`, (done) => {
        requireCluster();
        reloadFrontend(app);
        done();
      });
    }

    // ブラウザで開く（port-forward しながらブラウザを起動。Ctrl+C で終了）
    if (app.open) {
      gulp.task(`k8s:${app.name}:open`, (done) => {
        requireCluster();
        const local = 18080;
        const url = `http://localhost:${local}${app.open.path}`;
        console.log(`[${app.name}] port-forward 中: ${url}（終了は Ctrl+C）`);
        const pf = spawn(
          'kubectl',
          ['-n', app.namespace, 'port-forward', `svc/${app.open.svc}`, `${local}:${app.open.port}`],
          { stdio: 'inherit' }
        );
        // port-forward の確立を待ってからブラウザを開く
        const timer = setTimeout(() => {
          try {
            openUrl(url);
          } catch {
            console.log(`ブラウザを開けませんでした。${url} を手動で開いてください。`);
          }
        }, 3000);
        pf.on('exit', () => {
          clearTimeout(timer);
          done();
        });
      });
    }

    // ビルド結果（適用前の確認）
    gulp.task(`k8s:${app.name}:build`, (done) => {
      ensureK8sSecrets(app);
      run(`kubectl kustomize ${app.kustomize}`);
      done();
    });

    // Helm（チャートを持つアプリのみ）
    if (app.helm) {
      gulp.task(`k8s:${app.name}:helm`, (done) => {
        requireCluster();
        run(`helm upgrade --install ${app.helm.release} ${app.helm.chart} --namespace ${app.namespace} --create-namespace`);
        printEndpoints(app);
        done();
      });
      gulp.task(`k8s:${app.name}:helm:delete`, (done) => {
        requireCluster();
        run(`helm uninstall ${app.helm.release} --namespace ${app.namespace}`, { ignoreError: true });
        done();
      });
    }
  });

  // ヘルプ
  gulp.task('k8s:help', (done) => {
    const lines = APPS.map((a) => {
      const helm = a.helm ? ' / :helm' : '';
      return `  k8s:${a.name}`.padEnd(28) + `${a.label}（ns: ${a.namespace}${helm}）`;
    }).join('\n');
    console.log(`
=== Kubernetes デプロイコマンド（apps/） ===

${lines}

  各アプリで利用できるアクション:
    k8s:<name>            Kustomize で適用（= :apply、必要な機密は自動生成）
    k8s:<name>:apply      Kustomize で適用（frontend は最新ビルドを自動反映）
    k8s:<name>:delete     Kustomize リソースを削除
    k8s:<name>:status     Pod / Service / Ingress を表示
    k8s:<name>:open       port-forward してブラウザで開く（Ctrl+C で終了）
    k8s:<name>:reload-frontend  frontend をユニークタグで再ビルドし反映（case2〜4）
    k8s:<name>:build      kubectl kustomize で生成結果を確認
    k8s:<name>:helm       Helm でデプロイ（チャートを持つアプリのみ）
    k8s:<name>:helm:delete  Helm リリースを削除

  例: npx gulp k8s:case4 で ES/CQRS（Kafka）を Kustomize デプロイ
      npx gulp k8s:case4:helm で同じ構成を Helm デプロイ
    `);
    done();
  });
}
