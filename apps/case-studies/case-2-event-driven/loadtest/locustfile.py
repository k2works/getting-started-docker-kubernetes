"""ケーススタディ2（イベント駆動マイクロサービス版 Cargo Tracker）の Locust シナリオ。

第 12 章「12.3 負荷テスト」の senario.py を参考にしているが、現行 Locust API
（HttpUser / @task / between）で記述している。

このケースは gatewayms が JWT 認証を強制するため、業務系の GET は Bearer トークンが
必要になる。そこで on_start でログイン（POST /api/v1/auth/login）してトークンを取得し、
以降の読み取り系 GET に Authorization ヘッダを付けて負荷をかける。

既定ユーザーはシード済みの admin / password（authms の V3__seed_users.sql）。
対象ホストは compose.loadtest.yaml の LOCUST_HOST（既定: http://host.docker.internal:9080）。
"""

import os

from locust import HttpUser, between, task

USERNAME = os.getenv("LOGIN_USERNAME", "admin")
PASSWORD = os.getenv("LOGIN_PASSWORD", "password")


class CargoTrackerUser(HttpUser):
    # 各タスクの実行間隔（API 主体なので記事より短め）。
    wait_time = between(1, 3)

    def on_start(self):
        """ログインして JWT を取得する。失敗時はトークンなしで続行する。"""
        self.token = None
        with self.client.post(
            "/api/v1/auth/login",
            json={"username": USERNAME, "password": PASSWORD},
            name="/api/v1/auth/login",
            catch_response=True,
        ) as res:
            if res.status_code == 200:
                data = res.json() if res.text else {}
                self.token = data.get("token") or data.get("accessToken")
                if self.token:
                    res.success()
                else:
                    res.failure("token がレスポンスに含まれていません")
            else:
                res.failure(f"ログイン失敗: HTTP {res.status_code}")

    @property
    def auth_headers(self):
        return {"Authorization": f"Bearer {self.token}"} if self.token else {}

    @task(1)
    def health(self):
        """gateway 自身のヘルスチェック（認証不要）。"""
        self.client.get("/actuator/health", name="/actuator/health")

    @task(5)
    def cargos(self):
        """貨物予約一覧（Read 系）。"""
        self.client.get(
            "/api/booking/v1/cargos",
            headers=self.auth_headers,
            name="/api/booking/v1/cargos",
        )

    @task(4)
    def shippers(self):
        """荷主一覧（Read 系）。"""
        self.client.get(
            "/api/booking/v1/shippers",
            headers=self.auth_headers,
            name="/api/booking/v1/shippers",
        )

    @task(4)
    def voyages(self):
        """航海一覧（Read 系）。"""
        self.client.get(
            "/api/routing/v1/voyages",
            headers=self.auth_headers,
            name="/api/routing/v1/voyages",
        )

    @task(2)
    def routing_assignments(self):
        """経路設計対象（CONFIRMED）一覧（Read 系）。"""
        self.client.get(
            "/api/booking/v1/cargos/routing-assignments",
            headers=self.auth_headers,
            name="/api/booking/v1/cargos/routing-assignments",
        )
