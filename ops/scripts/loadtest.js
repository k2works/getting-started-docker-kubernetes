'use strict';

/**
 * 負荷テストタスク（Locust）
 *
 * 各ケーススタディに同梱した Locust 構成（loadtest/compose.loadtest.yaml）を起動・停止する。
 * アプリ本体は dev:<case> で先に起動し、gateway/app をホストポートに公開しておくこと。
 * Locust は別 Compose として独立しており、host.docker.internal 経由でホスト公開ポートに
 * 負荷をかける（第 12 章「12.3 負荷テスト」を参照）。
 */

import path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';
import { cleanDockerEnv, isDockerAvailable, openUrl } from './shared.js';

/** リポジトリルート（ops/scripts/ から 2 階層上） */
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

/**
 * 負荷テスト対象の定義。
 * dir    … compose.loadtest.yaml を含む loadtest ディレクトリ（ROOT からの相対）
 * target … 既定の負荷対象 URL（アプリ本体のホスト公開ポート）
 */
const LOADTESTS = [
  {
    name: 'case1',
    label: 'ケーススタディ1 モノリス',
    dir: 'apps/case-studies/case-1-monolith/loadtest',
    target: 'http://host.docker.internal:18080',
  },
  {
    name: 'case2',
    label: 'ケーススタディ2 イベント駆動マイクロサービス',
    dir: 'apps/case-studies/case-2-event-driven/loadtest',
    target: 'http://host.docker.internal:9080',
  },
  {
    name: 'case3',
    label: 'ケーススタディ3 ES/CQRS（Axon）',
    dir: 'apps/case-studies/case-3-escqrs-axon/loadtest',
    target: 'http://host.docker.internal:9081',
  },
  {
    name: 'case4',
    label: 'ケーススタディ4 ES/CQRS（Kafka）',
    dir: 'apps/case-studies/case-4-escqrs-kafka/loadtest',
    target: 'http://host.docker.internal:9082',
  },
];

const COMPOSE_FILE = 'compose.loadtest.yaml';

/**
 * シェルコマンドを実行する（DOCKER_HOST を除外した環境で実行）
 * @param {string} command 実行するコマンド
 * @param {string} [cwd] 作業ディレクトリ（ROOT からの相対）
 * @param {object} [options] オプション（ignoreError でエラーを無視）
 */
function run(command, cwd, options = {}) {
  const execOptions = { stdio: 'inherit', env: cleanDockerEnv() };
  if (cwd) execOptions.cwd = path.join(ROOT, cwd);
  try {
    execSync(command, execOptions);
  } catch (err) {
    if (options.ignoreError) return;
    console.error(`エラー: コマンドの実行に失敗しました: ${command}\n${err.message}`);
    process.exit(1);
  }
}

/** Docker が利用可能かを確認し、不可なら終了する */
function requireDocker() {
  if (!isDockerAvailable()) {
    console.error('エラー: Docker デーモンに接続できません。Docker Desktop 等を起動してください。');
    process.exit(1);
  }
}

export default function (gulp) {
  LOADTESTS.forEach((lt) => {
    // ケース間でプロジェクト名が衝突しないよう明示する。
    const compose = `docker compose -p loadtest-${lt.name} -f ${COMPOSE_FILE}`;

    // Web UI 起動（loadtest:<name> / loadtest:<name>:up）
    const up = (done) => {
      requireDocker();
      run(`${compose} up -d`, lt.dir);
      const url = 'http://localhost:8089';
      console.log(`\n[${lt.name}] Locust Web UI: ${url}`);
      console.log(`[${lt.name}] 負荷対象（既定）: ${lt.target}`);
      console.log(`[${lt.name}] ※アプリ本体が未起動なら先に npx gulp dev:${lt.name} を実行してください`);
      console.log(`[${lt.name}] 停止: npx gulp loadtest:${lt.name}:down`);
      // UI の起動を待ってからブラウザを開く
      setTimeout(() => {
        try {
          openUrl(url);
        } catch {
          console.log(`ブラウザを開けませんでした。${url} を手動で開いてください。`);
        }
        done();
      }, 2000);
    };
    gulp.task(`loadtest:${lt.name}:up`, up);
    gulp.task(`loadtest:${lt.name}`, up);

    // ヘッドレス実行（UI なしで一定時間実行して終了）
    // 環境変数で上書き可能: USERS / SPAWN / DURATION
    gulp.task(`loadtest:${lt.name}:headless`, (done) => {
      requireDocker();
      const users = process.env.USERS || '50';
      const spawn = process.env.SPAWN || '5';
      const duration = process.env.DURATION || '1m';
      console.log(`[${lt.name}] ヘッドレス実行: ${users} ユーザー / 毎秒 ${spawn} 増 / ${duration}`);
      run(
        `${compose} run --rm locust --headless -u ${users} -r ${spawn} -t ${duration}`,
        lt.dir,
        { ignoreError: true },
      );
      // run --rm では残らないが、念のため後片付けする
      run(`${compose} down`, lt.dir, { ignoreError: true });
      done();
    });

    // 停止・破棄
    gulp.task(`loadtest:${lt.name}:down`, (done) => {
      requireDocker();
      run(`${compose} down`, lt.dir, { ignoreError: true });
      done();
    });

    // ログ
    gulp.task(`loadtest:${lt.name}:logs`, (done) => {
      run(`${compose} logs -f --tail=100`, lt.dir, { ignoreError: true });
      done();
    });
  });

  // ヘルプ
  gulp.task('loadtest:help', (done) => {
    const list = LOADTESTS.map(
      (lt) => `  loadtest:${lt.name}`.padEnd(28) + `${lt.label}（対象: ${lt.target}）`,
    ).join('\n');
    console.log(`
=== 負荷テストコマンド（Locust / apps/case-studies/*/loadtest） ===

${list}

  各ケースで利用できるアクション:
    loadtest:<name>            Locust Web UI を起動（= :up、http://localhost:8089）
    loadtest:<name>:up         Locust Web UI を起動
    loadtest:<name>:headless   UI なしで一定時間実行して終了（USERS/SPAWN/DURATION で調整）
    loadtest:<name>:down       Locust を停止・破棄
    loadtest:<name>:logs       Locust のログを表示（follow）

  前提:
    アプリ本体を先に起動しておくこと（例: npx gulp dev:case4）。
    Locust はホスト公開ポートへ host.docker.internal 経由で負荷をかける。

  例: npx gulp dev:case4 && npx gulp loadtest:case4
      USERS=100 SPAWN=10 DURATION=3m npx gulp loadtest:case4:headless
    `);
    done();
  });
}
