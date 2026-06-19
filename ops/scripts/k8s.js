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
    endpoints: [
      'kubectl -n cargo-monolith port-forward svc/cargo-tracker 18080:80 → /actuator/health',
      'Kibana（ログ可視化）: kubectl -n cargo-monolith port-forward svc/kibana 18081:5601 → http://localhost:18081/（index pattern は自動作成済み。開くと Discover が表示される）',
      'Adminer（DB 管理）: kubectl -n cargo-monolith port-forward svc/adminer 18082:8080 → http://localhost:18082/（PostgreSQL / Server: postgres / cargo_tracker / cargo_tracker / DB: cargo_tracker）',
    ],
    open: { svc: 'cargo-tracker', port: 80, path: '/' },
    kibanaNodePort: 30051,
    consoles: [{ label: 'Adminer（DB 管理）', svc: 'adminer', port: 8080, note: '※System: PostgreSQL / Server: postgres / User-Pass: cargo_tracker / DB: cargo_tracker' }],
    // apply 時にアプリイメージをユニークタグで再ビルドして反映する（同タグ 0.0.1 のキャッシュ回避）
    // これにより delete → apply で最新ソース（Flyway V16 のシード含む）が確実にデプロイされる
    appImage: {
      repo: 'cargo-tracker',
      context: 'apps/case-studies/case-1-monolith/cargo-tracker',
      dep: 'cargo-tracker',
      container: 'cargo-tracker',
    },
    // シードは Flyway（V16__seed_demo_data.sql）でデプロイ時に自動投入される
    seed: {
      pod: 'deploy/postgres',
      user: 'cargo_tracker',
      db: 'cargo_tracker',
      table: 'cargo',
      detail: 'SELECT booking_status, count(*) FROM cargo GROUP BY booking_status ORDER BY 1;',
      expect: '貨物 8（CONFIRMED 3 / PRELIMINARY 3 / ROUTE_PROPOSED 2）',
    },
    // DB リセット: スキーマを drop → アプリ再起動で Flyway が全マイグレーション（V16 シード含む）を再適用
    reset: {
      databases: ['cargo_tracker'],
      restart: ['cargo-tracker'],
    },
  },
  {
    name: 'case2',
    label: 'ケーススタディ2 イベント駆動マイクロサービス',
    kustomize: 'apps/case-studies/case-2-event-driven/k8s/kustomize/base',
    namespace: 'cargo-event',
    helm: { chart: 'apps/case-studies/case-2-event-driven/helm/cargo-event', release: 'cargo-event' },
    endpoints: [
      'kubectl -n cargo-event port-forward svc/gatewayms 18080:8080 → /actuator/health',
      'Kibana（ログ可視化）: kubectl -n cargo-event port-forward svc/kibana 18081:5601 → http://localhost:18081/（index pattern は自動作成済み。開くと Discover が表示される）',
      'RabbitMQ 管理コンソール: kubectl -n cargo-event port-forward svc/rabbitmq 18082:15672 → http://localhost:18082/（ログイン: guest / guest）',
      'Adminer（DB 管理）: kubectl -n cargo-event port-forward svc/adminer 18083:8080 → http://localhost:18083/（PostgreSQL / Server: postgres / cargo_tracker / cargo_tracker / DB: booking_db 等）',
    ],
    open: { svc: 'frontend', port: 80, path: '/' },
    kibanaNodePort: 30052,
    consoles: [
      { label: 'RabbitMQ 管理コンソール', svc: 'rabbitmq', port: 15672, note: '※ログイン: guest / guest' },
      { label: 'Adminer（DB 管理）', svc: 'adminer', port: 8080, note: '※System: PostgreSQL / Server: postgres / User-Pass: cargo_tracker / DB: booking_db 等' },
    ],
    frontend: { dep: 'frontend', container: 'frontend', repo: 'cargo2-frontend', context: 'apps/case-studies/case-2-event-driven/frontend' },
    // シードは Flyway（V4__seed_cargos.sql 等）でデプロイ時に自動投入される
    seed: {
      pod: 'deploy/postgres',
      user: 'cargo_tracker',
      db: 'booking_db',
      table: 'cargo',
      detail: 'SELECT booking_status, count(*) FROM cargo GROUP BY booking_status ORDER BY 1;',
      expect: '貨物 8（CONFIRMED 3 / PRELIMINARY 3 / ROUTE_PROPOSED 2）',
    },
    // DB リセット: 6 つのサービス DB のスキーマを drop → 各 ms 再起動で Flyway がシード再適用
    reset: {
      databases: ['auth_db', 'booking_db', 'routing_db', 'tracking_db', 'handling_db', 'billing_db'],
      restart: ['authms', 'bookingms', 'routingms', 'trackingms', 'handlingms', 'billingms'],
    },
  },
  {
    name: 'case3',
    label: 'ケーススタディ3 ES/CQRS（Axon）',
    kustomize: 'apps/case-studies/case-3-escqrs-axon/k8s/kustomize/base',
    namespace: 'cargo-axon',
    helm: { chart: 'apps/case-studies/case-3-escqrs-axon/helm/cargo-axon', release: 'cargo-axon' },
    endpoints: [
      'kubectl -n cargo-axon port-forward svc/gatewayms 18080:8080 → /actuator/health',
      'Kibana（ログ可視化）: kubectl -n cargo-axon port-forward svc/kibana 18081:5601 → http://localhost:18081/（index pattern は自動作成済み。開くと Discover が表示される）',
      'Axon Server ダッシュボード: kubectl -n cargo-axon port-forward svc/axonserver 18082:8024 → http://localhost:18082/',
      'Adminer（DB 管理）: kubectl -n cargo-axon port-forward svc/adminer 18083:8080 → http://localhost:18083/（PostgreSQL / Server: postgres / cargo / cargo-dev-password / DB: booking_read_db 等）',
    ],
    open: { svc: 'frontend', port: 80, path: '/' },
    kibanaNodePort: 30053,
    consoles: [
      { label: 'Axon Server ダッシュボード', svc: 'axonserver', port: 8024 },
      { label: 'Adminer（DB 管理）', svc: 'adminer', port: 8080, note: '※System: PostgreSQL / Server: postgres / User: cargo / Pass: cargo-dev-password / DB: booking_read_db 等' },
    ],
    frontend: { dep: 'frontend', container: 'frontend', repo: 'cargo3-frontend', context: 'apps/case-studies/case-3-escqrs-axon/frontend' },
    // シードは DemoDataSeeder（local-docker プロファイル）が起動時に Axon コマンドで投入。投影は非同期
    seed: {
      pod: 'deploy/postgres',
      user: 'cargo',
      db: 'booking_read_db',
      table: 'cargo_summary',
      detail: 'SELECT booking_status, count(*) FROM cargo_summary GROUP BY booking_status ORDER BY 1;',
      expect: '予約 5',
    },
    // DB リセット: read DB スキーマを drop ＋ axonserver 再起動でイベントストア（ephemeral）も消去 →
    // ms 再起動で DemoDataSeeder が空のイベントストアに対して再投入（重複を防ぐ）
    reset: {
      databases: ['auth_db', 'booking_read_db', 'routing_read_db', 'tracking_read_db', 'handling_read_db', 'billing_read_db'],
      restart: ['axonserver', 'authms', 'bookingms', 'routingms', 'trackingms', 'handlingms', 'billingms'],
    },
  },
  {
    name: 'case4',
    label: 'ケーススタディ4 ES/CQRS（Kafka）',
    kustomize: 'apps/case-studies/case-4-escqrs-kafka/k8s/overlays/local',
    namespace: 'cargo-tracker',
    helm: { chart: 'apps/case-studies/case-4-escqrs-kafka/helm/cargo-tracker', release: 'cargo' },
    endpoints: [
      'kubectl -n cargo-tracker port-forward svc/gatewayms 18080:8080 → /actuator/health',
      'Kibana（ログ可視化）: kubectl -n cargo-tracker port-forward svc/kibana 18081:5601 → http://localhost:18081/（index pattern は自動作成済み。開くと Discover が表示される）',
      'Kafka UI: kubectl -n cargo-tracker port-forward svc/kafka-ui 18082:8080 → http://localhost:18082/',
      'Adminer（DB 管理）: kubectl -n cargo-tracker port-forward svc/adminer 18083:8080 → http://localhost:18083/（PostgreSQL / Server: postgresql / cargo / cargo-dev-password / DB: booking_read_db 等）',
    ],
    open: { svc: 'frontendms', port: 80, path: '/' },
    kibanaNodePort: 30054,
    consoles: [
      { label: 'Kafka UI', svc: 'kafka-ui', port: 8080 },
      { label: 'Adminer（DB 管理）', svc: 'adminer', port: 8080, note: '※System: PostgreSQL / Server: postgresql / User: cargo / Pass: cargo-dev-password / DB: booking_read_db 等' },
    ],
    frontend: { dep: 'frontendms', container: 'frontendms', repo: 'cargo-tracker/frontendms', context: 'apps/case-studies/case-4-escqrs-kafka/frontend' },
    // シードは DevDataSeeder（dev-seed プロファイル、overlays/local）が起動時に投入。投影は非同期
    // postgresql は StatefulSet のため Pod 名 postgresql-0 を直接指定する
    seed: {
      pod: 'postgresql-0',
      user: 'cargo',
      db: 'booking_read_db',
      table: 'cargo_summary',
      detail: 'SELECT booking_status, count(*) FROM cargo_summary GROUP BY booking_status ORDER BY 1;',
      expect: '予約 3',
    },
    // DB リセット: read DB スキーマを drop → ms 再起動で Flyway 再作成 + DevDataSeeder 再投入
    // （Kafka のコンシューマオフセットは保持されるため、新しいシードのみが投影される）
    reset: {
      databases: ['auth_db', 'booking_read_db', 'routing_read_db', 'tracking_read_db', 'handling_read_db', 'billing_read_db'],
      restart: ['authms', 'bookingms', 'routingms', 'trackingms', 'handlingms', 'billingms'],
    },
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
 * シェルコマンドを実行し標準出力を文字列で返す（失敗時は null）
 * @param {string} command 実行するコマンド
 * @returns {string|null}
 */
function runCapture(command) {
  try {
    return execSync(command, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  } catch {
    return null;
  }
}

/**
 * 同期的に指定ミリ秒だけ待機する（クロスプラットフォーム）
 * @param {number} ms 待機時間（ミリ秒）
 */
function sleepSync(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
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
 * イメージをユニークタグで再ビルドし、deployment のイメージを差し替える。
 * Docker Desktop の Kubernetes は同タグの再ビルドをキャッシュし取り込まないため、
 * 毎回ユニークなタグ（reload-<timestamp>）を付けて確実に最新コードを反映する。
 * @param {object} app APPS の要素
 * @param {object} img { repo, context, dep, container, dockerfile? }
 * @param {string} label 表示用ラベル（例: 'frontend' / 'アプリ'）
 */
function rebuildAndSetImage(app, img, label) {
  const tag = `reload-${Date.now()}`;
  const image = `${img.repo}:${tag}`;
  const dockerfile = img.dockerfile ? `-f ${path.join(ROOT, img.dockerfile)} ` : '';
  console.log(`[${app.name}] ${label} を再ビルド: ${image}`);
  try {
    execSync(`docker build -t ${image} ${dockerfile}${path.join(ROOT, img.context)}`, {
      stdio: 'inherit',
      env: cleanDockerEnv(),
    });
  } catch (err) {
    console.error(`エラー: ${label} のビルドに失敗しました\n${err.message}`);
    process.exit(1);
  }
  run(`kubectl -n ${app.namespace} set image deployment/${img.dep} ${img.container}=${image}`);
  run(`kubectl -n ${app.namespace} rollout status deployment/${img.dep} --timeout=180s`, { ignoreError: true });
  console.log(`[${app.name}] ${label} を ${image} に更新しました`);
}

/** frontend をユニークタグで再ビルドして反映する（app.frontend が必要） */
function reloadFrontend(app) {
  rebuildAndSetImage(app, app.frontend, 'frontend');
}

/** アプリ（バックエンド）イメージをユニークタグで再ビルドして反映する（app.appImage が必要） */
function reloadApp(app) {
  rebuildAndSetImage(app, app.appImage, 'アプリ');
}

/**
 * シードデータの投入を確認する（読み取りモデルへの投影完了まで最大 2 分待機）。
 * @param {object} app APPS の要素（app.seed が必要）
 * @returns {boolean} 1 件以上確認できたら true
 */
function verifySeed(app) {
  const s = app.seed;
  const countCmd = `kubectl -n ${app.namespace} exec ${s.pod} -- psql -U ${s.user} -d ${s.db} -tAc "SELECT count(*) FROM ${s.table}"`;
  const maxAttempts = 24; // 最大 24 回 × 5 秒 ≒ 2 分（Pod 起動・非同期投影を待つ）
  const intervalMs = 5000;
  console.log(`[${app.name}] シードデータの投入を確認します（${s.db}.${s.table}、期待: ${s.expect}）`);
  let count = 0;
  for (let i = 1; i <= maxAttempts; i += 1) {
    const out = runCapture(countCmd);
    const n = out == null ? NaN : parseInt(out.trim(), 10);
    if (Number.isFinite(n) && n > 0) {
      count = n;
      break;
    }
    const reason = out == null ? 'DB 未接続 / Pod 未起動' : `現在 ${Number.isFinite(n) ? n : 0} 件`;
    console.log(`  待機中... (${i}/${maxAttempts}) ${reason}`);
    if (i < maxAttempts) sleepSync(intervalMs);
  }
  if (count === 0) return false;
  console.log(`\n[${app.name}] シード確認 OK: ${s.table} = ${count} 件（期待: ${s.expect}）`);
  run(`kubectl -n ${app.namespace} exec ${s.pod} -- psql -U ${s.user} -d ${s.db} -c "${s.detail}"`, { ignoreError: true });
  return true;
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
      // 同タグだと旧イメージがキャッシュされるため、適用後にユニークタグで最新ビルドを反映する
      if (app.appImage) {
        reloadApp(app);
      }
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

    // アプリ（バックエンド）をユニークタグで再ビルドして反映する（同タグキャッシュ回避）
    if (app.appImage) {
      gulp.task(`k8s:${app.name}:reload`, (done) => {
        requireCluster();
        reloadApp(app);
        done();
      });
    }

    // ブラウザで開く（アプリと管理コンソールを port-forward して開く。Ctrl+C で終了）
    // NodePort は kind 等では localhost に転送されないため、確実な port-forward を使う。
    if (app.open) {
      gulp.task(`k8s:${app.name}:open`, (done) => {
        requireCluster();
        const local = 18080;
        const url = `http://localhost:${local}${app.open.path}`;
        // 追加コンソール（Kibana・RabbitMQ・Axon Server 等）。ローカルポートは 18081 から順に割り当てる。
        const declared = [];
        if (app.kibanaNodePort) {
          declared.push({ label: 'Kibana（ログ可視化）', svc: 'kibana', port: 5601, note: '※index pattern は自動作成済み（開くと Discover が表示される）' });
        }
        (app.consoles || []).forEach((c) => declared.push({ label: c.label, svc: c.svc, port: c.port, note: c.note || '' }));
        // 負荷テスト（Locust）をデプロイ済みなら Web UI（8089）も開く。
        // 未デプロイなら下のフィルタで svc/locust が見つからずスキップされる。
        declared.push({
          label: 'Locust（負荷テスト Web UI）',
          svc: 'locust',
          port: 8089,
          localPort: 8089,
          note: `※負荷テストをデプロイ済みの場合のみ（npx gulp loadtest:${app.name}:k8s）`,
        });
        // 未デプロイのコンソール（svc が存在しない）はスキップして警告する。
        // これがないと存在しない svc への port-forward が失敗し、ローカルポートが死んでしまう。
        const consoles = declared.filter((c) => {
          const found = runCapture(`kubectl -n ${app.namespace} get svc ${c.svc} -o name`);
          if (!found || !found.trim()) {
            console.log(`[${app.name}] ${c.label} はスキップ（svc/${c.svc} が未デプロイ）`);
            return false;
          }
          return true;
        });
        // 固定ローカルポート（localPort、例: Locust の 8089）はそのまま使い、
        // それ以外は 18081 から順に割り当てる。
        let seq = 18081;
        consoles.forEach((c) => {
          c.local = c.localPort || seq++;
          c.url = `http://localhost:${c.local}/`;
        });
        console.log(`[${app.name}] port-forward 中: ${url}（終了は Ctrl+C）`);
        consoles.forEach((c) => console.log(`[${app.name}] ${c.label}: ${c.url}${c.note ? '   ' + c.note : ''}`));
        const pf = spawn(
          'kubectl',
          ['-n', app.namespace, 'port-forward', `svc/${app.open.svc}`, `${local}:${app.open.port}`],
          { stdio: 'inherit' }
        );
        // 各コンソールも port-forward（NodePort に依存しない）。アプリ終了時に一緒に止める。
        // stderr を監視し、ポート使用中で bind に失敗したら警告する（古い別 port-forward が
        // 残っていると、その localhost ポートに別コンソールが繋がったまま見えてしまうため）。
        const cpfs = consoles.map((c) => {
          const cp = spawn('kubectl', ['-n', app.namespace, 'port-forward', `svc/${c.svc}`, `${c.local}:${c.port}`], {
            stdio: ['ignore', 'ignore', 'pipe'],
          });
          cp.stderr.on('data', (buf) => {
            if (/Unable to listen|address already in use|bind/i.test(String(buf))) {
              console.log(`[${app.name}] 警告: ${c.label} の port-forward に失敗（ポート ${c.local} 使用中）。`);
              console.log(`         既存の port-forward を停止してから再実行してください: npx gulp killports`);
            }
          });
          return cp;
        });
        // port-forward の確立を待ってからブラウザを開く（アプリと各コンソール）
        const timer = setTimeout(() => {
          [url, ...consoles.map((c) => c.url)].forEach((u) => {
            try {
              openUrl(u);
            } catch {
              console.log(`ブラウザを開けませんでした。${u} を手動で開いてください。`);
            }
          });
        }, 3000);
        pf.on('exit', () => {
          clearTimeout(timer);
          cpfs.forEach((p) => {
            try {
              p.kill();
            } catch {
              /* noop */
            }
          });
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

    // シードデータの投入を確認（読み取りモデルへの投影完了まで待機）
    // デプロイ時に Flyway / 各 Seeder が自動投入するため、本タスクは投入結果を検証する。
    if (app.seed) {
      gulp.task(`k8s:${app.name}:seed`, (done) => {
        requireCluster();
        if (!verifySeed(app)) {
          console.error('エラー: シードデータを確認できませんでした。考えられる原因:');
          console.error('  1. Pod が未起動 / 読み取りモデルへの投影が未完了 → しばらく待って再実行');
          console.error('  2. デプロイ済みイメージがシード追加前で古い（Flyway 未適用 / Seeder 未発火）');
          console.error(`     → アプリイメージを再ビルドし kubectl -n ${app.namespace} rollout restart で再起動後に再実行`);
          process.exit(1);
        }
        done();
      });
    }

    // DB をリセットして再シードする
    // DB スキーマを drop（Flyway 履歴も消える）→ アプリ/ms を再起動して Flyway・各 Seeder で再投入。
    // ES/CQRS（case-3）は ephemeral なイベントストア（axonserver）も再起動して重複を防ぐ。
    if (app.reset && app.seed) {
      gulp.task(`k8s:${app.name}:reset`, (done) => {
        requireCluster();
        const r = app.reset;
        const s = app.seed;
        console.log(`[${app.name}] DB をリセットします: ${r.databases.join(', ')}`);
        r.databases.forEach((db) => {
          // 接続を切ってからスキーマを作り直す（public スキーマごと drop で Flyway 履歴も消える）
          const sql =
            'SELECT pg_terminate_backend(pid) FROM pg_stat_activity ' +
            "WHERE datname = current_database() AND pid <> pg_backend_pid(); " +
            `DROP SCHEMA public CASCADE; CREATE SCHEMA public; GRANT ALL ON SCHEMA public TO ${s.user};`;
          run(`kubectl -n ${app.namespace} exec ${s.pod} -- psql -U ${s.user} -d ${db} -c "${sql}"`, { ignoreError: true });
        });
        console.log(`[${app.name}] 再起動してスキーマ再作成・シード再投入: ${r.restart.join(', ')}`);
        r.restart.forEach((dep) => run(`kubectl -n ${app.namespace} rollout restart deployment/${dep}`, { ignoreError: true }));
        r.restart.forEach((dep) =>
          run(`kubectl -n ${app.namespace} rollout status deployment/${dep} --timeout=180s`, { ignoreError: true }),
        );
        if (!verifySeed(app)) {
          console.error('エラー: リセット後にシードを確認できませんでした。Pod 起動・投影完了を待って k8s:' + app.name + ':seed で再確認してください。');
          process.exit(1);
        }
        console.log(`\n[${app.name}] DB リセット & シード完了`);
        done();
      });
    }

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

  // 残留している kubectl port-forward プロセスを一括停止する
  // （Windows では :open を強制終了した際などに port-forward が残り、同じローカルポートを
  //  握ったままになることがある。次の :open が別コンソールに繋がる事故を防ぐ）
  gulp.task('k8s:killports', (done) => {
    const cmd =
      process.platform === 'win32'
        ? 'powershell -NoProfile -Command "Get-CimInstance Win32_Process | Where-Object { $_.Name -eq \'kubectl.exe\' -and $_.CommandLine -like \'*port-forward*\' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }"'
        : "pkill -f 'kubectl.*port-forward'";
    run(cmd, { ignoreError: true });
    console.log('停止しました: 残留している kubectl port-forward プロセス');
    done();
  });

  // ヘルプ
  gulp.task('k8s:help', (done) => {
    const lines = APPS.map((a) => {
      const extras = [a.helm ? ':helm' : null, a.seed ? ':seed' : null].filter(Boolean).join(' / ');
      const suffix = extras ? ` / ${extras}` : '';
      return `  k8s:${a.name}`.padEnd(28) + `${a.label}（ns: ${a.namespace}${suffix}）`;
    }).join('\n');
    console.log(`
=== Kubernetes デプロイコマンド（apps/） ===

${lines}

  各アプリで利用できるアクション:
    k8s:<name>            Kustomize で適用（= :apply、必要な機密は自動生成）
    k8s:<name>:apply      Kustomize で適用（frontend は最新ビルドを自動反映）
    k8s:<name>:delete     Kustomize リソースを削除
    k8s:<name>:status     Pod / Service / Ingress を表示
    k8s:<name>:open       アプリと管理コンソール（Kibana / RabbitMQ / Axon Server / Locust 8089 等）を port-forward して開く（Ctrl+C で終了）
    k8s:<name>:reload     アプリイメージをユニークタグで再ビルドし反映（case1）
    k8s:<name>:reload-frontend  frontend をユニークタグで再ビルドし反映（case2〜4）
    k8s:<name>:build      kubectl kustomize で生成結果を確認
    k8s:<name>:seed       シードデータの投入を確認（投影完了まで待機、cargo 系のみ）
    k8s:<name>:reset      DB をリセットして再シード（スキーマ drop → 再起動 → 再投入）
    k8s:<name>:helm       Helm でデプロイ（チャートを持つアプリのみ）
    k8s:<name>:helm:delete  Helm リリースを削除

  共通:
    k8s:killports         残留している kubectl port-forward プロセスを一括停止

  例: npx gulp k8s:case4 で ES/CQRS（Kafka）を Kustomize デプロイ
      npx gulp k8s:case4:helm で同じ構成を Helm デプロイ
      npx gulp k8s:case4:seed でシードデータの投入を確認
    `);
    done();
  });
}
