"""老数据回填：为 thumbnail_url 为空的剧场挑选首张媒体节点 URL。

复用 services/theater.py 中的 _THUMBNAIL_EXTRACTORS 选择规则，
按 z_index 升序取首张 image/video 节点 URL 写入 theater.thumbnail_url。

用法（在 backend 目录下执行）：
    python -m scripts.backfill_theater_thumbnails              # 真正写入
    python -m scripts.backfill_theater_thumbnails --dry-run    # 仅打印不写库
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
from models import Theater, TheaterNode
from services.theater import _THUMBNAIL_EXTRACTORS  # 复用同一份取值器


def _pick_thumbnail_from_orm_nodes(nodes) -> str | None:
    """从 ORM 节点中按 z_index 升序挑首张媒体 URL。

    与 services.theater._pick_thumbnail_from_nodes 行为一致，
    仅签名差异：这里接收 ORM TheaterNode 实例。
    """
    sorted_nodes = sorted(nodes, key=lambda n: (n.z_index or 0))
    for node in sorted_nodes:
        extractor = _THUMBNAIL_EXTRACTORS.get(node.node_type)
        data = node.data or {}
        url = extractor and extractor(data)
        if url:
            return url
    return None


async def backfill(dry_run: bool) -> None:
    async with AsyncSessionLocal() as session:
        result = await session.execute(
            select(Theater).where(Theater.thumbnail_url.is_(None))
        )
        targets = list(result.scalars().all())
        print(f"找到 {len(targets)} 个待回填剧场")

        updated = 0
        skipped = 0
        for theater in targets:
            nodes_result = await session.execute(
                select(TheaterNode).where(TheaterNode.theater_id == theater.id)
            )
            nodes = list(nodes_result.scalars().all())
            url = _pick_thumbnail_from_orm_nodes(nodes)

            if not url:
                skipped += 1
                print(f"  [skip] {theater.id} ({theater.title}) -> 无媒体节点")
                continue

            print(f"  [pick] {theater.id} ({theater.title}) -> {url}")
            if not dry_run:
                theater.thumbnail_url = url
            updated += 1

        if dry_run:
            print(f"\n[DRY-RUN] 将更新 {updated} 条，跳过 {skipped} 条；未写库")
            return

        await session.commit()
        print(f"\n完成：更新 {updated} 条，跳过 {skipped} 条")


def main() -> None:
    parser = argparse.ArgumentParser(description="回填剧场缩略图 URL")
    parser.add_argument("--dry-run", action="store_true", help="仅打印不写库")
    args = parser.parse_args()
    asyncio.run(backfill(args.dry_run))


if __name__ == "__main__":
    main()
