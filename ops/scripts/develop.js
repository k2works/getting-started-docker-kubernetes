'use strict';

/**
 * アプリケーション開発タスク
 *
 * apps/ 配下の各アプリケーションを Docker / Docker Compose で起動・停止・ビルドする。
 * 機密ファイル（Docker secrets）は up 前に *.example から自動生成する。
 */

import path from 'path';
import { existsSync, copyFileSync } from 'fs';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';
import { cleanDockerEnv, isDockerAvailable } from './shared.js';

// ============================================
// 設定
// ============================================

/** リポジトリルート（ops/scripts/ から 2 階層上） */
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

/**
 * Docker Compose ベースのアプリケーション定義。
 * dir       … compose.yaml を含むディレクトリ（ROOT からの相対）
 * secrets   … up 前に用意する機密ファイル（{ file, example } の配列、example から複製）
 * setupCmd  … secrets が *.example を持たない場合の生成コマンド
 * endpoints … 起動後に案内する URL
 */
const COMPOSE_APPS = [
  {
    name: 'echo',
    label: 'echo（単一コンテナ）',
    dir: 'apps/echo',
    secrets: [],
    endpoints: ['http://localhost:9000/ （Host: echo.gihyo.local）'],
  },
  {
    name: 'taskapp',
    label: 'taskapp（複数コンテナ）',
    dir: 'apps/taskapp',
    secrets: [
      { file: 'secrets/mysql_root_password' },
      { file: 'secrets/mysql_user_password' },
      { file: 'api-config.yaml' },
    ],
    setupCmd: 'bash hack/setup-local.sh',
    endpoints: ['http://localhost:9280/ （Web）', 'http://localhost:9180/ （API, Host: api）'],
  },
  {
    name: 'case1',
    label: 'ケーススタディ1 モノリス',
    dir: 'apps/case-studies/case-1-monolith/compose',
    secrets: [{ file: 'secrets/db_password', example: 'secrets/db_password.example' }],
    endpoints: ['http://localhost:18080/actuator/health'],
  },
  {
    name: 'case2',
    label: 'ケーススタディ2 イベント駆動マイクロサービス',
    dir: 'apps/case-studies/case-2-event-driven/compose',
    secrets: [{ file: 'secrets/db_password', example: 'secrets/db_password.example' }],
    endpoints: ['http://localhost:9080/actuator/health （gateway）', 'http://localhost:9090/ （frontend）'],
  },
  {
    name: 'case3',
    label: 'ケーススタディ3 ES/CQRS（Axon）',
    dir: 'apps/case-studies/case-3-escqrs-axon/compose',
    secrets: [
      { file: 'secrets/db_password', example: 'secrets/db_password.example' },
      { file: 'secrets/jwt_secret', example: 'secrets/jwt_secret.example' },
    ],
    endpoints: ['http://localhost:9081/actuator/health （gateway）', 'http://localhost:8024/ （Axon Server）', 'http://localhost:9091/ （frontend）'],
  },
  {
    name: 'case4',
    label: 'ケーススタディ4 ES/CQRS（Kafka）',
    dir: 'apps/case-studies/case-4-escqrs-kafka/compose',
    secrets: [
      { file: 'secrets/db_password', example: 'secrets/db_password.example' },
      { file: 'secrets/jwt_secret', example: 'secrets/jwt_secret.example' },
    ],
    endpoints: ['http://localhost:9082/actuator/health （gateway）', 'http://localhost:9092/ （frontend）'],
  },
];

/**
 * 単体 Docker イメージのアプリ定義（compose を持たないもの）。
 * context … docker build コンテキスト（ROOT からの相対）
 * port    … ホストへ公開するポート（run 時）
 */
const DOCKER_APPS = [
  {
    name: 'image-bootstrap',
    label: 'image-bootstrap（distroless 非 root イメージ）',
    image: 'image-bootstrap:local',
    context: 'apps/image-bootstrap',
    port: 8090,
    containerPort: 8080,
  },
];

/** container-kit のビルド対象（ユーティリティイメージ群） */
const CONTAINER_KIT = [
  { name: 'debug', image: 'ck-debug:local', context: 'apps/container-kit/containers/debug' },
  { name: 'simple-nginx-proxy', image: 'ck-nginx-proxy:local', context: 'apps/container-kit/containers/simple-nginx-proxy' },
  { name: 'time-limit-job', image: 'ck-time-limit-job:local', context: 'apps/container-kit/containers/time-limit-job' },
];

// ============================================
// ヘルパー関数
// ============================================

/**
 * シェルコマンドを実行する（DOCKER_HOST を除外した環境で実行）
 * @param {string} command 実行するコマンド
 * @param {string} [cwd] 作業ディレクトリ（ROOT からの相対）
 */
function run(command, cwd) {
  const options = { stdio: 'inherit', env: cleanDockerEnv() };
  if (cwd) options.cwd = path.join(ROOT, cwd);
  try {
    execSync(command, options);
  } catch (err) {
    console.error(`エラー: コマンドの実行に失敗しました: ${command}\n${err.message}`);
    process.exit(1);
  }
}

/**
 * Docker が利用可能かを確認し、不可なら終了する
 */
function requireDocker() {
  if (!isDockerAvailable()) {
    console.error('エラー: Docker デーモンに接続できません。Docker Desktop 等を起動してください。');
    process.exit(1);
  }
}

/**
 * アプリ起動前に必要な機密ファイルを用意する
 * @param {object} app COMPOSE_APPS の要素
 */
