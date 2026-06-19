"""ケーススタディ4（ES/CQRS Kafka 版 Cargo Tracker）の Locust シナリオ。

第 12 章「12.3 負荷テスト」の senario.py を参考にしているが、現行 Locust API
（HttpUser / @task / between）で記述している。

このケースは local-docker プロファイルで起動するため gatewayms / 各 ms の Spring Security
認可が無効になり、gateway 経由の GET はすべて匿名でアクセスできる。そのため CQRS の
Query 側（Read Model）読み取りに直接負荷をかけられる。

対象ホストは compose.loadtest.yaml の LOCUST_HOST（既定: http://host.docker.internal:9082）。
"""

from locust import HttpUser, between, task


class CargoTrackerUser(HttpUser):
    wait_time = between(1, 3)

    @task(1)
    def health(self):
        """gateway 自身のヘルスチェック。"""
        self.client.get("/actuator/health", name="/actuator/health")

    @task(5)
    def bookings(self):
        """予約一覧（Read Model、ページング）。"""
        self.client.get(
            "/api/v1/bookings?page=0&size=20", name="/api/v1/bookings"
        )

    @task(3)
    def shippers(self):
        """荷主一覧（ページング）。"""
        self.client.get(
            "/api/v1/shippers?page=0&size=20", name="/api/v1/shippers"
        )

    @task(3)
    def quotes(self):
        """見積一覧（ページング）。"""
        self.client.get("/api/v1/quotes?page=0&size=20", name="/api/v1/quotes")

    @task(4)
    def voyages(self):
        """航海一覧。"""
        self.client.get("/api/v1/voyages", name="/api/v1/voyages")

    @task(2)
    def design_requests(self):
        """経路設計待ち一覧（CQRS Query）。"""
        self.client.get(
            "/api/v1/routes/design-requests", name="/api/v1/routes/design-requests"
        )

    @task(3)
    def tracking(self):
        """追跡サマリ一覧（Read Model、ページング）。"""
        self.client.get(
            "/api/v1/tracking?page=0&size=20", name="/api/v1/tracking"
        )

    @task(3)
    def handling(self):
        """荷役作業一覧（ページング）。"""
        self.client.get(
            "/api/v1/handling?page=0&size=20", name="/api/v1/handling"
        )

    @task(3)
    def invoices(self):
        """請求一覧（Read Model、ページング）。"""
        self.client.get(
            "/api/v1/billing/invoices?page=0&size=20", name="/api/v1/billing/invoices"
        )

    @task(2)
    def invoices_overdue(self):
        """督促（支払期限超過）一覧。"""
        self.client.get(
            "/api/v1/billing/invoices/overdue", name="/api/v1/billing/invoices/overdue"
        )
