"""Background task queue (arq).

设计要点：
- 默认 backend=memory（不入队，保持现状）；切到 arq 时通过 settings.QUEUE_BACKEND="arq" 启用
- enqueue API 永远可调用：未启用时无操作返回 None，启用时投递到 arq Redis
- WorkerSettings 在 `tasks_queue.worker` 中定义，独立进程运行： `arq tasks_queue.worker.WorkerSettings`
- 不与 FastAPI 进程混跑，避免阻塞事件循环
"""
from tasks_queue.client import get_pool, enqueue, close_pool
from tasks_queue import tasks  # noqa: F401  -- 触发任务注册

__all__ = ["get_pool", "enqueue", "close_pool"]
