# Worker

`PLAN_ORCHESTRATOR=worker` のとき PENDING run を lease して `server/agent/execute` を回す。
Cloud Run の workflows モードでは起動しない。HTTP ハンドラにビジネスロジックを置かない。