function ensureSecrets(app) {
  const missing = (app.secrets || []).filter(
    (s) => !existsSync(path.join(ROOT, app.dir, s.file))
  );
  if (missing.length === 0) return;

  // *.example を持たない場合は setupCmd で一括生成
  const hasExamples = missing.every((s) => s.example);
  if (!hasExamples) {
    if (app.setupCmd) {
      console.log(`[${app.name}] 機密ファイルを生成します: ${app.setupCmd}`);
      run(app.setupCmd, app.dir);
    } else {
      console.error(`エラー: [${app.name}] 機密ファイルが不足しています: ${missing.map((s) => s.file).join(', ')}`);
      process.exit(1);
    }
    return;
  }

  for (const s of missing) {
    const src = path.join(ROOT, app.dir, s.example);
    const dst = path.join(ROOT, app.dir, s.file);
    if (!existsSync(src)) {
      console.error(`エラー: [${app.name}] ${s.example} が見つかりません`);
      process.exit(1);
    }
    copyFileSync(src, dst);
    console.log(`[${app.name}] ${s.file} を ${s.example} から作成しました`);
  }
}

/**
 * 起動後のエンドポイント案内を表示する
 * @param {object} app COMPOSE_APPS の要素
 */
function printEndpoints(app) {
  if (!app.endpoints || app.endpoints.length === 0) return;
  console.log(`\n[${app.name}] アクセス先:`);
  app.endpoints.forEach((e) => console.log(`  - ${e}`));
  console.log('  ※ サービスの起動完了まで時間がかかる場合があります（healthcheck を参照）');
}

// ============================================
// Gulp タスク
// ============================================

export default function (gulp) {
  // -- Docker Compose アプリ -------------------------------------------------
  COMPOSE_APPS.forEach((app) => {
    // ケーススタディの compose ディレクトリ名はいずれも "compose" のため、
    // プロジェクト名を明示してアプリ間の衝突（orphan 警告）を防ぐ。
    const compose = `docker compose -p dev-${app.name}`;

    // 起動（dev:<name> / dev:<name>:up）
    const up = (done) => {
      requireDocker();
      ensureSecrets(app);
      run(`${compose} up -d`, app.dir);
      printEndpoints(app);
      done();
    };
    gulp.task(`dev:${app.name}:up`, up);
    gulp.task(`dev:${app.name}`, up);

    // 停止・破棄（ボリュームも削除）
    gulp.task(`dev:${app.name}:down`, (done) => {
      requireDocker();
      run(`${compose} down -v`, app.dir);
      done();
    });

    // ビルド
    gulp.task(`dev:${app.name}:build`, (done) => {
      requireDocker();
      run(`${compose} build`, app.dir);
      done();
    });

    // ログ
    gulp.task(`dev:${app.name}:logs`, (done) => {
      run(`${compose} logs -f --tail=100`, app.dir);
      done();
    });

    // 状態
    gulp.task(`dev:${app.name}:ps`, (done) => {
      run(`${compose} ps`, app.dir);
      done();
    });
  });

  // -- 単体 Docker アプリ（image-bootstrap） ---------------------------------
  DOCKER_APPS.forEach((app) => {
    gulp.task(`dev:${app.name}:build`, (done) => {
      requireDocker();
      run(`docker build -t ${app.image} .`, app.context);
      done();
    });

    const up = (done) => {
      requireDocker();
      run(
        `docker run -d --rm --name ${app.name} -p ${app.port}:${app.containerPort} ${app.image}`,
        app.context
      );
      console.log(`[${app.name}] http://localhost:${app.port}/`);
      done();
    };
    gulp.task(`dev:${app.name}:up`, up);
    gulp.task(`dev:${app.name}`, up);

    gulp.task(`dev:${app.name}:down`, (done) => {
      requireDocker();
      run(`docker rm -f ${app.name} || true`);
      done();
    });
  });

  // -- container-kit（ユーティリティイメージのビルド） -----------------------
  CONTAINER_KIT.forEach((c) => {
    gulp.task(`dev:container-kit:build:${c.name}`, (done) => {
      requireDocker();
      run(`docker build -t ${c.image} .`, c.context);
      done();
    });
  });
  gulp.task(
    'dev:container-kit:build',
    gulp.series(...CONTAINER_KIT.map((c) => `dev:container-kit:build:${c.name}`))
  );

  // -- ヘルプ ----------------------------------------------------------------
  gulp.task('dev:help', (done) => {
    const composeList = COMPOSE_APPS.map((a) => `  dev:${a.name}`.padEnd(28) + a.label).join('\n');
    console.log(`
=== アプリケーション開発コマンド（apps/） ===

[Docker Compose アプリ]
${composeList}

  各アプリで利用できるアクション:
    dev:<name>            起動（= dev:<name>:up、機密ファイルは自動生成）
    dev:<name>:up         起動
    dev:<name>:down       停止・破棄（ボリュームも削除）
    dev:<name>:build      イメージをビルド
    dev:<name>:logs       ログを表示（follow）
    dev:<name>:ps         コンテナ状態を表示

[単体 Docker アプリ]
  dev:image-bootstrap          起動（http://localhost:8090/）
  dev:image-bootstrap:build    イメージをビルド
  dev:image-bootstrap:down     停止

[ユーティリティイメージ]
  dev:container-kit:build      debug / simple-nginx-proxy / time-limit-job を一括ビルド

  例: npx gulp dev:case4 で ES/CQRS（Kafka）スタックを起動
    `);
    done();
  });
}
