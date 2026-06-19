"""ケーススタディ1（モノリス版 Cargo Tracker）の Locust 負荷テストシナリオ。

第 12 章「12.3 負荷テスト」の senario.py を参考にしているが、Locust の旧 API
（HttpLocust / TaskSet）は現行バージョンで廃止されているため、現行 API
（HttpUser / @task / between）で記述している。

モノリス版は Spring Security のフォームログイン（セッション + CSRF）で保護されている。
ここでは認証不要（permitAll）の GET エンドポイントのみを対象とし、ホストに依存しない
安全な読み取り負荷をかける。ログイン後の画面（/、/bookings 等）に負荷をかけたい場合は
on_start で /login の CSRF トークンを取得して POST /login する拡張が必要になる。

対象ホストは compose.loadtest.yaml の LOCUST_HOST（既定: http://host.docker.internal:18080）。
"""

import os

from locust import HttpUser, between, task

# 公開追跡の詳細画面で使う追跡番号。未指定なら詳細タスクはスキップする
# （存在しない番号は 404 になり、失敗としてカウントされてしまうため）。
TRACKING_NUMBER = os.getenv("TRACKING_NUMBER", "").strip()


class CargoTrackerUser(HttpUser):
    # 各タスクの実行間隔。記事の min_wait=5s / max_wait=10s に相当する。
    wait_time = between(5, 10)

    @task(3)
    def health(self):
        """ヘルスチェック（最軽量・DB 非依存に近い）。"""
        self.client.get("/actuator/health", name="/actuator/health")

    @task(5)
    def login_page(self):
        """ログイン画面（静的に近い HTML レンダリング）。"""
        self.client.get("/login", name="/login")

    @task(5)
    def public_tracking(self):
        """公開追跡の検索画面（認証不要の HTML）。"""
        self.client.get("/public/tracking", name="/public/tracking")

    @task(2)
    def public_tracking_detail(self):
        """公開追跡の詳細（DB 読み取りを含む）。有効な追跡番号がある場合のみ実行。"""
        if not TRACKING_NUMBER:
            return
        self.client.get(
            f"/public/tracking/{TRACKING_NUMBER}",
            name="/public/tracking/{trackingNumber}",
        )
