"""ケーススタディ3（ES/CQRS Axon 版 Cargo Tracker）の Locust シナリオ。

第 12 章「12.3 負荷テスト」の senario.py を参考にしているが、現行 Locust API
（HttpUser / @task / between）で記述している。

gatewayms が JWT 認証を強制するため、on_start でログイン（POST /api/v1/auth/login）して
トークンを取得し、CQRS の Query 側（Read Model）読み取り GET に負荷をかける。

既定ユーザーは admin / password（README 記載のシードユーザー）。
対象ホストは compose.loadtest.yaml の LOCUST_HOST（既定: http://host.docker.internal:9081）。
"""

import os

from locust import HttpUser, between, task

USERNAME = os.getenv("LOGIN_USERNAME", "admin")
PASSWORD = os.getenv("LOGIN_PASSWORD", "password")


class CargoTrackerUser(HttpUser):
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
    def bookings(self):
        """予約一覧（Read Model: cargo_summary）。"""
        self.client.get(
            "/api/v1/bookings", headers=self.auth_headers, name="/api/v1/bookings"
        )

    @task(3)
    def shippers(self):
        """荷主一覧。"""
        self.client.get(
            "/api/v1/shippers", headers=self.auth_headers, name="/api/v1/shippers"
        )

    @task(3)
    def quotations(self):
        """見積一覧（Read Model）。"""
        self.client.get(
            "/api/v1/quotations", headers=self.auth_headers, name="/api/v1/quotations"
        )

    @task(4)
    def voyages(self):
        """航海一覧（Read Model）。"""
        self.client.get(
            "/api/v1/voyages", headers=self.auth_headers, name="/api/v1/voyages"
        )

    @task(3)
    def tracking(self):
        """追跡管理一覧（Read Model）。"""
        self.client.get(
            "/api/v1/tracking", headers=self.auth_headers, name="/api/v1/tracking"
        )

    @task(3)
    def invoices(self):
        """請求一覧（Read Model）。"""
        self.client.get(
            "/api/v1/billing/invoices",
            headers=self.auth_headers,
            name="/api/v1/billing/invoices",
        )

    @task(2)
    def invoices_overdue(self):
        """支払期限超過（督促）一覧。"""
        self.client.get(
            "/api/v1/billing/invoices/overdue",
            headers=self.auth_headers,
            name="/api/v1/billing/invoices/overdue",
        )
