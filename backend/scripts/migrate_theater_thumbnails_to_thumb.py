"""一次性迁移：将 theater.thumbnail_url 改写为缩略图路径。

将形如 `/api/media/abc.png` 的 thumbnail_url 改写为 `/api/media/thumb/abc.png`，
其它形式（远端 URL、已是 thumb 路径、空值）一律原样保留，幂等可重复执行。

用法（在 backend 目录下执行）：
    python -m scripts.migrate_theater_thumbnails_to_thumb              # 真正写入
    python -m scripts.migrate_theater_thumbnails_to_thumb --dry-run    # 仅打印
"""
import argparse
import asyncio
import os
import sys

# 脚本位于 backend/scripts/，需将 backend 根目录加入 sys.path
_BACKEND_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), os.pardir))
sys.path.insert(0, _BACKEND_DIR)
sys.path.append(os.path.abspath(os.path.join(_BACKEND_DIR, "deps")))

from sqlalchemy import select

from database import AsyncSessionLocal
from models import Theater
from services.media_utils import to_thumb_url


async def migrate(dry_run: bool) -> None:
    async with AsyncSessionLocal() as session:
        result = await session.execute(
            select(Theater).where(Theater.thumbnail_url.isnot(None))
        )
        targets = list(result.scalars().all())
        print(f"扫描 {len(targets)} 个非空 thumbnail_url 剧场")

        updated = 0
        skipped = 0
        for theater in targets:
            current = theater.thumbnail_url or ""
            new_url = to_thumb_url(current)

            if new_url == current:
                skipped += 1
                continue

            print(f"  [rewrite] {theater.id} ({theater.title})")
            print(f"      {current} -> {new_url}")
            if not dry_run:
                theater.thumbnail_url = new_url
            updated += 1

        if dry_run:
            print(f"\n[DRY-RUN] 将改写 {updated} 条，跳过 {skipped} 条；未写库")
            return

        await session.commit()
        print(f"\n完成：改写 {updated} 条，跳过 {skipped} 条")


def main() -> None:
    parser = argparse.ArgumentParser(description="迁移剧场缩略图 URL 至 thumb 路径")
    parser.add_argument("--dry-run", action="store_true", help="仅打印不写库")
    args = parser.parse_args()
    asyncio.run(migrate(args.dry_run))


if __name__ == "__main__":
    main()
