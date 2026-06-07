import sqlite3
c = sqlite3.connect("backend/test.db")
for row in c.execute(
    "SELECT id, status, pipeline_status, pipeline_failed_stage, order_id "
    "FROM direct_sale_sessions ORDER BY id DESC LIMIT 10"
):
    print(row)
