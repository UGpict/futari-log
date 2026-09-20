# UI fixtures

`NEXT_PUBLIC_USE_API_FIXTURES=true` かつ `NEXT_PUBLIC_APP_RUNTIME` が LIVE でないときだけクライアントが使う。
サーバーの LIVE 判定は fixture が立っていると LIVE にならない。
Cloud Run / 本番の env に載せない。
